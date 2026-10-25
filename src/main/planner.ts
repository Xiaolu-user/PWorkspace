import { randomUUID } from 'node:crypto'
import { isAbsolute, basename } from 'node:path'
import { existsSync } from 'node:fs'
import { Repository } from './repository'
import { AppError } from './errors'
import { isValidDate } from '../shared/date'
import { emptySemester, upgradeSemester, type Semester, type LegacySemester, type Course, type CourseTime, type LegacyCourse, type CourseSchedule, type Workout, type LocalEntry, type PlannerData } from '../shared/planner'
const invalid = (message: string): never => { throw new AppError('VALIDATION', message) }
function record(v: unknown): Record<string, unknown> { if (!v || typeof v !== 'object' || Array.isArray(v)) invalid('数据格式不正确'); return v as Record<string, unknown> }
function text(v: unknown, max: number, required = true): string { if (typeof v !== 'string' || v.length > max || (required && !v.trim())) invalid('请填写有效内容，且不要超过长度限制'); return (v as string).trim() }
function integer(v: unknown, min: number, max: number): number { if (!Number.isInteger(v) || Number(v) < min || Number(v) > max) invalid(`请输入 ${min}—${max} 之间的整数`); return v as number }
export class Planner {
  constructor(private repo: Repository) {}
  get(): PlannerData { return { semester: upgradeSemester(this.repo.readSetting<Semester | LegacySemester>('semester', emptySemester())), workouts: this.repo.readSetting('workouts', []), entries: this.repo.readSetting('localEntries', []) } }
  semester(value: unknown): void {
    const v = record(value)
    const startDate = text(v.startDate, 10)
    if (!isValidDate(startDate)) invalid('请选择有效的学期开始日期')
    const weeks = integer(v.weeks, 1, 52)
    if (!Array.isArray(v.courses) || v.courses.length > 200) invalid('课程数量最多为200条')
    const ids = new Set<string>(); let scheduleCount = 0
    const id = (value: unknown): string => {
      const result = typeof value === 'string' && /^[\w-]{1,100}$/.test(value) ? value : randomUUID()
      if (ids.has(result)) invalid('课程或安排编号重复，请复制安排后重试')
      ids.add(result); return result
    }
    const time = (c: Record<string, unknown>): CourseTime => {
      const start = text(c.start, 5), end = text(c.end, 5)
      if (![start, end].every(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)) || start >= end) invalid('课程结束时间必须晚于开始时间')
      return { day: integer(c.day, 1, 7), start, end, room: text(c.room, 100, false) }
    }
    const courses = (v.courses as unknown[]).map((item): Course | LegacyCourse => {
      const c = record(item)
      if ('schedules' in c) {
        if (!Array.isArray(c.schedules) || !c.schedules.length) invalid('每门课程至少添加一条上课安排')
        const schedules: CourseSchedule[] = (c.schedules as unknown[]).map(item => {
          if (++scheduleCount > 500) invalid('整个学期最多支持 500 条上课安排')
          const s = record(item)
          if (!Array.isArray(s.weeks) || !s.weeks.length || s.weeks.length > weeks) invalid('每条安排至少选择一周，且不能超过学期周数')
          const selectedWeeks = [...new Set((s.weeks as unknown[]).map(w => integer(w, 1, weeks)))].sort((a, b) => a - b)
          const exceptions = s.exceptions ?? []
          if (!Array.isArray(exceptions) || exceptions.length > selectedWeeks.length) invalid('单次调整数量不正确')
          const changed = new Set<number>()
          return { id: id(s.id), ...time(s), weeks: selectedWeeks, exceptions: (exceptions as unknown[]).map(item => {
            const e = record(item), week = integer(e.week, 1, weeks)
            if (!selectedWeeks.includes(week) || changed.has(week) || typeof e.cancelled !== 'boolean') invalid('单次调整必须对应已选周次，且每周只能调整一次')
            changed.add(week); return { week, cancelled: e.cancelled as boolean, ...time(e) }
          }) }
        })
        if (typeof c.color !== 'string' || !/^#[\da-f]{6}$/i.test(c.color)) invalid('请选择有效的课程颜色')
        return { id: id(c.id), title: text(c.title, 100), teacher: text(c.teacher ?? '', 100, false), color: c.color as string, schedules }
      }
      // Accept the previous API shape, validating it before converting ranges to explicit weeks.
      const firstWeek = integer(c.firstWeek, 1, weeks); const lastWeek = integer(c.lastWeek, firstWeek, weeks)
      if (!['all', 'odd', 'even'].includes(c.parity as string)) invalid('单双周设置不正确')
      return { id: id(c.id), title: text(c.title, 100), ...time(c), firstWeek, lastWeek, parity: c.parity as 'all' | 'odd' | 'even' }
    })
    const semester = upgradeSemester({ title: text(v.title, 100), startDate, weeks, courses } as Semester | LegacySemester)
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
