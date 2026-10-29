import type { Bookmark } from './types'
import type { LocalEntry } from './planner'

export const UNCATEGORIZED = '未分类'
export const MAX_CATEGORY_LENGTH = 12
export const MAX_CATEGORIES = 20
// Built-in tags filter by type, so they can never be used as a category name.
export const RESERVED_CATEGORIES = ['全部', '应用', '网页', UNCATEGORIZED]
export const SHORTCUT_EXTENSIONS = ['.lnk', '.exe', '.url'] as const
// Bumped whenever icon extraction improves: entries cached by an older build are read again,
// so a placeholder saved before the fix never stays on screen.
export const ICON_VERSION = 2

// Category names are typed by hand, so trim, collapse spaces and drop control characters.
export function normalizeCategory(value: unknown): string {
  if (typeof value !== 'string') return ''
  const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  return [...text].slice(0, MAX_CATEGORY_LENGTH).join('').trim()
}
// '' stands for 未分类; every other trimming detail is shared with normalizeCategory.
export function categoryLabel(value: unknown): string { return normalizeCategory(value) || UNCATEGORIZED }
// A category a user may create or rename to: non-empty, not reserved, not a duplicate of `others`.
export function validCategoryName(value: unknown, others: string[] = []): string {
  const name = normalizeCategory(value)
  if (!name) throw new Error('分类名称不能为空')
  if (RESERVED_CATEGORIES.includes(name)) throw new Error(`“${name}”是内置名称，请换一个分类名`)
  if (others.includes(name)) throw new Error(`已经有“${name}”这个分类了`)
  return name
}
// Used for both stored lists and IPC input: dedupe, drop reserved/empty names, keep the given order.
export function cleanCategories(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const result: string[] = []
  for (const item of value) {
    const name = normalizeCategory(item)
    if (!name || RESERVED_CATEGORIES.includes(name) || result.includes(name)) continue
    result.push(name)
    if (result.length >= MAX_CATEGORIES) break
  }
  return result
}
// Tags show the saved order first, then any category still referenced by old or restored data.
export function mergeCategories(stored: string[], used: string[] = []): string[] {
  return cleanCategories([...cleanCategories(stored), ...used])
}
// Empty data URLs and 1px placeholders are what Electron returns for some Store apps and links.
export function iconUsable(width: number, height: number): boolean { return width >= 8 && height >= 8 }
// Dropped files are filtered before they ever reach the main process.
export function shortcutKindOf(pathOrName: string): 'app' | 'url' | null {
  const lower = pathOrName.toLowerCase()
  if (lower.endsWith('.url')) return 'url'
  if (lower.endsWith('.lnk') || lower.endsWith('.exe')) return 'app'
  return null
}
export interface ShortcutItem {
  key: string
  id: string
  kind: 'app' | 'web'
  title: string
  icon: string
  url: string
  category: string
  hint: string
}
export function shortcutItems(entries: LocalEntry[], bookmarks: Bookmark[]): ShortcutItem[] {
  return [
    ...entries.filter(entry => entry.kind === 'app').map(entry => ({
      key: 'app:' + entry.id, id: entry.id, kind: 'app' as const,
      title: entry.title.replace(/\.(exe|lnk)$/i, ''), icon: entry.icon || '', url: '',
      category: normalizeCategory(entry.category), hint: entry.path
    })),
    ...bookmarks.map(bookmark => ({
      key: 'web:' + bookmark.id, id: bookmark.id, kind: 'web' as const,
      title: bookmark.title, icon: '', url: bookmark.url,
      category: normalizeCategory(bookmark.group === UNCATEGORIZED ? '' : bookmark.group), hint: bookmark.url
    }))
  ]
}
// scope is 'all' | 'app' | 'web' or a category name.
export function scopeItems(items: ShortcutItem[], scope: string): ShortcutItem[] {
  if (scope === 'all') return items
  if (scope === 'app' || scope === 'web') return items.filter(item => item.kind === scope)
  return items.filter(item => item.category === scope)
}
export function scopeCount(items: ShortcutItem[], scope: string): number { return scopeItems(items, scope).length }
// Categories referenced by real entries, in first-seen order; used to keep tags in sync with data.
export function usedCategories(items: ShortcutItem[]): string[] {
  const used: string[] = []
  for (const item of items) if (item.category && !used.includes(item.category)) used.push(item.category)
  return used
}
