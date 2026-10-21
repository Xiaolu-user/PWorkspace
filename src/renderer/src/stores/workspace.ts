import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { AppInfo, Bookmark, Dashboard, Note, Preferences, Result, Task } from '../../../shared/types'
import { unwrap, report } from '../lib/api'

export const useWorkspace = defineStore('workspace', () => {
  const tasks = ref<Task[]>([]); const notes = ref<Note[]>([]); const bookmarks = ref<Bookmark[]>([])
  const dashboard = ref<Dashboard>({ today: [], overdue: [], recentNotes: [], bookmarks: [], totalTodo: 0, totalDone: 0, noteCount: 0, bookmarkCount: 0 })
  const info = ref<AppInfo | null>(null); const preferences = ref<Preferences>({ closeBehavior: 'tray', trayExplained: false })
  const loading = ref(false); const error = ref(''); const revision = ref(0)
  let requestId = 0
  async function refresh(): Promise<boolean> {
    const current = ++requestId; loading.value = true
    try {
      const api = window.workbench
      if (!api) throw new Error('桌面接口未能加载，请退出后重新打开安装版工作台')
      const values = await Promise.all([api.tasks.list(), api.notes.list(), api.bookmarks.list(), api.dashboard.getSummary(), api.app.info(), api.app.preferences()])
      const [t, n, b, d, i, p] = values.map(value => unwrap(value as Result<unknown>)) as [Task[], Note[], Bookmark[], Dashboard, AppInfo, Preferences]
      if (current !== requestId) return true
      tasks.value = t; notes.value = n; bookmarks.value = b; dashboard.value = d; info.value = i; preferences.value = p
      error.value = ''; revision.value++
      return true
    } catch (cause) {
      if (current === requestId) error.value = cause instanceof Error ? cause.message : '加载失败，请重试'
      return false
    } finally { if (current === requestId) loading.value = false }
  }
  async function mutate(operation: () => Promise<Result<unknown>>, message: string): Promise<boolean> {
    try {
      unwrap(await operation())
      ElMessage.success(message)
      await refresh()
      return true
    } catch (cause) { report(cause); return false }
  }
  return { tasks, notes, bookmarks, dashboard, info, preferences, loading, error, revision, refresh, mutate }
})
