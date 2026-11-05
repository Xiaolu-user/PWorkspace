import Database from 'better-sqlite3'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { AppError } from './errors'

export const APPLICATION_ID = 0x57424b31
export const SCHEMA_VERSION = 5
const schemas: Record<string, string[]> = {
  tasks: ['id', 'title', 'description', 'status', 'dueDate', 'priority', 'createdAt', 'updatedAt'],
  notes: ['id', 'title', 'body', 'createdAt', 'updatedAt'],
  bookmarks: ['id', 'title', 'url', 'group', 'createdAt', 'updatedAt'],
  settings: ['key', 'value']
}

export function validateDatabase(db: Database.Database): number {
  if (db.pragma('application_id', { simple: true }) !== APPLICATION_ID) throw new AppError('INCOMPATIBLE', '这不是拾光工作台的数据库备份')
  const version = Number(db.pragma('user_version', { simple: true }))
  if (version < 1 || version > SCHEMA_VERSION) throw new AppError('INCOMPATIBLE', version > SCHEMA_VERSION ? '备份来自更新版本，请先升级工作台' : '不支持这个数据库版本')
  if (db.pragma('quick_check', { simple: true }) !== 'ok') throw new AppError('DATABASE', '数据库完整性检查失败，请使用其他备份')
  for (const [table, columns] of Object.entries(schemas)) {
    const found = db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]
    if (!columns.every(column => found.some(item => item.name === column))) throw new AppError('INCOMPATIBLE', '备份的数据结构不完整')
  }
  if (version >= 3) {
    const columns = db.prepare('PRAGMA table_info(tasks)').all() as { name: string }[]
    if (!['dueTime', 'remindBefore', 'reminderSentAt'].every(name => columns.some(column => column.name === name))) throw new AppError('INCOMPATIBLE', '备份的提醒数据结构不完整')
  }
  if (version >= 4 && !(db.prepare('PRAGMA table_info(tasks)').all() as { name: string }[]).some(column => column.name === 'reminderAcknowledgedAt')) throw new AppError('INCOMPATIBLE', '备份的提醒确认数据结构不完整')
  if (version >= 5 && !(db.prepare('PRAGMA table_info(tasks)').all() as { name: string }[]).some(column => column.name === 'category')) throw new AppError('INCOMPATIBLE', '备份的任务分类数据结构不完整')
  return version
}

export function migrateDatabase(db: Database.Database): void {
  let version = Number(db.pragma('user_version', { simple: true }))
  db.transaction(() => {
    if (version < 1) {
      db.exec(`
        CREATE TABLE tasks (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL CHECK(status IN ('todo','done')), dueDate TEXT,
          priority TEXT NOT NULL CHECK(priority IN ('low','normal','high')),
          createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
        );
        CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
        CREATE TABLE bookmarks (id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL, "group" TEXT NOT NULL DEFAULT '未分类', createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      `)
      db.pragma(`application_id = ${APPLICATION_ID}`)
      db.pragma('user_version = 1')
      version = 1
    }
    if (version < 2) {
      db.exec('CREATE INDEX tasks_status_due ON tasks(status, dueDate); CREATE INDEX notes_updated ON notes(updatedAt DESC); CREATE INDEX bookmarks_group ON bookmarks("group");')
      db.pragma('user_version = 2')
    }
    if (version < 3) {
      db.exec('ALTER TABLE tasks ADD COLUMN dueTime TEXT; ALTER TABLE tasks ADD COLUMN remindBefore INTEGER; ALTER TABLE tasks ADD COLUMN reminderSentAt TEXT;')
      db.pragma('user_version = 3')
    }
    if (version < 4) {
      db.exec('ALTER TABLE tasks ADD COLUMN reminderAcknowledgedAt TEXT')
      db.pragma('user_version = 4')
    }
    if (version < 5) {
      db.exec("ALTER TABLE tasks ADD COLUMN category TEXT NOT NULL DEFAULT 'normal' CHECK(category IN ('normal','daily'))")
      db.pragma('user_version = 5')
    }
  })()
}

export class DatabaseStore {
  private db!: Database.Database
  private busy = false
  readonly backupDir: string
  constructor(readonly path: string) {
    mkdirSync(dirname(path), { recursive: true })
    this.backupDir = join(dirname(path), 'backups')
    mkdirSync(this.backupDir, { recursive: true })
    this.recoverInterruptedRestore()
    this.open()
  }
  get connection(): Database.Database {
    if (this.busy) throw new AppError('BUSY', '正在备份或恢复数据，请稍后重试')
    if (!this.db?.open) throw new AppError('DATABASE', '数据库尚未打开，请重新启动工作台')
    return this.db
  }
  get maintenance(): boolean { return this.busy }
  private open(): void {
    const existed = existsSync(this.path)
    if (existed) {
      const check = new Database(this.path, { readonly: true, fileMustExist: true })
      try { validateDatabase(check) } finally { check.close() }
    }
    const db = new Database(this.path)
    try {
      const version = Number(db.pragma('user_version', { simple: true }))
      if (existed && version < SCHEMA_VERSION) {
        const destination = join(this.backupDir, `before-migration-${randomUUID()}.db`)
        db.prepare('VACUUM INTO ?').run(destination)
      }
      migrateDatabase(db)
      db.pragma('journal_mode = WAL')
      db.pragma('foreign_keys = ON')
      db.pragma('busy_timeout = 5000')
      this.db = db
    } catch (error) { db.close(); throw error }
  }
  async exclusive<T>(operation: (db: Database.Database) => Promise<T>): Promise<T> {
    const db = this.connection
    this.busy = true
    try { return await operation(db) } finally { this.busy = false }
  }
  close(): void {
    if (this.db?.open) {
      try { this.db.pragma('wal_checkpoint(TRUNCATE)') }
      finally { this.db.close() }
    }
  }
  private recoverInterruptedRestore(): void {
    const marker = join(dirname(this.path), 'restore-state.json')
    if (!existsSync(marker)) return
    const data = JSON.parse(readFileSync(marker, 'utf8')) as { previous: string }
    if (typeof data.previous !== 'string' || basename(data.previous) !== data.previous || !/^rollback-[\w-]+\.db$/.test(data.previous)) throw new AppError('DATABASE', '恢复记录异常，请保留数据目录并联系维护者')
    const previous = join(dirname(this.path), data.previous)
    if (existsSync(previous)) {
      if (existsSync(this.path)) renameSync(this.path, join(dirname(this.path), `interrupted-${randomUUID()}.db`))
      for (const suffix of ['-wal', '-shm']) rmSync(this.path + suffix, { force: true })
      renameSync(previous, this.path)
    }
    rmSync(marker, { force: true })
  }
  /** Called only while exclusive maintenance owns the connection. */
  replaceWith(staged: string): void {
    const marker = join(dirname(this.path), 'restore-state.json')
    const previousName = `rollback-${randomUUID()}.db`
    const previous = join(dirname(this.path), previousName)
    writeFileSync(marker, JSON.stringify({ previous: previousName }), { flag: 'wx' })
    try {
      this.close()
      renameSync(this.path, previous)
      renameSync(staged, this.path)
      this.open()
      rmSync(marker)
    } catch (error) {
      if (existsSync(previous)) {
        if (this.db?.open) this.close()
        if (existsSync(this.path)) renameSync(this.path, join(dirname(this.path), `failed-restore-${randomUUID()}.db`))
        for (const suffix of ['-wal', '-shm']) rmSync(this.path + suffix, { force: true })
        renameSync(previous, this.path)
      }
      if (!this.db?.open) this.open()
      rmSync(marker, { force: true })
      throw error
    }
    // The safety snapshot is already retained in backups; cleanup is best effort.
    try { rmSync(previous, { force: true }) } catch { /* retained snapshot is harmless */ }
  }
}
