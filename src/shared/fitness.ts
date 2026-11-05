import { localDate } from './date'
export type Measure = 'weight' | 'time' | 'distance'
export interface Exercise { id: string; name: string; alias: string; part: string; muscles: string[]; secondary: string[]; equipment: string; measure: Measure; description: string; notes: string; image: string; images: string[]; favorite: boolean; tags: string[]; artworkStatus?: 'ready' | 'pending'; sourceName?: string }
export interface FitnessSet { weight: number | null; reps: number | null; duration: number | null; distance: number | null }
export interface FitnessItem { exerciseId: string; sets: FitnessSet[]; rest: number; restUnit?: 'seconds' | 'minutes'; notes: string; group?: string }
export interface TrainingDay { title: string; type: string; templateId: string; items: FitnessItem[]; notes: string }
export interface TrainingTemplate extends TrainingDay { id: string }
export interface TrainingRecord { id: string; date: string; title: string; type: string; minutes: number | null; notes: string; tags: string; source: string; items: FitnessItem[]; updated: string; extra?: string }
export interface FitnessData { name: string; startDate: string; mode: string; rhythm: TrainingDay[]; overrides: Record<string, TrainingDay[]>; templates: TrainingTemplate[]; exercises: Exercise[]; records: TrainingRecord[]; templateSeeded?: boolean; catalogVersion?: number }
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
export const newSet = (): FitnessSet => ({ weight: null, reps: null, duration: null, distance: null })
export const newDay = (title = '自定义训练', type = '自定义'): TrainingDay => ({ title, type, templateId: '', items: [], notes: '' })
export const addDays = (date: string, days: number): string => { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() + days); return localDate(d) }
export const daysBetween = (a: string, b: string): number => Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / 86400000)
export const cycleOn = (data: FitnessData, date: string): number => data.rhythm.length && data.startDate ? Math.floor(daysBetween(data.startDate, date) / data.rhythm.length) : 0
export const cycleDays = (data: FitnessData, cycle: number): TrainingDay[] => data.overrides[String(cycle)] || data.rhythm
export const dayOn = (data: FitnessData, date: string): TrainingDay | undefined => { if (!data.rhythm.length || !data.startDate) return undefined; const n = daysBetween(data.startDate, date); return n < 0 ? undefined : cycleDays(data, Math.floor(n / data.rhythm.length))[n % data.rhythm.length] }
export const volume = (items: FitnessItem[]): number => items.reduce((a, item) => a + item.sets.reduce((s, set) => s + (set.weight !== null && set.reps !== null ? set.weight * set.reps : 0), 0), 0)
export const setCount = (items: FitnessItem[]): number => items.reduce((a, item) => a + item.sets.length, 0)
export function emptyFitness(): FitnessData {
  return { name: '', startDate: '', mode: '默认重复', rhythm: [], overrides: {}, templates: [], exercises: [], records: [] }
}

export const restValue = (item: FitnessItem): number => item.restUnit === 'minutes' ? Number((item.rest / 60).toFixed(4)) : item.rest
export const formatRest = (item: FitnessItem): string => `${restValue(item)} ${item.restUnit === 'minutes' ? '分钟' : '秒'}`
