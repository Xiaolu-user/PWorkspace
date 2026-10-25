import { isValidDate } from './date'
export interface CourseTime { room: string; day: number; start: string; end: string }
export interface CourseException extends CourseTime { week: number; cancelled: boolean }
export interface CourseSchedule extends CourseTime { id: string; weeks: number[]; exceptions: CourseException[] }
export interface Course { id: string; title: string; teacher: string; color: string; schedules: CourseSchedule[] }
export interface LegacyCourse extends CourseTime { id: string; title: string; firstWeek: number; lastWeek: number; parity: 'all' | 'odd' | 'even' }
export interface Semester { title: string; startDate: string; weeks: number; courses: Course[] }
export interface LegacySemester extends Omit<Semester, 'courses'> { courses: LegacyCourse[] }
export interface CourseOccurrence extends CourseTime { id: string; courseId: string; scheduleId: string; title: string; teacher: string; color: string; week: number; date: string; cancelled: boolean; modified: boolean }
export interface Workout { day: number; title: string; minutes: number; exercises: string }
export interface LocalEntry { id: string; title: string; path: string; kind: 'app' | 'file'; icon?: string }
export interface PlannerData { semester: Semester; workouts: Workout[]; entries: LocalEntry[] }
export const emptySemester = (): Semester => ({ title: '', startDate: '', weeks: 18, courses: [] })
// UTC day numbers represent calendar dates, avoiding daylight-saving offsets.
const dayNumber = (date: string): number => Date.parse(`${date}T00:00:00Z`) / 86400000
export function semesterWeek(start: string, date: string): number {
  if (!start) return 0
  const weekday = (new Date(`${start}T00:00:00Z`).getUTCDay() + 6) % 7
  return Math.floor((dayNumber(date) - dayNumber(start) + weekday) / 7) + 1
}
// Read-time upgrade also supports restored old backups; it never rewrites stored data.
export function upgradeSemester(value: Semester | LegacySemester): Semester {
  const courses: Course[] = [], legacyGroups = new Map<string, Course>()
  for (const [index, item] of value.courses.entries()) {
    if ('schedules' in item) { courses.push(item); continue }
    let course = legacyGroups.get(item.title)
    if (!course) { course = { id: 'course-' + (item.id || index), title: item.title, teacher: '', color: '#17765c', schedules: [] }; courses.push(course); legacyGroups.set(item.title, course) }
    const weeks = Array.from({ length: value.weeks }, (_, i) => i + 1).filter(w => w >= item.firstWeek && w <= item.lastWeek && (item.parity === 'all' || w % 2 === (item.parity === 'odd' ? 1 : 0)))
    course.schedules.push({ id: item.id || 'schedule-' + index, day: item.day, start: item.start, end: item.end, room: item.room, weeks, exceptions: [] })
  }
  return { ...value, courses }
}
export function parseWeeks(input: string, max: number): number[] | null {
  const parts = input.trim().replace(/[，、；;]/g, ',').replace(/[–—~～]/g, '-').split(',')
  if (!input.trim()) return []
  const weeks = new Set<number>()
  for (const part of parts) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/)
    if (!match) return null
    const first = Number(match[1]), last = Number(match[2] || match[1])
    if (first < 1 || last < first || last > max) return null
    for (let w = first; w <= last; w++) weeks.add(w)
  }
  return [...weeks].sort((a, b) => a - b)
}
export function formatWeeks(weeks: number[]): string {
  const sorted = [...new Set(weeks)].sort((a, b) => a - b), parts: string[] = []
  for (let i = 0; i < sorted.length; i++) {
    const first = sorted[i]; let last = first
    while (sorted[i + 1] === last + 1) last = sorted[++i]
    parts.push(first === last ? String(first) : `${first}-${last}`)
  }
  return parts.join('、')
}
export function courseDate(start: string, week: number, day: number): string {
  if (!isValidDate(start)) return ''
  const weekday = (new Date(`${start}T00:00:00Z`).getUTCDay() + 6) % 7
  return new Date((dayNumber(start) - weekday + (week - 1) * 7 + day - 1) * 86400000).toISOString().slice(0, 10)
}
export function courseOccurrences(value: Semester | LegacySemester, onlyWeek?: number): CourseOccurrence[] {
  const semester = upgradeSemester(value), result: CourseOccurrence[] = []
  for (const course of semester.courses) for (const schedule of course.schedules) for (const week of schedule.weeks) {
    if (week < 1 || week > semester.weeks || (onlyWeek !== undefined && week !== onlyWeek)) continue
    const exception = schedule.exceptions.find(e => e.week === week), time = exception || schedule
    result.push({ id: `${schedule.id}:${week}`, courseId: course.id, scheduleId: schedule.id, title: course.title, teacher: course.teacher, color: course.color, week, date: courseDate(semester.startDate, week, time.day), day: time.day, start: time.start, end: time.end, room: time.room, cancelled: exception?.cancelled || false, modified: !!exception })
  }
  return result.sort((a, b) => a.week - b.week || a.day - b.day || a.start.localeCompare(b.start) || a.title.localeCompare(b.title))
}
export function coursesOn(semester: Semester | LegacySemester, date: string): CourseOccurrence[] {
  if (!isValidDate(semester.startDate) || !isValidDate(date)) return []
  return courseOccurrences(semester, semesterWeek(semester.startDate, date)).filter(c => c.date === date && !c.cancelled)
}
export function courseConflicts(occurrences: CourseOccurrence[]): { first: CourseOccurrence; second: CourseOccurrence }[] {
  const active = occurrences.filter(c => !c.cancelled && c.start && c.end && c.start < c.end).sort((a, b) => a.week - b.week || a.day - b.day || a.start.localeCompare(b.start))
  const conflicts: { first: CourseOccurrence; second: CourseOccurrence }[] = []
  for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
    const first = active[i], second = active[j]
    if (first.week !== second.week || first.day !== second.day || second.start >= first.end) break
    conflicts.push({ first, second })
  }
  return conflicts
}
