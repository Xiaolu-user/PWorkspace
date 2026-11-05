import { isValidDate } from '../shared/date'
import type { BookmarkInput, NoteInput, TaskInput } from '../shared/types'
import { AppError } from './errors'

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError('VALIDATION', '提交的数据格式不正确')
  return value as Record<string, unknown>
}
function text(value: unknown, label: string, max: number, required = false, trim = true): string {
  if (typeof value !== 'string') throw new AppError('VALIDATION', `${label}格式不正确`)
  const result = trim ? value.trim() : value
  if (required && !result.trim()) throw new AppError('VALIDATION', `请填写${label}`)
  if (result.length > max) throw new AppError('VALIDATION', `${label}最多支持 ${max} 个字符`)
  return result
}
export function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new AppError('VALIDATION', '内容标识不正确')
  return value
}
export function taskInput(value: unknown): TaskInput {
  const v = object(value)
  if (v.status !== 'todo' && v.status !== 'done') throw new AppError('VALIDATION', '任务状态不正确')
  if (!['low', 'normal', 'high'].includes(v.priority as string)) throw new AppError('VALIDATION', '优先级不正确')
  if (v.dueDate !== null && (typeof v.dueDate !== 'string' || !isValidDate(v.dueDate))) throw new AppError('VALIDATION', '请选择有效的截止日期')
  if (v.category !== undefined && !['normal','daily'].includes(v.category as string)) throw new AppError('VALIDATION', '任务分类不正确')
  const dueTime = v.dueTime ?? null; const remindBefore = v.remindBefore ?? null
  if (dueTime !== null && (typeof dueTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime) || !v.dueDate)) throw new AppError('VALIDATION', '请为事项时间选择有效的日期和时间')
  if (remindBefore !== null && (typeof remindBefore !== 'number' || !Number.isInteger(remindBefore) || remindBefore < 0 || remindBefore > 43200 || !dueTime)) throw new AppError('VALIDATION', '提醒需要设置事项时间，提前时间须为 0 至 43200 分钟')
  return { category: (v.category ?? 'normal') as TaskInput['category'], title: text(v.title, '任务标题', 200, true), description: text(v.description, '任务说明', 10000, false, false), status: v.status, priority: v.priority as TaskInput['priority'], dueDate: v.dueDate as string | null, dueTime: dueTime as string | null, remindBefore: remindBefore as number | null }
}
export function noteInput(value: unknown): NoteInput {
  const v = object(value)
  return { title: text(v.title, '笔记标题', 200, true), body: text(v.body, '笔记正文', 200000, false, false) }
}
export function externalUrl(value: unknown): string {
  const url = text(value, '网址', 4096, true)
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) throw new Error()
    return parsed.href
  } catch { throw new AppError('VALIDATION', '请输入有效的 http 或 https 网址（不包含账号密码）') }
}
export function bookmarkInput(value: unknown): BookmarkInput {
  const v = object(value)
  return { title: text(v.title, '链接名称', 200, true), url: externalUrl(v.url), group: text(v.group, '分组名称', 80) || '未分类' }
}
export function searchTerm(value: unknown): string { return text(value, '搜索内容', 200) }
