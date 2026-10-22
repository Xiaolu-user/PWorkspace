import { describe, expect, it } from 'vitest'
import { advanceDate, calendarInfo } from '../src/shared/calendar'

describe('日历跳转与节假日', () => {
  it('以选中日为基准加天数，跨月、跨年和闰日正确', () => {
    expect(advanceDate('2026-10-20', 10, 'day')).toBe('2026-10-30')
    expect(advanceDate('2026-12-31', 1, 'day')).toBe('2027-01-01')
    expect(advanceDate('2024-02-28', 1, 'day')).toBe('2024-02-29')
    expect(advanceDate('2026-10-20', 0, 'day')).toBe('2026-10-20')
  })
  it('月末和闰年按目标月最后一天截断', () => {
    expect(advanceDate('2026-01-31', 1, 'month')).toBe('2026-02-28')
    expect(advanceDate('2024-01-31', 1, 'month')).toBe('2024-02-29')
    expect(advanceDate('2024-02-29', 1, 'year')).toBe('2025-02-28')
    expect(advanceDate('2026-12-31', 2, 'month')).toBe('2027-02-28')
  })
  it('空输入、非法数字、非法日期和超出支持年份不改变选中日', () => {
    for (const value of [NaN, Infinity, -1, 0.5, 1e10]) expect(advanceDate('2026-10-20', value, 'day')).toBeNull()
    expect(advanceDate('2026-02-30', 1, 'day')).toBeNull()
    expect(advanceDate('9999-12-31', 1, 'day')).toBeNull()
  })
  it('显示农历、公历节日和节气，2026 休假补班与官方安排一致', () => {
    expect(calendarInfo('2026-02-16').names).toContain('除夕')
    expect(calendarInfo('2026-02-17').names).toContain('春节')
    expect(calendarInfo('2026-09-25').names).toContain('中秋节')
    expect(calendarInfo('2026-04-05').names).toContain('清明')
    for (const date of ['2026-01-01', '2026-01-03', '2026-02-15', '2026-02-23', '2026-04-04', '2026-04-06', '2026-05-01', '2026-05-05', '2026-06-19', '2026-06-21', '2026-09-25', '2026-09-27', '2026-10-01', '2026-10-07']) { const info = calendarInfo(date); expect(info.holiday, date).not.toBe(''); expect(info.work, date).toBe(false) }
    for (const date of ['2026-01-04', '2026-02-14', '2026-02-28', '2026-05-09', '2026-09-20', '2026-10-10']) expect(calendarInfo(date).work, date).toBe(true)
    expect(calendarInfo('2027-01-01').scheduleKnown).toBe(false)
    expect(calendarInfo('2027-01-01').names).toContain('元旦节')
  })
})
