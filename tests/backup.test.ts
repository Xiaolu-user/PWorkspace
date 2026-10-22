import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { copyFileSync, existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { APPLICATION_ID, DatabaseStore, SCHEMA_VERSION, validateDatabase } from '../src/main/database'
import { fixture, task } from './helpers'

describe('备份、恢复、升级与回退', () => {
  let f: ReturnType<typeof fixture>
  beforeEach(() => { f = fixture() })
  afterEach(() => { f.cleanup() })
  it('恢复全部业务数据和设置，并保留恢复前的安全备份', async () => {
    const first = f.repository.createTask(task())
    const note = f.repository.saveNote(null, { title: '中文笔记', body: '第一行\n第二行🌱' })
    f.repository.createBookmark({ title: '收藏', url: 'https://example.com', group: '常用' })
    f.repository.setCloseBehavior('quit')
    const destination = join(f.root, 'manual.db')
    await f.backup.create(destination)
    f.repository.removeTask(first.id)
    f.repository.saveNote(note.id, { title: '被改过', body: '新的内容' })
    f.repository.setCloseBehavior('tray')
    const result = await f.backup.restore(destination)
    expect(f.repository.task(first.id)).toEqual(first)
    expect(f.repository.note(note.id)).toEqual(note)
    expect(f.repository.bookmarks()).toHaveLength(1)
    expect(f.repository.preferences().closeBehavior).toBe('quit')
    const safety = new Database(result.safetyBackup!, { readonly: true })
    try { expect(safety.prepare('SELECT title FROM notes WHERE id=?').get(note.id)).toEqual({ title: '被改过' }) }
    finally { safety.close() }
  })
  it('拒绝覆盖现有备份和活动数据库', async () => {
    const destination = join(f.root, 'keep.db')
    writeFileSync(destination, 'existing file')
    await expect(f.backup.create(destination)).rejects.toThrow('已存在')
    expect(readFileSync(destination, 'utf8')).toBe('existing file')
    await expect(f.backup.create(f.store.path)).rejects.toThrow('正在使用')
    await expect(f.backup.restore(f.store.path)).rejects.toThrow('当前数据库')
    expect(f.store.connection.open).toBe(true)
  })
  it('损坏、异应用及未来版本的备份均不改变现有数据', async () => {
    const original = f.repository.createTask(task())
    const corrupt = join(f.root, 'corrupt.db')
    writeFileSync(corrupt, 'not a sqlite database')
    await expect(f.backup.restore(corrupt)).rejects.toThrow()
    const foreign = join(f.root, 'foreign.db')
    const foreignDb = new Database(foreign); foreignDb.exec('CREATE TABLE unrelated(id TEXT)'); foreignDb.close()
    await expect(f.backup.restore(foreign)).rejects.toThrow('不是拾光')
    const future = join(f.root, 'future.db')
    await f.backup.create(future)
    const futureDb = new Database(future); futureDb.pragma(`user_version = ${SCHEMA_VERSION + 1}`); futureDb.close()
    await expect(f.backup.restore(future)).rejects.toThrow('更新版本')
    expect(f.repository.tasks()).toEqual([original])
    expect(f.store.maintenance).toBe(false)
    expect(readdirSync(dirname(f.store.path)).filter(name => name.startsWith('restore-'))).toEqual([])
  })
  it('不完整的同应用数据库也会被拒绝', async () => {
    const broken = join(f.root, 'missing-table.db')
    const db = new Database(broken); db.pragma(`application_id = ${APPLICATION_ID}`); db.pragma('user_version = 1'); db.close()
    await expect(f.backup.restore(broken)).rejects.toThrow('数据结构不完整')
  })
  it('替换阶段失败时恢复原数据库，并允许继续写入', async () => {
    const original = f.repository.createTask(task())
    await expect(f.store.exclusive(async () => { f.store.replaceWith(join(f.root, 'does-not-exist.db')) })).rejects.toThrow()
    expect(f.repository.task(original.id)).toEqual(original)
    expect(existsSync(join(dirname(f.store.path), 'restore-state.json'))).toBe(false)
    expect(f.repository.createTask(task({ title: '回退后仍可写入' })).title).toBe('回退后仍可写入')
  })
  it('恢复记录无法创建时保持当前连接可用', async () => {
    const marker = join(dirname(f.store.path), 'restore-state.json')
    writeFileSync(marker, '{}')
    await expect(f.store.exclusive(async () => { f.store.replaceWith(join(f.root, 'unused.db')) })).rejects.toThrow()
    expect(f.store.connection.open).toBe(true)
    expect(f.repository.createTask(task()).title).toBe('整理今天的工作')
  })
  it('检测到中途退出的恢复操作时，在启动阶段回退', () => {
    const original = f.repository.createTask(task())
    f.store.close()
    const previous = join(dirname(f.store.path), 'rollback-interrupted.db')
    renameSync(f.store.path, previous)
    copyFileSync(previous, f.store.path)
    const replacement = new Database(f.store.path); replacement.exec('DELETE FROM tasks'); replacement.close()
    writeFileSync(join(dirname(f.store.path), 'restore-state.json'), JSON.stringify({ previous: 'rollback-interrupted.db' }))
    const reopened = new DatabaseStore(f.store.path)
    try { expect(reopened.connection.prepare('SELECT id FROM tasks').get()).toEqual({ id: original.id }) }
    finally { reopened.close() }
  })
  it('启动迁移前保留旧版快照，升级后记录不变', () => {
    const original = f.repository.createTask(task())
    f.store.close()
    const legacy = new Database(f.store.path)
    legacy.exec('ALTER TABLE tasks DROP COLUMN reminderAcknowledgedAt; ALTER TABLE tasks DROP COLUMN dueTime; ALTER TABLE tasks DROP COLUMN remindBefore; ALTER TABLE tasks DROP COLUMN reminderSentAt; DROP INDEX tasks_status_due; DROP INDEX notes_updated; DROP INDEX bookmarks_group; PRAGMA user_version = 1')
    legacy.close()
    const reopened = new DatabaseStore(f.store.path)
    try {
      expect(validateDatabase(reopened.connection)).toBe(SCHEMA_VERSION)
      expect(reopened.connection.prepare('SELECT id FROM tasks').get()).toEqual({ id: original.id })
      const before = readdirSync(reopened.backupDir).find(name => name.startsWith('before-migration-'))
      expect(before).toBeTruthy()
      const saved = new Database(join(reopened.backupDir, before!), { readonly: true })
      try { expect(saved.pragma('user_version', { simple: true })).toBe(1) } finally { saved.close() }
    } finally { reopened.close() }
  })
  it('恢复旧版备份时在副本上迁移，保持源备份不变', async () => {
    const original = f.repository.createTask(task())
    const legacyPath = join(f.root, 'legacy.db')
    await f.backup.create(legacyPath)
    const legacy = new Database(legacyPath)
    legacy.exec('ALTER TABLE tasks DROP COLUMN reminderAcknowledgedAt; ALTER TABLE tasks DROP COLUMN dueTime; ALTER TABLE tasks DROP COLUMN remindBefore; ALTER TABLE tasks DROP COLUMN reminderSentAt; DROP INDEX tasks_status_due; DROP INDEX notes_updated; DROP INDEX bookmarks_group; PRAGMA user_version = 1')
    legacy.close()
    f.repository.removeTask(original.id)
    await f.backup.restore(legacyPath)
    expect(f.repository.task(original.id)).toEqual(original)
    expect(validateDatabase(f.store.connection)).toBe(SCHEMA_VERSION)
    const source = new Database(legacyPath, { readonly: true })
    try { expect(source.pragma('user_version', { simple: true })).toBe(1) } finally { source.close() }
  })
  it('每日仅备份一次，保留七份且不删除手动及恢复前备份', async () => {
    await f.backup.create(join(f.store.backupDir, 'manual-keep.db'))
    await f.backup.create(join(f.store.backupDir, 'before-restore-keep.db'))
    for (let day = 1; day <= 9; day++) await f.backup.automatic(`2026-10-${String(day).padStart(2, '0')}`)
    expect(await f.backup.automatic('2026-10-09')).toBeNull()
    const files = readdirSync(f.store.backupDir)
    expect(files.filter(name => /^auto-.*\.db$/.test(name))).toHaveLength(7)
    expect(files).toContain('manual-keep.db')
    expect(files).toContain('before-restore-keep.db')
    expect(files).not.toContain('auto-2026-10-01.db')
  })
})
