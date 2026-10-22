export const moduleLabels = { time: '时钟', todos: '今日待办', shortcuts: '快捷方式', ideas: '灵感速记', courses: '本周课程', fitness: '今日健身', files: '常用资料' } as const
export type ModuleKey = keyof typeof moduleLabels
export interface ModuleAppearance { scale: number; fontScale: number }
export interface Appearance { fontScale: number; dialogScale: number; dialogFontScale: number; modules: Record<ModuleKey, ModuleAppearance> }
export const defaultAppearance = (): Appearance => ({ fontScale: 110, dialogScale: 125, dialogFontScale: 120, modules: Object.fromEntries(Object.keys(moduleLabels).map(key => [key, { scale: 100, fontScale: 100 }])) as Appearance['modules'] })
export function normalizeAppearance(value: unknown): Appearance {
  const defaults = defaultAppearance()
  if (!value || typeof value !== 'object') return defaults
  const raw = value as Partial<Appearance>
  const number = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback
  defaults.fontScale = number(raw.fontScale, defaults.fontScale, 90, 160)
  defaults.dialogScale = number(raw.dialogScale, defaults.dialogScale, 100, 150)
  defaults.dialogFontScale = number(raw.dialogFontScale, defaults.dialogFontScale, 100, 150)
  for (const key of Object.keys(moduleLabels) as ModuleKey[]) {
    defaults.modules[key] = { scale: number(raw.modules?.[key]?.scale, 100, 80, 140), fontScale: number(raw.modules?.[key]?.fontScale, 100, 80, 160) }
  }
  return defaults
}
