import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { defaultAppearance, normalizeAppearance } from '../src/shared/appearance'
import { isReminderActive, compareReminderTasks } from '../src/shared/reminders'
import { DatabaseStore } from '../src/main/database'
import { Repository } from '../src/main/repository'
import { fixture, task } from './helpers'

describe('显示偏好与待办提醒确认', () => {
  let f: ReturnType<typeof fixture>
  beforeEach(() => { f = fixture() })
  afterEach(() => f.cleanup())
  const due = () => task({ dueDate: '2020-01-01', dueTime: '09:00', remindBefore: 10 })
  it('确认停止闪烁后保持提醒和置顶，完成或取消提醒后解除', () => {
    const active = f.repository.createTask(due()); const ordinary = f.repository.createTask(task())
    expect(isReminderActive(active)).toBe(true); expect(active.reminderAcknowledgedAt).toBeNull()
    const acknowledged = f.repository.acknowledgeReminder(active.id)
    expect(acknowledged.reminderAcknowledgedAt).toBeTruthy(); expect(isReminderActive(acknowledged)).toBe(true)
    expect(f.repository.dueReminders()).not.toContainEqual(acknowledged)
    expect([ordinary, acknowledged].sort(compareReminderTasks)[0].id).toBe(active.id)
    expect(f.repository.acknowledgeReminder(active.id).reminderAcknowledgedAt).toBe(acknowledged.reminderAcknowledgedAt)
    expect(f.repository.updateTask(active.id, { ...acknowledged, title: '编辑标题' }).reminderAcknowledgedAt).toBe(acknowledged.reminderAcknowledgedAt)
    expect(isReminderActive(f.repository.updateTask(active.id, { ...acknowledged, status: 'done' }))).toBe(false)
    expect(isReminderActive(f.repository.updateTask(active.id, { ...acknowledged, remindBefore: null }))).toBe(false)
    expect(() => f.repository.acknowledgeReminder(ordinary.id)).toThrow()
  })
  it('改期重置确认，用户输入不能伪造确认状态', () => {
    const original = f.repository.createTask(due()); const acknowledged = f.repository.acknowledgeReminder(original.id)
    const updated = f.repository.updateTask(original.id, { ...acknowledged, dueDate: '2030-01-01', reminderAcknowledgedAt: 'fake' })
    expect(updated.reminderAcknowledgedAt).toBeNull(); expect(updated.reminderSentAt).toBeNull()
    expect(isReminderActive(updated)).toBe(false)
    expect(() => f.repository.acknowledgeReminder(original.id)).toThrow()
  })
  it('显示设置及提醒确认在重启与备份恢复后保持，修改关闭行为不丢失显示偏好', async () => {
    const original = f.repository.createTask(due()); const acknowledged = f.repository.acknowledgeReminder(original.id)
    const appearance = defaultAppearance(); appearance.fontScale = 125; appearance.modules.todos = { scale: 120, fontScale: 140 }
    f.repository.setAppearance(appearance); f.repository.setCloseBehavior('quit')
    expect(f.repository.preferences().appearance).toEqual(appearance)
    const destination = join(f.root, 'display.db'); await f.backup.create(destination)
    f.repository.setAppearance(defaultAppearance()); await f.backup.restore(destination)
    f.store.close(); const reopened = new DatabaseStore(f.store.path)
    try { const repo = new Repository(reopened); expect(repo.preferences().appearance).toEqual(appearance); expect(repo.task(original.id).reminderAcknowledgedAt).toBe(acknowledged.reminderAcknowledgedAt) } finally { reopened.close() }
  })
  it('版本 3 升级保留旧提醒；旧偏好补全默认值并约束显示范围', () => {
    const original = f.repository.createTask(due()); f.store.close()
    const legacy = new Database(f.store.path); legacy.exec('ALTER TABLE tasks DROP COLUMN category; ALTER TABLE tasks DROP COLUMN reminderAcknowledgedAt; PRAGMA user_version = 3'); legacy.close()
    const reopened = new DatabaseStore(f.store.path)
    try { const restored = new Repository(reopened).task(original.id); expect(restored.remindBefore).toBe(10); expect(restored.reminderAcknowledgedAt).toBeNull() } finally { reopened.close() }
    expect(normalizeAppearance(null)).toEqual(defaultAppearance())
    expect(normalizeAppearance({ fontScale: 999, dialogScale: -1, modules: { todos: { scale: 'bad', fontScale: 120 } } }).modules.todos).toEqual({ scale: 100, fontScale: 120 })
  })
})
