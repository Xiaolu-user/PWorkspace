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
export interface LocalEntry { id: string; title: string; path: string; kind: 'app' | 'file'; icon?: string; iconVersion?: number; category?: string }
export interface PlannerData { semester: Semester; workouts: Workout[]; entries: LocalEntry[]; categories: string[] }
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
export interface CourseTimeSlot { start: string; end: string }
// Home week grid rows come from the times actually arranged, so unused periods take no vertical space.
export function courseTimeSlots(courses: { start: string; end: string }[]): CourseTimeSlot[] {
  const ends = new Map<string, string>()
  for (const course of courses) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(course.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(course.end) || course.start >= course.end) continue
    const known = ends.get(course.start)
    if (!known || course.end > known) ends.set(course.start, course.end)
  }
  return [...ends].map(([start, end]) => ({ start, end })).sort((a, b) => a.start.localeCompare(b.start))
}
// A lesson occupies every row whose start falls inside its time range, so long lessons span slot rows.
export function courseSlotSpan(slots: CourseTimeSlot[], start: string, end: string): { first: number; last: number } {
  if (!slots.length) return { first: 0, last: 0 }
  let first = slots.findIndex(slot => slot.start === start)
  if (first < 0) first = slots.findIndex(slot => slot.start > start)
  if (first < 0) first = slots.length - 1
  let last = first
  for (let index = first; index < slots.length && slots[index].start < end; index++) last = index
  return { first, last }
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
// Share codes: "PWS1.<url-base64 of deflate(JSON)>" with a checksum so truncated copies fail loudly.
const SHARE_PREFIX = 'PWS1.'
const SHARE_VERSION = 1
const shareSum = (text: string): number => { let hash = 0x811c9dc5; for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 0x01000193) } return hash >>> 0 }
const bytesToBase64Url = (bytes: Uint8Array): string => { let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
const base64UrlToBytes = (text: string): Uint8Array => { const base64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - text.length % 4) % 4); const binary = atob(base64); const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i); return bytes }
async function shareTransform(bytes: Uint8Array, kind: 'deflate' | 'inflate'): Promise<Uint8Array> {
  const source = new Blob([bytes as BlobPart]).stream()
  const stream = kind === 'deflate' ? source.pipeThrough(new CompressionStream('deflate')) : source.pipeThrough(new DecompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}
export interface ShareOptions { includeExceptions?: boolean }
// Validate and normalize a semester-shaped value; used both when packing and unpacking share codes.
function sanitizeShareSemester(value: unknown, options?: ShareOptions): Semester {
  const bad = (reason: string): never => { throw new Error(reason) }
  if (typeof value !== 'object' || value === null) return bad('分享码内容无效或已损坏')
  const raw = value as Record<string, unknown>
  const readText = (input: unknown, max: number, fallback = ''): string => typeof input === 'string' && input.length <= max * 4 ? input.trim().slice(0, max) : fallback
  const weeks = raw.weeks
  if (!Number.isInteger(weeks) || (weeks as number) < 1 || (weeks as number) > 52) return bad('分享码中的学期周数无效')
  const weekCount = weeks as number
  if (!Array.isArray(raw.courses)) return bad('分享码内容无效或已损坏')
  if (raw.courses.length > 200) return bad('分享的课表课程数超出限制')
  const time = /^([01]\d|2[0-3]):[0-5]\d$/
  let scheduleCount = 0
  const courses: Course[] = (raw.courses as unknown[]).map(item => {
    if (typeof item !== 'object' || item === null) return bad('分享码内容无效或已损坏')
    const course = item as Record<string, unknown>
    if (!Array.isArray(course.schedules) || !course.schedules.length) return bad(`课表中“${readText(course.title, 100) || '未命名课程'}”没有上课安排，请先补全再分享`)
    const schedules: CourseSchedule[] = (course.schedules as unknown[]).map(entry => {
      if (++scheduleCount > 500) return bad('分享的课表安排数超出限制')
      if (typeof entry !== 'object' || entry === null) return bad('分享码内容无效或已损坏')
      const schedule = entry as Record<string, unknown>
      const start = readText(schedule.start, 5), end = readText(schedule.end, 5)
      if (!time.test(start) || !time.test(end) || start >= end) return bad('分享的课表包含无效的上课时间')
      const day = schedule.day
      if (!Number.isInteger(day) || (day as number) < 1 || (day as number) > 7) return bad('分享的课表包含无效的上课星期')
      if (!Array.isArray(schedule.weeks) || !schedule.weeks.length) return bad('分享的课表包含没有选择周次的安排')
      const selected = [...new Set((schedule.weeks as unknown[]).map(w => { if (!Number.isInteger(w) || (w as number) < 1 || (w as number) > weekCount) return bad('分享的课表包含越界的周次'); return w as number }))].sort((a, b) => a - b)
      const exceptions = (options?.includeExceptions === true && Array.isArray(schedule.exceptions) ? schedule.exceptions : []).map(item => {
        if (typeof item !== 'object' || item === null) return bad('分享码内容无效或已损坏')
        const exception = item as Record<string, unknown>
        const exceptionStart = readText(exception.start, 5), exceptionEnd = readText(exception.end, 5)
        if (!time.test(exceptionStart) || !time.test(exceptionEnd) || exceptionStart >= exceptionEnd) return bad('分享的课表包含无效的单次调整')
        const exceptionWeek = exception.week, exceptionDay = exception.day
        if (!Number.isInteger(exceptionWeek) || !selected.includes(exceptionWeek as number)) return bad('分享的课表包含无效的单次调整')
        if (!Number.isInteger(exceptionDay) || (exceptionDay as number) < 1 || (exceptionDay as number) > 7) return bad('分享的课表包含无效的单次调整')
        return { week: exceptionWeek as number, cancelled: exception.cancelled === true, day: exceptionDay as number, start: exceptionStart, end: exceptionEnd, room: readText(exception.room, 100) }
      })
      return { id: readText(schedule.id, 100) || `schedule-${scheduleCount}`, day: day as number, start, end, room: readText(schedule.room, 100), weeks: selected, exceptions }
    })
    return { id: readText(course.id, 100) || `course-${courses.length + 1}`, title: readText(course.title, 100) || '未命名课程', teacher: readText(course.teacher, 100), color: typeof course.color === 'string' && /^#[\da-f]{6}$/i.test(course.color) ? course.color : '#17765c', schedules }
  })
  return { title: readText(raw.title, 100), startDate: isValidDate(readText(raw.startDate, 10)) ? readText(raw.startDate, 10) : '', weeks: weeks as number, courses }
}
export async function encodeSemesterShare(value: Semester, options?: ShareOptions): Promise<string> {
  const semester = sanitizeShareSemester(value, options)
  if (!semester.courses.length) throw new Error('当前课表还没有课程，请先添加课程再分享')
  const payload = JSON.stringify(semester)
  const wrapper = JSON.stringify({ v: SHARE_VERSION, sum: shareSum(payload), payload })
  return SHARE_PREFIX + bytesToBase64Url(await shareTransform(new TextEncoder().encode(wrapper), 'deflate'))
}
export async function decodeSemesterShare(code: string): Promise<Semester> {
  const compact = code.replace(/\s+/g, '')
  if (!compact.startsWith(SHARE_PREFIX)) throw new Error('这不是有效的课表分享码，请粘贴完整的 PWS1. 开头文本')
  let wrapper: { v?: unknown; sum?: unknown; payload?: unknown }
  try {
    const json = new TextDecoder().decode(await shareTransform(base64UrlToBytes(compact.slice(SHARE_PREFIX.length)), 'inflate'))
    wrapper = JSON.parse(json)
  } catch { throw new Error('分享码不完整或已损坏，请让同学重新发送完整文本') }
  if (wrapper.v !== SHARE_VERSION) throw new Error('分享码版本不支持，请更新应用后再导入')
  if (typeof wrapper.payload !== 'string' || wrapper.sum !== shareSum(wrapper.payload)) throw new Error('分享码不完整或已损坏，请让同学重新发送完整文本')
  try { return sanitizeShareSemester(JSON.parse(wrapper.payload), { includeExceptions: true }) }
  catch (error) { throw error instanceof Error && error.message.startsWith('分享') ? error : new Error('分享码内容无效或已损坏') }
}
