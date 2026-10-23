import type { WeatherLocation } from '../shared/appearance'
import type { Weather } from '../shared/weather'
import { AppError } from './errors'

// Requests run in the main process; renderer remains offline-only under its CSP.
export class WeatherService {
  private cached: { key: string; value: Weather; expires: number } | null = null
  constructor(private request: typeof fetch = fetch) {}
  private async json(url: string): Promise<any> {
    try {
      const result = await this.request(url, { signal: AbortSignal.timeout(12000) })
      if (!result.ok) throw new Error('weather response')
      return await result.json()
    } catch { throw new AppError('IO', '天气服务暂时不可用，请检查网络后重试') }
  }
  async search(query: unknown): Promise<WeatherLocation[]> {
    if (typeof query !== 'string' || query.trim().length < 2 || query.length > 100) throw new AppError('VALIDATION', '请输入至少两个字的城市名')
    const data = await this.json(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=8&language=zh&format=json`)
    return (data.results || []).map((p: any) => ({ name: [...new Set([p.name, p.admin1, p.country].filter(Boolean))].join(' · '), latitude: p.latitude, longitude: p.longitude }))
  }
  async current(place: WeatherLocation | null): Promise<Weather | null> {
    if (!place) return null
    const key = `${place.latitude},${place.longitude}`
    if (this.cached?.key === key && this.cached.expires > Date.now()) return this.cached.value
    const data = await this.json(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`)
    const { temperature_2m: temperature, weather_code: code, is_day: isDay } = data.current || {}
    const low = data.daily?.temperature_2m_min?.[0], high = data.daily?.temperature_2m_max?.[0]
    if (![temperature, code, low, high].every(Number.isFinite)) throw new AppError('IO', '暂未获得该城市的天气，请稍后重试')
    const value = { temperature: Math.round(temperature), low: Math.round(low), high: Math.round(high), code, isDay: isDay === 1, updatedAt: new Date().toISOString() }
    this.cached = { key, value, expires: Date.now() + 15 * 60_000 }
    return value
  }
}
