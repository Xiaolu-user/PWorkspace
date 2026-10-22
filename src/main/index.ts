import { app, BrowserWindow, dialog, ipcMain, nativeImage, screen, shell, Tray, Menu, type IpcMainInvokeEvent } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { channels } from '../shared/channels'
import type { ErrorCode, Result } from '../shared/types'
import { DatabaseStore } from './database'
import { Repository } from './repository'
import { Planner } from './planner'
import { BackupService } from './backup'
import { AppError } from './errors'
import { Logger } from './logger'
import { externalUrl } from './validation'

app.setName('PersonalWorkbench')
const customData = process.env.WORKBENCH_DATA_DIR
const userData = customData && isAbsolute(customData) ? customData : join(app.getPath('appData'), 'PersonalWorkbench')
mkdirSync(userData, { recursive: true })
app.setPath('userData', userData)
const logger = new Logger(join(userData, 'logs'))
let window: BrowserWindow | null = null
let tray: Tray | null = null
let store: DatabaseStore
let repository: Repository
let backup: BackupService
let forceQuit = false
let rendererReady = false
let pendingClose: string | null = null
let startupWarning: string | null = null
let boundsTimer: ReturnType<typeof setTimeout> | undefined
// Normalize HTTP addresses so Vite's origin and Chromium's trailing slash compare equally.
const rendererURL = new URL(process.env.ELECTRON_RENDERER_URL || pathToFileURL(join(__dirname, '../renderer/index.html')).href).href

function isTrusted(event: IpcMainInvokeEvent): boolean {
  return !!window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url.split('#')[0] === rendererURL.split('#')[0]
}
function handle(channel: string, operation: (...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, async (event, ...args): Promise<Result<unknown>> => {
    try {
      if (!isTrusted(event)) throw new AppError('UNAUTHORIZED', '请求来源无效')
      return { ok: true, data: await operation(...args) }
    } catch (error) {
      logger.error(channel, error)
      if (error instanceof AppError) return { ok: false, error: { code: error.code, message: error.message } }
      const code = (error as { code?: string })?.code || ''
      let message = '操作未完成，请重试；详细原因已记录在数据目录的日志中'
      let kind: ErrorCode = 'INTERNAL'
      if (/READONLY|FULL|CANTOPEN|EACCES|EPERM|ENOSPC/.test(code)) { kind = 'IO'; message = '无法写入文件，请检查磁盘空间和目录权限。当前输入已保留' }
      else if (/SQLITE/.test(code)) { kind = 'DATABASE'; message = '数据库操作失败，请重试或检查备份文件。原有数据已保留' }
      return { ok: false, error: { code: kind, message } }
    }
  })
}
function reveal(): void {
  if (!window || window.isDestroyed()) return
  if (window.isMinimized()) window.restore()
  window.show(); window.focus()
}
function requestQuit(): void {
  if (forceQuit) return
  if (store?.maintenance) { void dialog.showMessageBox({ type: 'info', title: '请稍候', message: '正在备份或恢复数据，请完成后再退出。' }); return }
  if (!window || window.isDestroyed()) { forceQuit = true; app.quit(); return }
  if (!rendererReady) {
    reveal()
    void dialog.showMessageBox(window, { type: 'info', title: '请稍候', message: '界面正在初始化，请加载完成后再退出。' })
    return
  }
  if (pendingClose) { reveal(); return }
  reveal()
  pendingClose = randomUUID()
  window.webContents.send(channels.requestClose, pendingClose)
}
function persistBounds(): void {
  if (!window || window.isDestroyed() || store.maintenance || window.isMinimized()) return
  try { repository.writeSetting('windowBounds', { ...window.getNormalBounds(), maximized: window.isMaximized() }) }
  catch (error) { logger.error('windowBounds', error) }
}
function registerHandlers(): void {
  const planner = new Planner(repository)
  handle(channels.plannerGet, async () => {
    const data = planner.get()
    data.entries = await Promise.all(data.entries.map(async entry => {
      try { return { ...entry, icon: (await app.getFileIcon(entry.path, { size: 'normal' })).toDataURL() } } catch { return entry }
    }))
    return data
  })
  handle(channels.semesterSave, value => planner.semester(value))
  handle(channels.workoutsSave, value => planner.workouts(value))
  handle(channels.localPick, async kind => {
    if (!['app', 'file', 'folder'].includes(kind as string)) throw new AppError('VALIDATION', '选择类型不正确')
    const result = await dialog.showOpenDialog(window!, { title: kind === 'app' ? '选择应用程序或快捷方式' : '添加资料入口（保留原文件位置）', properties: kind === 'folder' ? ['openDirectory', 'multiSelections'] : ['openFile', 'multiSelections'], ...(kind === 'app' ? { filters: [{ name: '应用或快捷方式', extensions: ['exe', 'lnk'] }] } : {}) })
    if (!result.canceled) planner.add(result.filePaths, kind === 'app' ? 'app' : 'file')
  })
  handle(channels.localOpen, async id => {
    const entry = planner.entry(id)
    if (!existsSync(entry.path)) throw new AppError('IO', '原文件已移动或删除，请重新添加入口')
    if (await shell.openPath(entry.path)) throw new AppError('IO', '无法打开此文件，请检查关联的应用程序')
  })
  handle(channels.localRemove, id => planner.remove(id))
  handle(channels.taskList, () => repository.tasks())
  handle(channels.taskGet, key => repository.task(key))
  handle(channels.taskCreate, input => repository.createTask(input))
  handle(channels.taskUpdate, (key, input) => repository.updateTask(key, input))
  handle(channels.taskRemove, key => repository.removeTask(key))
  handle(channels.noteList, () => repository.notes())
  handle(channels.noteGet, key => repository.note(key))
  handle(channels.noteSave, (key, input) => repository.saveNote(key, input))
  handle(channels.noteRemove, key => repository.removeNote(key))
  handle(channels.bookmarkList, () => repository.bookmarks())
  handle(channels.bookmarkCreate, input => repository.createBookmark(input))
  handle(channels.bookmarkUpdate, (key, input) => repository.updateBookmark(key, input))
  handle(channels.bookmarkRemove, key => repository.removeBookmark(key))
  handle(channels.dashboard, () => repository.dashboard())
  handle(channels.search, term => repository.search(term))
  handle(channels.preferences, () => repository.preferences())
  handle(channels.setCloseBehavior, value => repository.setCloseBehavior(value))
  handle(channels.info, () => ({ version: app.getVersion(), dataPath: join(userData, 'data'), backupPath: store.backupDir, startupWarning }))
  handle(channels.openExternal, async value => { await shell.openExternal(externalUrl(value)) })
  handle(channels.openDataDirectory, async () => {
    const error = await shell.openPath(join(userData, 'data'))
    if (error) throw new AppError('IO', '无法打开数据目录，请使用设置页显示的路径手动打开')
  })
  handle(channels.ready, () => { rendererReady = true })
  handle(channels.respondClose, (token, allow) => {
    if (typeof token !== 'string' || typeof allow !== 'boolean' || token !== pendingClose) throw new AppError('VALIDATION', '退出请求已失效')
    pendingClose = null
    if (allow) {
      if (store.maintenance) throw new AppError('BUSY', '正在备份或恢复，请完成后再退出')
      persistBounds()
      forceQuit = true
      setImmediate(() => app.quit())
    }
  })
  handle(channels.backupCreate, async () => {
    if (store.maintenance) throw new AppError('BUSY', '已有备份或恢复正在进行')
    const selection = await dialog.showSaveDialog(window!, { title: '保存工作台备份（请选择新文件名）', defaultPath: join(app.getPath('documents'), `拾光备份-${new Date().toISOString().replace(/[:.]/g, '-')}.db`), filters: [{ name: '工作台数据库备份', extensions: ['db'] }] })
    if (selection.canceled || !selection.filePath) return null
    return backup.create(selection.filePath)
  })
  handle(channels.backupRestore, async () => {
    if (store.maintenance) throw new AppError('BUSY', '已有备份或恢复正在进行')
    const selection = await dialog.showOpenDialog(window!, { title: '选择工作台备份', properties: ['openFile'], filters: [{ name: '工作台数据库备份', extensions: ['db'] }] })
    if (selection.canceled || !selection.filePaths[0]) return null
    backup.inspect(selection.filePaths[0])
    const confirmation = await dialog.showMessageBox(window!, { type: 'warning', title: '恢复备份', message: '恢复会替换当前任务、笔记、链接、课程、健身计划、资料入口和设置（不会替换原始资料文件）。', detail: '开始前会校验备份，并保留一份恢复前的数据备份。是否继续？', buttons: ['取消', '恢复并替换'], defaultId: 0, cancelId: 0, noLink: true })
    if (confirmation.response !== 1) return null
    const result = await backup.restore(selection.filePaths[0])
    startupWarning = null
    return result
  })
}
function createWindow(): void {
  const saved = repository.readSetting<Record<string, unknown> | null>('windowBounds', null)
  let width = 1320; let height = 860; let x: number | undefined; let y: number | undefined
  if (saved && ['width', 'height', 'x', 'y'].every(key => typeof saved[key] === 'number' && Number.isFinite(saved[key]))) {
    const work = screen.getDisplayMatching({ x: saved.x as number, y: saved.y as number, width: saved.width as number, height: saved.height as number }).workArea
    width = Math.max(960, Math.min(saved.width as number, work.width)); height = Math.max(640, Math.min(saved.height as number, work.height))
    x = Math.max(work.x, Math.min(saved.x as number, work.x + work.width - width)); y = Math.max(work.y, Math.min(saved.y as number, work.y + work.height - height))
  }
  const iconPath = app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(app.getAppPath(), 'resources/icon.png')
  const icon = existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty()
  window = new BrowserWindow({ width, height, x, y, minWidth: 960, minHeight: 640, title: '拾光工作台', backgroundColor: '#f6f7f9', show: false, icon, autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, '../preload/index.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false }
  })
  Menu.setApplicationMenu(null)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => { if (url.split('#')[0] !== rendererURL.split('#')[0]) event.preventDefault() })
  window.webContents.on('will-attach-webview', event => event.preventDefault())
  window.webContents.on('did-start-navigation', details => {
    // Hash routing must not revoke the renderer's readiness or bypass its unsaved-note guard.
    if (details.isMainFrame && !details.isSameDocument) { rendererReady = false; pendingClose = null }
  })
  window.webContents.on('render-process-gone', (_event, details) => {
    logger.error('render-process-gone', { name: details.reason, code: String(details.exitCode) })
    rendererReady = false; pendingClose = null
    void dialog.showMessageBox({ type: 'error', title: '界面意外关闭', message: '界面停止运行，已保存的数据仍然保留。请退出后重新打开工作台。', buttons: ['退出'] }).then(() => { forceQuit = true; app.quit() })
  })
  window.on('unresponsive', () => {
    void dialog.showMessageBox({ type: 'warning', title: '界面暂时没有响应', message: '可以继续等待，或退出工作台。未保存的修改可能丢失。', buttons: ['继续等待', '退出'], defaultId: 0, cancelId: 0 }).then(result => { if (result.response === 1 && !store.maintenance) { forceQuit = true; app.quit() } })
  })
  window.once('ready-to-show', () => { if (saved?.maximized === true) window?.maximize(); window?.show() })
  const scheduleBounds = (): void => { clearTimeout(boundsTimer); boundsTimer = setTimeout(persistBounds, 350) }
  window.on('resize', scheduleBounds)
  window.on('move', scheduleBounds)
  window.on('close', event => {
    if (forceQuit) return
    event.preventDefault()
    let behavior = 'quit'
    try { behavior = repository.preferences().closeBehavior } catch { /* requestQuit handles maintenance */ }
    if (behavior === 'tray' && tray) {
      window?.hide()
      const preferences = repository.preferences()
      if (!preferences.trayExplained) {
        tray.displayBalloon({ title: '拾光工作台仍在运行', content: '点击托盘图标可以重新打开；右键菜单可以退出。' })
        repository.writeSetting('preferences', { ...preferences, trayExplained: true })
      }
    } else requestQuit()
  })
  tray = new Tray(icon.resize({ width: 24, height: 24 }))
  tray.setToolTip('拾光工作台')
  tray.setContextMenu(Menu.buildFromTemplate([{ label: '打开拾光工作台', click: reveal }, { type: 'separator' }, { label: '退出', click: requestQuit }]))
  tray.on('click', reveal)
  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(rendererURL)
  else void window.loadFile(join(__dirname, '../renderer/index.html'))
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', reveal)
  app.on('activate', reveal)
  app.on('before-quit', event => { if (!forceQuit) { event.preventDefault(); requestQuit() } })
  app.on('will-quit', () => { clearTimeout(boundsTimer); try { store?.close() } catch (error) { logger.error('close-database', error) }; tray?.destroy() })
  void app.whenReady().then(async () => {
    try {
      store = new DatabaseStore(join(userData, 'data/workbench.db'))
      repository = new Repository(store)
      backup = new BackupService(store)
      try { await backup.automatic() } catch (error) { startupWarning = '今天的自动备份未成功，请在设置中手动备份并检查磁盘空间和目录权限。'; logger.error('automatic-backup', error) }
      registerHandlers()
      createWindow()
    } catch (error) {
      logger.error('startup', error)
      dialog.showErrorBox('拾光工作台无法启动', `${error instanceof AppError ? error.message : '无法打开或初始化数据库，请检查磁盘空间及目录权限。'}\n\n原有文件已保留，数据位置：\n${join(userData, 'data')}\n\n日志位置：\n${join(userData, 'logs')}`)
      forceQuit = true; app.exit(1)
    }
  })
}
