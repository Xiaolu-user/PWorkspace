import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { Note } from '../../../shared/types'
import { unwrap, report } from '../lib/api'
import { useWorkspace } from './workspace'

export const useEditor = defineStore('editor', () => {
  const id = ref<string | null>(null); const title = ref(''); const body = ref(''); const saving = ref(false)
  const snapshot = ref({ id: null as string | null, title: '', body: '' })
  const dirty = computed(() => title.value !== snapshot.value.title || body.value !== snapshot.value.body)
  const leaveDialog = ref(false)
  let leavePromise: Promise<boolean> | null = null
  let resolveLeave: ((result: boolean) => void) | null = null
  let savePromise: Promise<boolean> | null = null
  function select(note: Note | null): void {
    id.value = note?.id ?? null; title.value = note?.title ?? ''; body.value = note?.body ?? ''
    snapshot.value = { id: id.value, title: title.value, body: body.value }
  }
  function save(): Promise<boolean> {
    if (savePromise) return savePromise
    if (!title.value.trim()) { ElMessage.warning('请先填写笔记标题'); return Promise.resolve(false) }
    saving.value = true
    savePromise = (async () => {
      try {
        const note = unwrap(await window.workbench.notes.save(id.value, { title: title.value, body: body.value }))
        select(note)
        ElMessage.success('笔记已保存')
        await useWorkspace().refresh()
        return true
      } catch (cause) { report(cause); return false }
      finally { saving.value = false; savePromise = null }
    })()
    return savePromise
  }
  async function requestLeave(): Promise<boolean> {
    if (savePromise) await savePromise
    if (!dirty.value) return true
    if (leavePromise) return leavePromise
    leaveDialog.value = true
    leavePromise = new Promise(resolve => { resolveLeave = resolve })
    return leavePromise
  }
  async function decide(action: 'save' | 'discard' | 'cancel'): Promise<void> {
    if (action === 'save' && !await save()) return
    if (action === 'discard') { id.value = snapshot.value.id; title.value = snapshot.value.title; body.value = snapshot.value.body }
    leaveDialog.value = false
    const resolve = resolveLeave; resolveLeave = null; leavePromise = null
    resolve?.(action !== 'cancel')
  }
  return { id, title, body, saving, dirty, leaveDialog, select, save, requestLeave, decide }
})
