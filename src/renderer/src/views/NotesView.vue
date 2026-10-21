<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWorkspace } from '../stores/workspace'
import { useEditor } from '../stores/editor'
import { confirmDelete, formatTime, report, unwrap } from '../lib/api'
import AppIcon from '../components/AppIcon.vue'
import EmptyState from '../components/EmptyState.vue'
const workspace = useWorkspace(); const editor = useEditor(); const route = useRoute(); const router = useRouter()
const query = ref(''); const limit = ref(40); const deleting = ref(false)
const notes = computed(() => workspace.notes.filter(note => (note.title + '\n' + note.body).toLocaleLowerCase().includes(query.value.toLocaleLowerCase().trim())))
const visible = computed(() => notes.value.slice(0, limit.value))
const currentNote = computed(() => workspace.notes.find(note => note.id === editor.id))
watch(query, () => { limit.value = 40 })
let loadSequence = 0
watch(() => route.query.id, async key => {
  const sequence = ++loadSequence
  if (typeof key !== 'string') { editor.select(null); return }
  if (key === editor.id) return
  try { const note = unwrap(await window.workbench.notes.get(key)); if (sequence === loadSequence) editor.select(note) }
  catch (error) { if (sequence === loadSequence) { report(error); editor.select(null) } }
}, { immediate: true })
async function create(): Promise<void> {
  if (route.query.id) { await router.push('/notes'); return }
  if (await editor.requestLeave()) editor.select(null)
}
async function save(): Promise<void> { await editor.save() }
async function remove(): Promise<void> {
  if (!editor.id || deleting.value) return
  if (!await confirmDelete(editor.title || '这篇笔记')) return
  deleting.value = true
  const key = editor.id
  if (await workspace.mutate(() => window.workbench.notes.remove(key), '笔记已删除')) { editor.select(null); await router.replace('/notes') }
  deleting.value = false
}
</script>
<template>
  <section class="panel notes-layout">
    <aside class="note-index">
      <div class="note-index-heading"><strong>全部笔记 <small>{{ workspace.notes.length }}</small></strong><button class="icon-button accent" aria-label="新建笔记" @click="create"><AppIcon name="plus" :size="20" /></button></div>
      <el-input v-model="query" placeholder="查找笔记" clearable aria-label="查找笔记"><template #prefix><AppIcon name="search" :size="16" /></template></el-input>
      <div class="note-index-list"><button v-for="note in visible" :key="note.id" class="note-index-item" :class="{ active: note.id === editor.id }" @click="router.push({ path: '/notes', query: { id: note.id } })"><strong>{{ note.title }}</strong><p>{{ note.body || '暂无正文' }}</p><small>{{ formatTime(note.updatedAt) }}</small></button><EmptyState v-if="!notes.length" compact icon="document" :title="query ? '没有找到笔记' : '还没有笔记'" description="在右侧写下第一段文字。" /><el-button v-if="visible.length < notes.length" text class="load-more" @click="limit += 40">显示更多（{{ notes.length - visible.length }}）</el-button></div>
    </aside>
    <div class="note-editor">
      <div class="editor-toolbar"><span class="editor-status" :class="{ unsaved: editor.dirty }"><span class="status-dot"></span>{{ editor.saving ? '正在保存…' : editor.dirty ? '未保存' : editor.id ? '已保存到本机' : '新笔记' }}</span><div><span class="shortcut-hint">Ctrl + S 保存</span><button v-if="editor.id" class="icon-button delete-button" aria-label="删除笔记" :disabled="deleting || editor.saving" @click="remove"><AppIcon name="delete" :size="18" /></button><el-button type="primary" :loading="editor.saving" :disabled="deleting" @click="save">保存笔记</el-button></div></div>
      <input v-model="editor.title" class="note-title-input" aria-label="笔记标题" placeholder="给这篇笔记起个名字" maxlength="200" :disabled="editor.saving || deleting" />
      <div class="note-meta"><AppIcon name="document" :size="14" />{{ currentNote ? `${formatTime(currentNote.updatedAt)} 更新` : '一篇新的记录' }}<span>·</span>纯文本笔记</div>
      <textarea v-model="editor.body" class="note-body-input" aria-label="笔记正文" placeholder="在这里写下想法、日常和灵感……" maxlength="200000" :disabled="editor.saving || deleting"></textarea>
      <div class="editor-footer"><span>{{ editor.body.length.toLocaleString() }} 字符</span><span>手动保存 · 内容仅存于这台电脑</span></div>
    </div>
  </section>
</template>
