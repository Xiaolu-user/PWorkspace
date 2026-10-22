import { contextBridge, ipcRenderer } from 'electron'
import { channels as c } from '../shared/channels'
import type { Result, WorkbenchAPI } from '../shared/types'

const invoke = <T>(channel: string, ...args: unknown[]): Promise<Result<T>> => ipcRenderer.invoke(channel, ...args)
const api: WorkbenchAPI = {
  planner: { get: () => invoke(c.plannerGet), semester: value => invoke(c.semesterSave, value), workouts: value => invoke(c.workoutsSave, value), pick: kind => invoke(c.localPick, kind), open: id => invoke(c.localOpen, id), remove: id => invoke(c.localRemove, id) },
  tasks: { list: () => invoke(c.taskList), get: id => invoke(c.taskGet, id), create: input => invoke(c.taskCreate, input), update: (id, input) => invoke(c.taskUpdate, id, input), remove: id => invoke(c.taskRemove, id) },
  notes: { list: () => invoke(c.noteList), get: id => invoke(c.noteGet, id), save: (id, input) => invoke(c.noteSave, id, input), remove: id => invoke(c.noteRemove, id) },
  bookmarks: { list: () => invoke(c.bookmarkList), create: input => invoke(c.bookmarkCreate, input), update: (id, input) => invoke(c.bookmarkUpdate, id, input), remove: id => invoke(c.bookmarkRemove, id) },
  dashboard: { getSummary: () => invoke(c.dashboard) }, search: { query: term => invoke(c.search, term) },
  backup: { create: () => invoke(c.backupCreate), restore: () => invoke(c.backupRestore) },
  app: {
    info: () => invoke(c.info), preferences: () => invoke(c.preferences), setCloseBehavior: value => invoke(c.setCloseBehavior, value),
    openExternal: url => invoke(c.openExternal, url), openDataDirectory: () => invoke(c.openDataDirectory), ready: () => invoke(c.ready), respondClose: (token, allow) => invoke(c.respondClose, token, allow),
    onRequestClose(callback) { const listener = (_event: Electron.IpcRendererEvent, token: string) => callback(token); ipcRenderer.on(c.requestClose, listener); return () => ipcRenderer.removeListener(c.requestClose, listener) }
  }
}
contextBridge.exposeInMainWorld('workbench', api)
