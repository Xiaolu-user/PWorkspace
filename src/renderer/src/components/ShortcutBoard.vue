<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { LocalEntry } from '../../../shared/planner'
import { UNCATEGORIZED, categoryLabel, cleanCategories, mergeCategories, normalizeCategory, scopeCount, scopeItems, shortcutItems, usedCategories, validCategoryName, MAX_CATEGORIES } from '../../../shared/shortcuts'
import { useWorkspace } from '../stores/workspace'
import { confirmDelete, openLink, report, unwrap } from '../lib/api'
import AppIcon from './AppIcon.vue'
const props = defineProps<{ entries: LocalEntry[]; categories: string[] }>()
const emit = defineEmits<{ changed: [] }>()
const ws = useWorkspace()
const scope = ref('all')
const items = computed(() => shortcutItems(props.entries, ws.bookmarks))
// Saved order first, then categories still referenced by restored or older data.
const tags = computed(() => mergeCategories(props.categories, usedCategories(items.value)))
const visible = computed(() => scopeItems(items.value, scope.value))
const countOf = (key: string): number => scopeCount(items.value, key)
const scopeLabel = computed(() => scope.value === 'all' ? '全部' : scope.value === 'app' ? '应用' : scope.value === 'web' ? '网页' : scope.value)
watch(tags, list => { if (scope.value !== 'all' && scope.value !== 'app' && scope.value !== 'web' && !list.includes(scope.value)) scope.value = 'all' })
const tintOf = (index: number): string => 'tint-' + index % 4
// Adding a category inline keeps the tag row in one place instead of another dialog.
const creating = ref(false); const newCategory = ref(''); const categoryInput = ref<HTMLInputElement>()
function startCreate(): void {
  if (tags.value.length >= MAX_CATEGORIES) { ElMessage.warning(`分类最多 ${MAX_CATEGORIES} 个`); return }
  creating.value = true; nextTick(() => categoryInput.value?.focus())
}
async function saveTags(list: string[]): Promise<boolean> {
  try { unwrap(await window.workbench.shortcuts.saveCategories(list)); emit('changed'); return true }
  catch (error) { report(error); return false }
}
async function commitCategory(): Promise<void> {
  const name = normalizeCategory(newCategory.value)
  if (!name) { creating.value = false; newCategory.value = ''; return }
  try { validCategoryName(name, tags.value) } catch (error) { ElMessage.warning((error as Error).message); return }
  if (await saveTags([...tags.value, name])) { creating.value = false; newCategory.value = ''; ElMessage.success(`已创建分类“${name}”，把图标拖到标签上即可归入`) }
}
const manageOpen = ref(false)
const manageList = ref<string[]>([])
function openManage(): void { manageList.value = [...tags.value]; manageOpen.value = true }
async function renameTag(name = ''): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('分类名称最多 12 个字', name ? '重命名分类' : '新建分类', {
      inputValue: name, confirmButtonText: '保存', cancelButtonText: '取消',
      inputValidator: (input: string) => { try { validCategoryName(input, tags.value.filter(item => item !== name)); return true } catch (error) { return (error as Error).message } }
    })
    const next = validCategoryName(value, tags.value.filter(item => item !== name))
    if (!name) {
      if (!await saveTags([...tags.value, next])) return
      manageList.value = cleanCategories([...manageList.value, next])
      ElMessage.success(`已创建分类“${next}”`)
      return
    }
    unwrap(await window.workbench.shortcuts.renameCategory(name, next))
    if (scope.value === name) scope.value = next
    manageList.value = manageList.value.map(item => item === name ? next : item)
    emit('changed'); ElMessage.success('分类已改名')
  } catch (error) { if (error !== 'cancel' && error !== 'close') report(error) }
}
async function removeTag(name: string): Promise<void> {
  const used = countOf(name)
  try { await ElMessageBox.confirm(`删除分类“${name}”？${used ? `其中 ${used} 个快捷方式会回到「${UNCATEGORIZED}」，` : ''}条目本身不会被删除。`, '删除分类', { confirmButtonText: '删除', cancelButtonText: '取消', confirmButtonClass: 'danger-confirm' }) }
  catch { return }
  try {
    unwrap(await window.workbench.shortcuts.removeCategory(name))
    manageList.value = manageList.value.filter(item => item !== name)
    if (scope.value === name) scope.value = 'all'
    emit('changed'); ElMessage.success('分类已删除')
  } catch (error) { report(error) }
}
// Ordering is stored so the tag row stays where the user put it.
const dragIndex = ref(-1)
function moveTag(from: number, to: number): void {
  if (to < 0 || to >= manageList.value.length || from === to) return
  const next = [...manageList.value]; next.splice(to, 0, ...next.splice(from, 1))
  manageList.value = next
  void saveTags(next)
}
function manageDrop(index: number): void { const from = dragIndex.value; dragIndex.value = -1; if (from >= 0) moveTag(from, index) }
async function assign(item: ReturnType<typeof shortcutItems>[number], category: string): Promise<void> {
  if (item.category === category) return
  try {
    if (item.kind === 'app') unwrap(await window.workbench.shortcuts.assign(item.id, category))
    else {
      const bookmark = ws.bookmarks.find(entry => entry.id === item.id)
      if (!bookmark) return
      unwrap(await window.workbench.bookmarks.update(item.id, { title: bookmark.title, url: bookmark.url, group: category || UNCATEGORIZED }))
    }
    ElMessage.success(`已归入“${categoryLabel(category)}”`)
    emit('changed')
  } catch (error) { report(error) }
}
function command(item: ReturnType<typeof shortcutItems>[number], value: string): void {
  if (value === 'icon') { void refreshIcon(item); return }
  if (value === 'remove') { void remove(item); return }
  if (value.startsWith('move:')) void assign(item, value.slice(5))
}
async function refreshIcon(item: { id: string; title: string }): Promise<void> {
  try {
    const icon = unwrap(await window.workbench.shortcuts.refreshIcon(item.id))
    emit('changed')
    if (icon) ElMessage.success('已重新提取图标')
    else ElMessage.warning('这个应用没有可用的图标，已显示通用图标')
  } catch (error) { report(error) }
}
async function remove(item: { id: string; title: string; kind: 'app' | 'web' }): Promise<void> {
  if (!await confirmDelete(item.title)) return
  try {
    if (item.kind === 'web') unwrap(await window.workbench.bookmarks.remove(item.id))
    else unwrap(await window.workbench.planner.remove(item.id))
    ElMessage.success('已移除')
    emit('changed')
  } catch (error) { report(error) }
}
async function open(item: { id: string; kind: 'app' | 'web'; url: string }): Promise<void> {
  if (item.kind === 'web') { await openLink(item.url); return }
  try { unwrap(await window.workbench.planner.open(item.id)) } catch (error) { report(error) }
}
async function pickApp(): Promise<void> {
  try { unwrap(await window.workbench.planner.pick('app', scope.value === 'all' || scope.value === 'app' || scope.value === 'web' ? '' : scope.value)); emit('changed') }
  catch (error) { report(error) }
}
// ---------- 添加网页 ----------
const linkOpen = ref(false); const linkTitle = ref(''); const linkUrl = ref(''); const savingLink = ref(false)
function openLinkDialog(): void { linkTitle.value = ''; linkUrl.value = ''; linkOpen.value = true }
async function saveLink(): Promise<void> {
  if (savingLink.value) return
  savingLink.value = true
  try {
    const group = scope.value === 'all' || scope.value === 'app' || scope.value === 'web' ? UNCATEGORIZED : scope.value
    unwrap(await window.workbench.bookmarks.create({ title: linkTitle.value, url: linkUrl.value, group }))
    ElMessage.success('快捷方式已添加'); linkOpen.value = false; emit('changed')
  } catch (error) { report(error) } finally { savingLink.value = false }
}
// ---------- 拖动归类 ----------
const dragging = ref('')
function tileDragStart(event: DragEvent, item: { key: string; title: string }): void {
  if (!event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('application/x-wb-shortcut', item.key)
  event.dataTransfer.setData('text/plain', item.title)
  dragging.value = item.key
}
const hoverTag = ref('')
function tagDragOver(event: DragEvent, key: string): void {
  if (!dragging.value || ['all', 'app', 'web'].includes(key)) return
  event.preventDefault(); hoverTag.value = key
}
async function tagDrop(event: DragEvent, key: string): Promise<void> {
  if (!dragging.value || ['all', 'app', 'web'].includes(key)) return
  event.preventDefault()
  const item = items.value.find(entry => entry.key === dragging.value)
  hoverTag.value = ''; dragging.value = ''
  if (item) await assign(item, key)
}
// ---------- 从桌面拖入 ----------
const dropping = ref(false); let dragDepth = 0
const hasFiles = (event: DragEvent): boolean => [...(event.dataTransfer?.types || [])].includes('Files')
function dragEnter(event: DragEvent): void { if (!hasFiles(event)) return; event.preventDefault(); dragDepth++; dropping.value = true }
function dragOver(event: DragEvent): void { if (!hasFiles(event)) return; event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy' }
function dragLeave(): void { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dropping.value = false }
const dropTarget = computed(() => scope.value === 'all' || scope.value === 'app' || scope.value === 'web' ? UNCATEGORIZED : scope.value)
async function drop(event: DragEvent): Promise<void> {
  if (!hasFiles(event)) return
  event.preventDefault(); dragDepth = 0; dropping.value = false
  const files = [...(event.dataTransfer?.files || [])]
  const paths = files.map(file => window.workbench.filePath(file)).filter(Boolean)
  if (!paths.length) { ElMessage.warning('没有读到文件位置，请从桌面或资源管理器中拖入快捷方式'); return }
  const target = scope.value === 'all' || scope.value === 'app' || scope.value === 'web' ? '' : scope.value
  try {
    const result = unwrap(await window.workbench.shortcuts.import(paths, target))
    const added = result.added + result.links
    const skipped = result.skipped.length + (files.length - paths.length)
    const parts: string[] = []
    if (added) parts.push(`已添加 ${added} 个`)
    if (result.duplicates) parts.push(`跳过 ${result.duplicates} 个重复项`)
    if (skipped) parts.push(`跳过 ${skipped} 个不支持的文件`)
    if (added) ElMessage.success(parts.join('，') || '已添加')
    else ElMessage.warning(parts.join('，') || '没有可添加的快捷方式')
    if (added) { scope.value = target || scope.value; emit('changed') }
  } catch (error) { report(error) }
}
</script>
<template>
  <section class="home-card shortcut-card" :style="ws.moduleStyle('shortcuts')" @dragenter="dragEnter" @dragover="dragOver" @dragleave="dragLeave" @drop="drop">
    <header class="shortcut-toolbar">
      <span class="card-label"><AppIcon name="grid" />快捷方式</span>
      <el-dropdown trigger="click" @command="(value: string) => value === 'app' ? pickApp() : value === 'web' ? openLinkDialog() : openManage()">
        <button class="outline-button">＋ 添加</button>
        <template #dropdown><el-dropdown-menu><el-dropdown-item command="app">添加应用</el-dropdown-item><el-dropdown-item command="web">添加网页</el-dropdown-item><el-dropdown-item command="manage" divided>管理分类</el-dropdown-item></el-dropdown-menu></template>
      </el-dropdown>
    </header>
    <div class="shortcut-tags" role="tablist" aria-label="快捷方式分类">
      <button class="shortcut-tag" :class="{ active: scope === 'all' }" role="tab" :aria-selected="scope === 'all'" @click="scope = 'all'">全部<i>{{ countOf('all') }}</i></button>
      <button class="shortcut-tag" :class="{ active: scope === 'app' }" role="tab" :aria-selected="scope === 'app'" @click="scope = 'app'">应用<i>{{ countOf('app') }}</i></button>
      <button class="shortcut-tag" :class="{ active: scope === 'web' }" role="tab" :aria-selected="scope === 'web'" @click="scope = 'web'">网页<i>{{ countOf('web') }}</i></button>
      <button v-for="tag in tags" :key="tag" class="shortcut-tag" :class="{ active: scope === tag, over: hoverTag === tag }" role="tab" :aria-selected="scope === tag" draggable="true" @click="scope = tag" @dragenter.prevent="tagDragOver($event, tag)" @dragover.prevent="tagDragOver($event, tag)" @dragleave="hoverTag = ''" @drop="tagDrop($event, tag)">{{ tag }}<i>{{ countOf(tag) }}</i></button>
      <input v-if="creating" ref="categoryInput" v-model="newCategory" class="shortcut-tag-input" aria-label="新分类名称" placeholder="新分类" maxlength="12" @keydown.enter.prevent="commitCategory" @keydown.esc.prevent="creating = false; newCategory = ''" @blur="commitCategory" />
      <button v-else class="shortcut-tag-add" aria-label="新建分类" title="新建分类" @click="startCreate"><AppIcon name="plus" :size="12" /></button>
    </div>
    <div class="shortcut-grid">
      <div v-for="(item, index) in visible" :key="item.key" class="shortcut-tile" :class="{ dragging: dragging === item.key }">
        <button class="shortcut-open" draggable="true" :title="item.hint" @dragstart="tileDragStart($event, item)" @dragend="dragging = ''" @click="open(item)">
          <img v-if="item.icon" :src="item.icon" alt="" />
          <span v-else-if="item.kind === 'web'" class="shortcut-monogram" :class="tintOf(index)">{{ item.title.slice(0, 1).toUpperCase() }}</span>
          <span v-else class="shortcut-generic" aria-hidden="true"><AppIcon name="monitor" :size="15" /></span>
          <span>{{ item.title }}</span>
        </button>
        <el-dropdown trigger="click" placement="bottom-end" @command="(value: string) => command(item, value)">
          <button class="shortcut-more" :aria-label="'管理 ' + item.title"><AppIcon name="more" :size="12" /></button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="target in [{ value: '', label: UNCATEGORIZED }, ...tags.map(name => ({ value: name, label: name }))]" :key="'move-' + target.value" :command="'move:' + target.value" :class="{ 'is-current': item.category === target.value }">归入 {{ target.label }}<span v-if="item.category === target.value" class="menu-check">✓</span></el-dropdown-item>
              <el-dropdown-item v-if="item.kind === 'app'" command="icon" divided>重新提取图标</el-dropdown-item>
              <el-dropdown-item command="remove" divided>移除</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
      <button v-if="visible.length < 24" class="shortcut-placeholder" :aria-label="scope === 'web' ? '添加网页快捷方式' : '添加应用快捷方式'" @click="scope === 'web' ? openLinkDialog() : pickApp()"><AppIcon name="plus" :size="18" /><span>添加</span></button>
    </div>
    <p v-if="!items.length" class="home-caption">把常用应用和网页放在这里：点击“添加”，或直接把桌面上的快捷方式拖进来。</p>
    <p v-else-if="!visible.length" class="home-caption">“{{ scopeLabel }}”里还没有快捷方式，把图标拖到上方分类上即可归入。</p>
    <p v-else class="home-caption">共 {{ items.length }} 个快捷方式 · 拖动图标到分类上即可归入，也可直接从桌面拖入文件。</p>
    <div v-if="dropping" class="shortcut-drop" aria-hidden="true">
      <div class="shortcut-drop-inner">
        <span class="shortcut-drop-icon"><AppIcon name="download" :size="20" /></span>
        <strong>松开即可添加</strong>
        <p>将添加到 <em>{{ dropTarget }}</em></p>
        <small>支持 .lnk / .exe / .url 与网页链接，重复的会自动跳过</small>
      </div>
    </div>
  </section>
  <el-dialog v-model="linkOpen" title="添加网页快捷方式" width="440px" :close-on-click-modal="false">
    <el-form label-position="top" :disabled="savingLink" @submit.prevent="saveLink">
      <el-form-item label="名称"><el-input v-model="linkTitle" maxlength="200" placeholder="例如：GitHub" /></el-form-item>
      <el-form-item label="网址"><el-input v-model="linkUrl" maxlength="4096" placeholder="https://" @keydown.enter="saveLink" /></el-form-item>
    </el-form>
    <template #footer><el-button @click="linkOpen = false">取消</el-button><el-button type="primary" :loading="savingLink" :disabled="!linkTitle.trim() || !linkUrl.trim()" @click="saveLink">添加</el-button></template>
  </el-dialog>
  <el-dialog v-model="manageOpen" title="管理分类" width="440px">
    <p class="shortcut-manage-hint">拖动行可以调整标签顺序；删除分类不会删除其中的快捷方式。</p>
    <div class="shortcut-manage">
      <div v-for="(name, index) in manageList" :key="name" class="shortcut-manage-row" :class="{ dragging: dragIndex === index }" draggable="true" @dragstart="dragIndex = index" @dragover.prevent @drop="manageDrop(index)" @dragend="dragIndex = -1">
        <span class="drag-handle" aria-hidden="true">⋮⋮</span>
        <strong>{{ name }}</strong><small>{{ countOf(name) }} 个</small>
        <button class="text-link" @click="renameTag(name)">改名</button>
        <button class="text-link danger" @click="removeTag(name)">删除</button>
      </div>
      <p v-if="!manageList.length" class="shortcut-manage-empty">还没有自定义分类。新建后可以把图标拖到标签上归类。</p>
    </div>
    <template #footer><el-button @click="renameTag('')">＋ 新建分类</el-button><el-button type="primary" @click="manageOpen = false">完成</el-button></template>
  </el-dialog>
</template>
