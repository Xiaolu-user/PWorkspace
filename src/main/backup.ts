import Database from 'better-sqlite3'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { localDate } from '../shared/date'
import type { BackupResult } from '../shared/types'
import { DatabaseStore, migrateDatabase, SCHEMA_VERSION, validateDatabase } from './database'
import { AppError } from './errors'

export class BackupService {
  constructor(private store: DatabaseStore) {}
  inspect(source: string): void {
    if (resolve(source).toLowerCase() === resolve(this.store.path).toLowerCase()) throw new AppError('BACKUP', '请选择备份文件，而不是当前数据库')
    const check = new Database(source, { readonly: true, fileMustExist: true })
    try { validateDatabase(check) } finally { check.close() }
  }
  async create(destination: string): Promise<BackupResult> {
    if (resolve(destination).toLowerCase() === resolve(this.store.path).toLowerCase()) throw new AppError('BACKUP', '备份不能覆盖正在使用的数据库')
    if (existsSync(destination)) throw new AppError('BACKUP', '目标文件已存在，请选择新的备份名称')
    mkdirSync(dirname(destination), { recursive: true })
    return this.store.exclusive(async db => {
      const temporary = destination + `.partial-${randomUUID()}`
      try {
        await db.backup(temporary)
        if (existsSync(destination)) throw new AppError('BACKUP', '目标文件已存在，请选择新的备份名称')
        renameSync(temporary, destination)
        return { path: destination }
      } finally {
        try { rmSync(temporary, { force: true }) } catch { /* incomplete file is never published as a backup */ }
      }
    })
  }
  async automatic(today = localDate()): Promise<string | null> {
    const directory = this.store.backupDir
    const name = `auto-${today}.db`
    if (existsSync(join(directory, name))) return null
    await this.create(join(directory, name))
    const files = readdirSync(directory).filter(file => /^auto-\d{4}-\d{2}-\d{2}\.db$/.test(file)).sort().reverse()
    for (const old of files.slice(7)) rmSync(join(directory, old))
    return join(directory, name)
  }
  async restore(source: string): Promise<BackupResult> {
    if (resolve(source).toLowerCase() === resolve(this.store.path).toLowerCase()) throw new AppError('BACKUP', '请选择备份文件，而不是当前数据库')
    return this.store.exclusive(async db => {
      const staged = join(dirname(this.store.path), `restore-${randomUUID()}.db`)
      let check: Database.Database | undefined
      try {
        check = new Database(source, { readonly: true, fileMustExist: true })
        validateDatabase(check)
        await check.backup(staged)
        check.close(); check = undefined
        const candidate = new Database(staged)
        try {
          validateDatabase(candidate)
          if (Number(candidate.pragma('user_version', { simple: true })) < SCHEMA_VERSION) migrateDatabase(candidate)
          candidate.pragma('journal_mode = DELETE')
          validateDatabase(candidate)
        } finally { candidate.close() }
        const safetyBackup = join(this.store.backupDir, `before-restore-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.db`)
        await db.backup(safetyBackup)
        this.store.replaceWith(staged)
        return { path: source, safetyBackup }
      } finally {
        check?.close()
        for (const suffix of ['', '-wal', '-shm']) {
          try { rmSync(staged + suffix, { force: true }) } catch { /* retain failed cleanup rather than misreport a successful restore */ }
        }
      }
    })
  }
}
