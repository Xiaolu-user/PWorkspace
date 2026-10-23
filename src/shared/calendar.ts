import { Solar, HolidayUtil } from 'lunar-typescript'
import { isValidDate, localDate } from './date'

export function advanceDate(date: string, amount: number, unit: 'year' | 'month' | 'day'): string | null {
  if (!isValidDate(date) || !Number.isSafeInteger(amount) || amount < 0) return null
  const current = new Date(`${date}T12:00:00`)
  if (unit === 'day') current.setDate(current.getDate() + amount)
  else {
    const originalDay = current.getDate()
    current.setDate(1)
    if (unit === 'year') current.setFullYear(current.getFullYear() + amount)
    else current.setMonth(current.getMonth() + amount)
    const last = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate()
    current.setDate(Math.min(originalDay, last))
  }
  const result = localDate(current)
  return isValidDate(result) ? result : null
}

export function calendarInfo(date: string): { names: string[]; entries: { name: string; kind: 'festival' | 'solarTerm' }[]; lunar: string; holiday: string; work: boolean; scheduleKnown: boolean } {
  const [year, month, day] = date.split('-').map(Number)
  const solar = Solar.fromYmd(year, month, day); const lunar = solar.getLunar()
  const holiday = HolidayUtil.getHoliday(date)
  const term = lunar.getJieQi()
  const names = [...new Set([...solar.getFestivals(), ...lunar.getFestivals(), ...solar.getOtherFestivals(), ...lunar.getOtherFestivals(), term, holiday && !holiday.isWork() ? holiday.getName() : ''].filter(Boolean))]
  return { names, entries: names.map(name => ({ name, kind: name === term ? 'solarTerm' : 'festival' })), lunar: `${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`, holiday: holiday?.getName() || '', work: holiday?.isWork() || false, scheduleKnown: HolidayUtil.getHolidays(year).length > 0 }
}
