import { addDays, daysBetween, type TrainingRecord } from '../../../shared/fitness'

export type FrequencyGroup = 'day' | 'week' | 'month' | 'cycle'
export interface FrequencyBucket { label: string; title: string; start: string; end: string; records: TrainingRecord[] }
export function trainingFrequency(records: TrainingRecord[], from: string, to: string, group: FrequencyGroup, planStart: string, cycleLength: number): FrequencyBucket[] {
  if (!from || !to || from > to) return []
  const result: FrequencyBucket[] = []
  let cursor = from
  while (cursor <= to) {
    let periodStart = cursor, next: string, name = ''
    if (group === 'week') {
      periodStart = addDays(cursor, -(new Date(cursor + 'T12:00:00').getDay() + 6) % 7)
      next = addDays(periodStart, 7)
    } else if (group === 'month') {
      periodStart = cursor.slice(0, 7) + '-01'
      const year = Number(cursor.slice(0, 4)), month = Number(cursor.slice(5, 7))
      next = `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-01`
      name = `${year}年${month}月`
    } else if (group === 'cycle' && cursor < planStart) {
      next = planStart
      name = '计划开始前'
    } else if (group === 'cycle') {
      const index = Math.floor(daysBetween(planStart, cursor) / cycleLength)
      periodStart = addDays(planStart, index * cycleLength)
      next = addDays(periodStart, cycleLength)
      name = `第 ${index + 1} 训练周期`
    } else next = addDays(cursor, 1)
    const end = [to, addDays(next, -1)].sort()[0]
    const short = (d: string) => d.slice(5).replace('-', '.')
    const range = cursor === end ? short(cursor) : `${short(cursor)}–${short(end)}`
    const title = `${name ? name + ' · ' : ''}${cursor} 至 ${end}`
    result.push({ label: group === 'month' ? name : group === 'cycle' ? name.replace('训练周期', '周期') : range, title, start: cursor, end, records: records.filter(r => r.date >= cursor && r.date <= end) })
    cursor = next
  }
  return result
}
