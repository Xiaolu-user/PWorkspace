export const moduleLabels = { time: '时钟', todos: '今日待办', shortcuts: '快捷方式', ideas: '灵感速记', courses: '本周课程', fitness: '今日健身', files: '常用资料' } as const
export type ModuleKey = keyof typeof moduleLabels
export interface ModuleAppearance { scale: number; fontScale: number }
export interface WeatherLocation { name: string; latitude: number; longitude: number }
export const calendarColorLabels = { festival: '节日与纪念日', solarTerm: '节气', rest: '休 · 放假', work: '班 · 补班', lunar: '农历日期', todo: '待办数量' } as const
export type CalendarColors = Record<keyof typeof calendarColorLabels, string>
export const defaultCalendarColors = (): CalendarColors => ({ festival: '#cd7a21', solarTerm: '#19a68c', rest: '#ff526c', work: '#3599ff', lunar: '#8496ac', todo: '#2fb58d' })
export interface Appearance { theme: 'light' | 'dark'; backgroundColor: string; backgroundImage: string; weatherLocation: WeatherLocation | null; calendarColors: CalendarColors; fontScale: number; dialogScale: number; dialogFontScale: number; modules: Record<ModuleKey, ModuleAppearance> }
export const defaultAppearance = (): Appearance => ({ theme: 'light', backgroundColor: '#eef1f5', backgroundImage: '', weatherLocation: null, calendarColors: defaultCalendarColors(), fontScale: 110, dialogScale: 125, dialogFontScale: 120, modules: Object.fromEntries(Object.keys(moduleLabels).map(key => [key, { scale: 100, fontScale: 100 }])) as Appearance['modules'] })
export function normalizeAppearance(value: unknown): Appearance {
  const defaults = defaultAppearance()
  if (!value || typeof value !== 'object') return defaults
  const raw = value as Partial<Appearance>
  for (const key of Object.keys(calendarColorLabels) as (keyof CalendarColors)[]) {
    const color = raw.calendarColors?.[key]
    if (typeof color === 'string' && /^#[\da-f]{6}$/i.test(color)) defaults.calendarColors[key] = color
  }
  defaults.theme = raw.theme === 'dark' ? 'dark' : 'light'
  if (typeof raw.backgroundColor === 'string' && /^#[\da-f]{6}$/i.test(raw.backgroundColor)) defaults.backgroundColor = raw.backgroundColor
  if (typeof raw.backgroundImage === 'string' && raw.backgroundImage.length <= 8_000_000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(raw.backgroundImage)) defaults.backgroundImage = raw.backgroundImage
  const place = raw.weatherLocation
  if (place && typeof place.name === 'string' && place.name.trim() && Number.isFinite(place.latitude) && Math.abs(place.latitude) <= 90 && Number.isFinite(place.longitude) && Math.abs(place.longitude) <= 180) defaults.weatherLocation = { name: place.name.slice(0, 100), latitude: place.latitude, longitude: place.longitude }
  const number = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback
  defaults.fontScale = number(raw.fontScale, defaults.fontScale, 90, 160)
  defaults.dialogScale = number(raw.dialogScale, defaults.dialogScale, 100, 150)
  defaults.dialogFontScale = number(raw.dialogFontScale, defaults.dialogFontScale, 100, 150)
  for (const key of Object.keys(moduleLabels) as ModuleKey[]) {
    defaults.modules[key] = { scale: number(raw.modules?.[key]?.scale, 100, 80, 140), fontScale: number(raw.modules?.[key]?.fontScale, 100, 80, 160) }
  }
  return defaults
}
