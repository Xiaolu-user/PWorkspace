import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { channels as c } from '../shared/channels'
import type { Result, WorkbenchAPI } from '../shared/types'

const invoke = <T>(channel: string, ...args: unknown[]): Promise<Result<T>> => ipcRenderer.invoke(channel, ...args)
const api: WorkbenchAPI = {
  weather: { search: query => invoke(c.weatherSearch, query), current: () => invoke(c.weatherCurrent) },
  planner: { get: () => invoke(c.plannerGet), semester: value => invoke(c.semesterSave, value), setHomeSemester: id => invoke(c.semesterHome, id), removeSemester: id => invoke(c.semesterRemove, id), workouts: value => invoke(c.workoutsSave, value), pick: (kind, category) => invoke(c.localPick, kind, category ?? ''), open: id => invoke(c.localOpen, id), remove: id => invoke(c.localRemove, id) },
  shortcuts: {
    import: (paths, category) => invoke(c.localImport, paths, category),
    assign: (id, category) => invoke(c.shortcutAssign, id, category),
    refreshIcon: id => invoke(c.shortcutIcon, id),
    saveCategories: list => invoke(c.shortcutCategories, list),
    renameCategory: (from, to) => invoke(c.shortcutRename, from, to),
    removeCategory: name => invoke(c.shortcutRemoveCategory, name)
  },
  // Dropped files only expose a real path through webUtils inside the preload context.
  filePath: (file: File) => { try { return webUtils.getPathForFile(file) } catch { return '' } },
  tasks: { list: () => invoke(c.taskList), get: id => invoke(c.taskGet, id), create: input => invoke(c.taskCreate, input), update: (id, input) => invoke(c.taskUpdate, id, input), remove: id => invoke(c.taskRemove, id), acknowledge: id => invoke(c.taskAcknowledge, id) },
  notes: { list: () => invoke(c.noteList), get: id => invoke(c.noteGet, id), save: (id, input) => invoke(c.noteSave, id, input), remove: id => invoke(c.noteRemove, id) },
  bookmarks: { list: () => invoke(c.bookmarkList), create: input => invoke(c.bookmarkCreate, input), update: (id, input) => invoke(c.bookmarkUpdate, id, input), remove: id => invoke(c.bookmarkRemove, id) },
  dashboard: { getSummary: () => invoke(c.dashboard) }, search: { query: term => invoke(c.search, term) },
  backup: { create: () => invoke(c.backupCreate), restore: () => invoke(c.backupRestore) },
  app: {
    setAppearance: value => invoke(c.setAppearance, value),
    info: () => invoke(c.info), preferences: () => invoke(c.preferences), setCloseBehavior: value => invoke(c.setCloseBehavior, value),
    openExternal: url => invoke(c.openExternal, url), openDataDirectory: () => invoke(c.openDataDirectory), ready: () => invoke(c.ready), respondClose: (token, allow) => invoke(c.respondClose, token, allow),
    onRequestClose(callback) { const listener = (_event: Electron.IpcRendererEvent, token: string) => callback(token); ipcRenderer.on(c.requestClose, listener); return () => ipcRenderer.removeListener(c.requestClose, listener) }
  }
}
contextBridge.exposeInMainWorld('workbench', api)
