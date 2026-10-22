import type { Task, TaskInput } from './types'

export function isReminderActive(task: Task, now = Date.now()): boolean {
  const time = reminderTimestamp(task)
  return task.status === 'todo' && time !== null && time <= now
}
export function compareReminderTasks(a: Task, b: Task, now = Date.now()): number {
  return Number(isReminderActive(b, now)) - Number(isReminderActive(a, now))
}

export function reminderTimestamp(task: Pick<TaskInput, 'dueDate' | 'dueTime' | 'remindBefore'>): number | null {
  if (!task.dueDate || !task.dueTime || task.remindBefore == null) return null
  return new Date(`${task.dueDate}T${task.dueTime}:00`).getTime() - task.remindBefore * 60000
}

export function reminderLabel(minutes: number): string {
  if (minutes === 0) return '准时提醒'
  if (minutes % 1440 === 0) return `提前 ${minutes / 1440} 天提醒`
  if (minutes % 60 === 0) return `提前 ${minutes / 60} 小时提醒`
  return `提前 ${minutes} 分钟提醒`
}
