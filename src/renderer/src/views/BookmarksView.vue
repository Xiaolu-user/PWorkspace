<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { Bookmark, BookmarkInput } from '../../../shared/types'
import { useWorkspace } from '../stores/workspace'
import { confirmDelete, openLink } from '../lib/api'
import AppIcon from '../components/AppIcon.vue'
import EmptyState from '../components/EmptyState.vue'
const workspace = useWorkspace(); const route = useRoute()
const group = ref(''); const query = ref(''); const dialog = ref(false); const saving = ref(false)
const selected = ref<Bookmark | null>(null); const page = ref(1); const pageSize = 18
const form = reactive<BookmarkInput>({ title: '', url: '', group: '' })
function setVisible(value: boolean): void { if (!saving.value) dialog.value = value }
const groups = computed(() => [...new Set(workspace.bookmarks.map(item => item.group))].sort((a, b) => a.localeCompare(b, 'zh-CN')))
const filtered = computed(() => workspace.bookmarks.filter(item => (!group.value || item.group === group.value) && (item.title + '\n' + item.url).toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())))
const visible = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))
watch([group, query], () => { page.value = 1 })
watch(() => filtered.value.length, length => { page.value = Math.min(page.value, Math.max(1, Math.ceil(length / pageSize))) })
function edit(item: Bookmark | null): void { selected.value = item; Object.assign(form, item ? { title: item.title, url: item.url, group: item.group } : { title: '', url: '', group: group.value }); dialog.value = true }
async function submit(): Promise<void> {
  if (saving.value) return
  if (!form.title.trim()) { ElMessage.warning('请填写链接名称'); return }
  try { const url = new URL(form.url); if (!['http:', 'https:'].includes(url.protocol)) throw new Error() } catch { ElMessage.warning('请输入以 http:// 或 https:// 开头的网址'); return }
  saving.value = true
  const input = { ...form }
  const ok = await workspace.mutate(() => selected.value ? window.workbench.bookmarks.update(selected.value.id, input) : window.workbench.bookmarks.create(input), selected.value ? '链接已更新' : '链接已收藏')
  saving.value = false
  if (ok) dialog.value = false
}
async function remove(item: Bookmark): Promise<void> { if (await confirmDelete(item.title)) await workspace.mutate(() => window.workbench.bookmarks.remove(item.id), '链接已删除') }
function hostname(url: string): string { try { return new URL(url).hostname } catch { return url } }
let opened = ''
watch([() => route.query.id, () => route.query.new, () => workspace.revision], () => {
  const key = typeof route.query.id === 'string' ? route.query.id : route.query.new ? 'new' : ''
  if (!key) { opened = ''; return }
  if (key === opened) return
  if (key === 'new') { edit(null); opened = key }
  else { const item = workspace.bookmarks.find(bookmark => bookmark.id === key); if (item) { edit(item); opened = key } }
}, { immediate: true })
</script>
<template>
  <div class="section-toolbar"><div class="filter-tools"><el-input v-model="query" placeholder="查找链接" clearable aria-label="查找链接"><template #prefix><AppIcon name="search" :size="17" /></template></el-input><el-select v-model="group" aria-label="链接分组" style="width:160px"><el-option label="全部分组" value="" /><el-option v-for="name in groups" :key="name" :label="name" :value="name" /></el-select></div><el-button type="primary" @click="edit(null)"><AppIcon name="plus" :size="17" />添加链接</el-button></div>
  <div v-if="visible.length" class="bookmark-grid"><article v-for="(bookmark, index) in visible" :key="bookmark.id" class="bookmark-card"><div class="bookmark-top"><span class="link-letter" :class="['green', 'blue', 'amber', 'purple'][index % 4]">{{ bookmark.title.slice(0, 1).toUpperCase() }}</span><span class="group-tag">{{ bookmark.group }}</span><div class="bookmark-actions"><button class="icon-button" aria-label="编辑链接" @click="edit(bookmark)"><AppIcon name="edit" :size="17" /></button><button class="icon-button delete-button" aria-label="删除链接" @click="remove(bookmark)"><AppIcon name="delete" :size="17" /></button></div></div><button class="bookmark-open" @click="openLink(bookmark.url)"><strong>{{ bookmark.title }}</strong><p>{{ hostname(bookmark.url) }}</p><span>打开网站 <AppIcon name="right" :size="14" /></span></button></article></div>
  <section v-else class="panel"><EmptyState icon="link" :title="workspace.bookmarks.length ? '没有符合条件的链接' : '收藏你的常用网站'" :description="workspace.bookmarks.length ? '试着调整分组或搜索词。' : '把工作、学习和生活中的好去处，收进自己的空间。'" :action="workspace.bookmarks.length ? '' : '添加第一个链接'" @action="edit(null)" /></section>
  <div class="list-footer standalone"><span>共 {{ filtered.length }} 个链接 · 在默认浏览器中打开</span><el-pagination v-if="filtered.length > pageSize" v-model:current-page="page" :page-size="pageSize" :total="filtered.length" layout="prev, pager, next" /></div>
  <el-dialog :model-value="dialog" :title="selected ? '编辑链接' : '收藏一个好去处'" width="500px" :close-on-click-modal="false" :close-on-press-escape="!saving" :show-close="!saving" @update:model-value="setVisible"><el-form label-position="top" :disabled="saving" @submit.prevent="submit"><el-form-item label="链接名称" required><el-input v-model="form.title" maxlength="200" placeholder="例如：我的学习资料" /></el-form-item><el-form-item label="网址" required><el-input v-model="form.url" maxlength="4096" placeholder="https://" /></el-form-item><el-form-item label="分组"><el-select v-model="form.group" filterable allow-create default-first-option placeholder="选择或输入分组（选填）" style="width:100%"><el-option v-for="name in groups" :key="name" :label="name" :value="name" /></el-select></el-form-item></el-form><template #footer><el-button :disabled="saving" @click="dialog = false">取消</el-button><el-button type="primary" :loading="saving" @click="submit">{{ selected ? '保存修改' : '收藏链接' }}</el-button></template></el-dialog>
</template>
