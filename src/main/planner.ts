import { randomUUID } from 'node:crypto'
import { isAbsolute, basename } from 'node:path'
import { existsSync } from 'node:fs'
import { Repository } from './repository'
import { AppError } from './errors'
import { isValidDate } from '../shared/date'
import { emptySemester, type Semester, type Workout, type LocalEntry, type PlannerData } from '../shared/planner'
const invalid = (message: string): never => { throw new AppError('VALIDATION', message) }
function record(v: unknown): Record<string, unknown> { if (!v || typeof v !== 'object' || Array.isArray(v)) invalid('数据格式不正确'); return v as Record<string, unknown> }
function text(v: unknown, max: number, required = true): string { if (typeof v !== 'string' || v.length > max || (required && !v.trim())) invalid('请填写有效内容，且不要超过长度限制'); return (v as string).trim() }
function integer(v: unknown, min: number, max: number): number { if (!Number.isInteger(v) || Number(v) < min || Number(v) > max) invalid(`请输入 ${min}—${max} 之间的整数`); return v as number }
export class Planner {
  constructor(private repo: Repository) {}
  get(): PlannerData { return { semester: this.repo.readSetting('semester', emptySemester()), workouts: this.repo.readSetting('workouts', []), entries: this.repo.readSetting('localEntries', []) } }
  semester(value: unknown): void {
    const v = record(value)
    const startDate = text(v.startDate, 10)
    if (!isValidDate(startDate)) invalid('请选择有效的学期开始日期')
    const weeks = integer(v.weeks, 1, 52)
    if (!Array.isArray(v.courses) || v.courses.length > 200) invalid('课程数量最多为200条')
    const courses = (v.courses as unknown[]).map(item => {
      const c = record(item); const start = text(c.start, 5); const end = text(c.end, 5)
      if (![start, end].every(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)) || start >= end) invalid('课程结束时间必须晚于开始时间')
      const firstWeek = integer(c.firstWeek, 1, weeks); const lastWeek = integer(c.lastWeek, firstWeek, weeks)
      if (!['all', 'odd', 'even'].includes(c.parity as string)) invalid('单双周设置不正确')
      return { id: randomUUID(), title: text(c.title, 100), room: text(c.room, 100, false), day: integer(c.day, 1, 7), start, end, firstWeek, lastWeek, parity: c.parity as 'all' | 'odd' | 'even' }
    })
    const semester: Semester = { title: text(v.title, 100), startDate, weeks, courses }
    this.repo.writeSetting('semester', semester)
  }
  workouts(value: unknown): void {
    if (!Array.isArray(value) || value.length > 7) invalid('请按每周七天设置训练计划')
    const days = new Set<number>()
    const data: Workout[] = (value as unknown[]).map(item => { const v = record(item); const day = integer(v.day, 1, 7); if (days.has(day)) invalid('同一天请合并为一个训练计划'); days.add(day); return { day, title: text(v.title, 100), minutes: integer(v.minutes, 0, 600), exercises: text(v.exercises, 5000, false) } })
    this.repo.writeSetting('workouts', data)
  }
  add(paths: string[], kind: 'app' | 'file'): void {
    const entries = this.get().entries
    for (const path of paths) {
      if (!isAbsolute(path) || !existsSync(path)) invalid('文件已移动或不存在，请重新选择')
      if (!entries.some(e => e.path === path && e.kind === kind)) entries.push({ id: randomUUID(), title: basename(path), path, kind })
    }
    this.repo.writeSetting('localEntries', entries)
  }
  entry(id: unknown): LocalEntry { const entry = this.get().entries.find(e => e.id === id); if (!entry) throw new AppError('NOT_FOUND', '这个入口已不存在'); return entry }
  remove(id: unknown): void { this.entry(id); this.repo.writeSetting('localEntries', this.get().entries.filter(e => e.id !== id)) }
}
