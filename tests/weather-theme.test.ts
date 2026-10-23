import { describe, expect, it, vi } from 'vitest'
import { WeatherService } from '../src/main/weather'
import { defaultAppearance, defaultCalendarColors, normalizeAppearance } from '../src/shared/appearance'
import { fixture } from './helpers'
import { join } from 'node:path'
import { DatabaseStore } from '../src/main/database'
import { Repository } from '../src/main/repository'

describe('主题、背景与天气', () => {
  it('旧设置补全默认主题，拒绝外部图片地址及无效颜色、城市坐标', () => {
    expect(normalizeAppearance({ fontScale: 120 }).theme).toBe('light')
    const value = normalizeAppearance({ theme: 'unknown', backgroundColor: 'red;url(x)', backgroundImage: 'https://example.com/x.png', weatherLocation: { name: '错误位置', latitude: 999, longitude: 0 } })
    expect(value).toEqual(defaultAppearance())
  })
  it('主题、内嵌图片及城市随备份恢复，并在重启后保留', async () => {
    const f = fixture()
    try {
      const appearance = { ...defaultAppearance(), theme: 'dark' as const, backgroundColor: '#f5f2ed', backgroundImage: 'data:image/png;base64,aGVsbG8=', weatherLocation: { name: '上海', latitude: 31.23, longitude: 121.47 }, calendarColors: { ...defaultCalendarColors(), festival: '#e68234', rest: '#ff3344', work: '#4488ff' } }
      f.repository.setAppearance(appearance)
      const path = join(f.root, 'theme.db'); await f.backup.create(path)
      f.repository.setAppearance(defaultAppearance()); await f.backup.restore(path)
      f.store.close(); const reopened = new DatabaseStore(f.store.path)
      try { expect(new Repository(reopened).preferences().appearance).toEqual(appearance) } finally { reopened.close() }
    } finally { f.cleanup() }
  })
  it('旧设置补全日历默认颜色，逐项拒绝无效颜色', () => {
    expect(normalizeAppearance({}).calendarColors).toEqual(defaultCalendarColors())
    expect(normalizeAppearance({ calendarColors: { festival: '#112233', rest: 'red;url(x)', work: null } }).calendarColors).toEqual({ ...defaultCalendarColors(), festival: '#112233' })
  })
  it('未选城市不联网，已选城市天气缓存，换城市重新请求', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ current: { temperature_2m: 22.8, weather_code: 2, is_day: 1 }, daily: { temperature_2m_min: [18.1], temperature_2m_max: [25.9] } }) })
    const service = new WeatherService(request)
    expect(await service.current(null)).toBeNull(); expect(request).not.toHaveBeenCalled()
    const place = { name: '上海', latitude: 31.23, longitude: 121.47 }
    expect(await service.current(place)).toMatchObject({ temperature: 23, low: 18, high: 26, isDay: true })
    await service.current(place); expect(request).toHaveBeenCalledTimes(1)
    await service.current({ ...place, longitude: 120 }); expect(request).toHaveBeenCalledTimes(2)
  })
  it('天气断网与空数据返回可读错误，不生成示例温度', async () => {
    const place = { name: '上海', latitude: 31.23, longitude: 121.47 }
    await expect(new WeatherService(vi.fn().mockRejectedValue(new Error('offline'))).current(place)).rejects.toThrow('天气服务暂时不可用')
    await expect(new WeatherService(vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })).current(place)).rejects.toThrow('暂未获得')
  })
})
