export const channels = {
  weatherSearch: 'wb:weather:search', weatherCurrent: 'wb:weather:current',
  taskAcknowledge: 'wb:task:acknowledge', setAppearance: 'wb:app:setAppearance',
  plannerGet: 'wb:planner:get', semesterSave: 'wb:planner:semester', workoutsSave: 'wb:planner:workouts', localPick: 'wb:local:pick', localOpen: 'wb:local:open', localRemove: 'wb:local:remove', localImport: 'wb:local:import',
  shortcutAssign: 'wb:shortcut:assign', shortcutIcon: 'wb:shortcut:icon', shortcutCategories: 'wb:shortcut:categories', shortcutRename: 'wb:shortcut:rename', shortcutRemoveCategory: 'wb:shortcut:removeCategory',
  taskList: 'wb:task:list', taskGet: 'wb:task:get', taskCreate: 'wb:task:create', taskUpdate: 'wb:task:update', taskRemove: 'wb:task:remove',
  noteList: 'wb:note:list', noteGet: 'wb:note:get', noteSave: 'wb:note:save', noteRemove: 'wb:note:remove',
  bookmarkList: 'wb:bookmark:list', bookmarkCreate: 'wb:bookmark:create', bookmarkUpdate: 'wb:bookmark:update', bookmarkRemove: 'wb:bookmark:remove',
  dashboard: 'wb:dashboard', search: 'wb:search', backupCreate: 'wb:backup:create', backupRestore: 'wb:backup:restore',
  info: 'wb:app:info', preferences: 'wb:app:preferences', setCloseBehavior: 'wb:app:setCloseBehavior',
  openExternal: 'wb:app:openExternal', openDataDirectory: 'wb:app:openDataDirectory', ready: 'wb:app:ready', respondClose: 'wb:app:respondClose', requestClose: 'wb:app:requestClose'
} as const
