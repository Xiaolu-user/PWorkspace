export interface Course { id: string; title: string; room: string; day: number; start: string; end: string; firstWeek: number; lastWeek: number; parity: 'all' | 'odd' | 'even' }
export interface Semester { title: string; startDate: string; weeks: number; courses: Course[] }
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
export function coursesOn(semester: Semester, date: string): Course[] {
  const week = semesterWeek(semester.startDate, date)
  if (week < 1 || week > semester.weeks) return []
  const day = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7 + 1
  return semester.courses.filter(c => c.day === day && week >= c.firstWeek && week <= c.lastWeek && (c.parity === 'all' || (week % 2 === 1 ? c.parity === 'odd' : c.parity === 'even'))).sort((a, b) => a.start.localeCompare(b.start))
}
