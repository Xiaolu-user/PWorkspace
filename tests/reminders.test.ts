import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import { DatabaseStore } from '../src/main/database'
import { Repository } from '../src/main/repository'
import { ReminderService } from '../src/main/reminders'
import { taskInput } from '../src/main/validation'
import { reminderTimestamp } from '../src/shared/reminders'
import { fixture, task } from './helpers'

describe('日历事项与本地提醒', () => {
  let f: ReturnType<typeof fixture>
  beforeEach(() => { f = fixture() })
  afterEach(() => f.cleanup())
  const schedule = () => task({ dueDate: '2026-10-23', dueTime: '00:10', remindBefore: 30 })
  const at = (value: string) => new Date(value).getTime()

  it('按本地时间计算提前提醒，支持跨日、跨年及准时提醒', () => {
    expect(reminderTimestamp(schedule())).toBe(at('2026-10-22T23:40:00'))
    expect(reminderTimestamp(task({ dueDate: '2027-01-01', dueTime: '08:00', remindBefore: 1440 }))).toBe(at('2026-12-31T08:00:00'))
    expect(reminderTimestamp({ ...schedule(), remindBefore: 0 })).toBe(at('2026-10-23T00:10:00'))
    expect(reminderTimestamp(task())).toBeNull()
  })
  it('拒绝缺失日期、时间和无效的提前分钟数，支持旧版不设提醒的输入', () => {
    for (const value of [task({ dueTime: '09:00' }), task({ remindBefore: 10 }), { ...schedule(), dueTime: '24:00' }, { ...schedule(), dueTime: '09:61' }, { ...schedule(), remindBefore: -1 }, { ...schedule(), remindBefore: 0.5 }, { ...schedule(), remindBefore: 43201 }, { ...schedule(), remindBefore: '10' }]) expect(() => taskInput(value)).toThrow()
    expect(taskInput(task()).dueTime).toBeNull()
    expect(taskInput(schedule()).remindBefore).toBe(30)
  })
  it('提醒前不发送，到点仅一次，已提醒状态在重启后保留', async () => {
    const created = f.repository.createTask(schedule()); const deliver = vi.fn(async () => true)
    const service = new ReminderService(f.repository, deliver)
    await service.check(at('2026-10-22T23:39:59')); expect(deliver).not.toHaveBeenCalled()
    await service.check(at('2026-10-22T23:40:00')); expect(deliver).toHaveBeenCalledOnce()
    await service.check(at('2026-10-23T00:10:00')); expect(deliver).toHaveBeenCalledOnce()
    f.store.close()
    const reopened = new DatabaseStore(f.store.path)
    try {
      const repo = new Repository(reopened)
      expect(repo.task(created.id).reminderSentAt).toBeTruthy()
      await new ReminderService(repo, deliver).check(at('2026-10-24T00:00:00'))
      expect(deliver).toHaveBeenCalledOnce()
    } finally { reopened.close() }
  })
  it('失败后可重试；完成、删除及取消提醒的任务不会发送；重启时补发未提醒事项', async () => {
    const completed = f.repository.createTask({ ...schedule(), status: 'done' })
    const removed = f.repository.createTask(schedule()); f.repository.removeTask(removed.id)
    const cancelled = f.repository.createTask(schedule()); f.repository.updateTask(cancelled.id, { ...cancelled, remindBefore: null })
    const pending = f.repository.createTask(schedule())
    const deliver = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true)
    const service = new ReminderService(f.repository, deliver)
    const late = at('2026-10-24T12:00:00')
    await service.check(late); expect(f.repository.task(pending.id).reminderSentAt).toBeNull()
    await service.check(late); expect(deliver).toHaveBeenCalledTimes(2)
    expect(deliver.mock.calls.every(([task]) => task.id === pending.id)).toBe(true)
    expect(f.repository.task(completed.id).reminderSentAt).toBeNull()
  })
  it('修改说明保持发送状态，修改日期、事项时间或提前时长后重新安排', async () => {
    const created = f.repository.createTask(schedule())
    await new ReminderService(f.repository, async () => true).check(at('2026-10-24T00:00:00'))
    const sent = f.repository.task(created.id)
    expect(f.repository.updateTask(sent.id, { ...sent, title: '改标题' }).reminderSentAt).toBe(sent.reminderSentAt)
    for (const patch of [{ dueTime: '10:00' }, { dueDate: '2026-10-25' }, { remindBefore: 60 }]) {
      f.repository.markReminderSent(f.repository.task(sent.id))
      const updated = f.repository.updateTask(sent.id, { ...f.repository.task(sent.id), ...patch })
      expect(updated.reminderSentAt).toBeNull()
    }
  })
  it('检查重叠时不会重复发送，等待期间移除的其他事项不会被发送', async () => {
    const first = f.repository.createTask(schedule()); const second = f.repository.createTask(schedule())
    let resolve!: (shown: boolean) => void
    const deliver = vi.fn(() => new Promise<boolean>(done => { resolve = done }))
    const service = new ReminderService(f.repository, deliver)
    const pending = service.check(at('2026-10-24T00:00:00'))
    await service.check(at('2026-10-24T00:00:00'))
    expect(deliver).toHaveBeenCalledOnce()
    f.repository.removeTask(second.id); resolve(true); await pending
    expect(deliver).toHaveBeenCalledOnce()
    expect(f.repository.task(first.id).reminderSentAt).toBeTruthy()
  })
  it('提醒设置随备份恢复，版本 2 数据库升级后保留原任务', async () => {
    const created = f.repository.createTask(schedule()); const destination = join(f.root, 'reminders.db')
    await f.backup.create(destination)
    f.repository.removeTask(created.id); await f.backup.restore(destination)
    expect(f.repository.task(created.id)).toEqual(created)
    f.store.close()
    const legacy = new Database(f.store.path)
    legacy.exec('ALTER TABLE tasks DROP COLUMN category; ALTER TABLE tasks DROP COLUMN reminderAcknowledgedAt; ALTER TABLE tasks DROP COLUMN dueTime; ALTER TABLE tasks DROP COLUMN remindBefore; ALTER TABLE tasks DROP COLUMN reminderSentAt; PRAGMA user_version = 2')
    legacy.close()
    const reopened = new DatabaseStore(f.store.path)
    try {
      const restored = new Repository(reopened).task(created.id)
      expect(restored.title).toBe(created.title); expect(restored.dueDate).toBe(created.dueDate)
      expect(restored.dueTime).toBeNull(); expect(restored.remindBefore).toBeNull()
    } finally { reopened.close() }
  })
})
