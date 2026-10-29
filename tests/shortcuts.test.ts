import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Planner } from '../src/main/planner'
import { executableIcon } from '../src/main/exeicon'
import { fixture } from './helpers'
import type { LocalEntry } from '../src/shared/planner'
import type { Bookmark } from '../src/shared/types'
import { ICON_VERSION, UNCATEGORIZED, cleanCategories, iconUsable, mergeCategories, normalizeCategory, scopeCount, scopeItems, shortcutItems, shortcutKindOf, usedCategories, validCategoryName } from '../src/shared/shortcuts'

const entry = (over: Partial<LocalEntry> = {}): LocalEntry => ({ id: 'e1', title: 'Code.exe', path: 'C:\\Code.exe', kind: 'app', ...over })
const bookmark = (over: Partial<Bookmark> = {}): Bookmark => ({ id: 'b1', title: 'GitHub', url: 'https://github.com', group: UNCATEGORIZED, createdAt: '', updatedAt: '', ...over })

describe('快捷方式分类与入口', () => {
  it('分类名去除多余空白、限制 12 字，并拒绝内置名称与重名', () => {
    expect(normalizeCategory('  开发  ')).toBe('开发')
    expect(normalizeCategory('学习\t工具')).toBe('学习 工具')
    expect(normalizeCategory('一二三四五六七八九十十一十二十三')).toHaveLength(12)
    expect(normalizeCategory(undefined)).toBe('')
    expect(normalizeCategory(42)).toBe('')
    expect(validCategoryName(' 影音 ')).toBe('影音')
    expect(() => validCategoryName('   ')).toThrow('不能为空')
    expect(() => validCategoryName('未分类')).toThrow('内置名称')
    expect(() => validCategoryName('应用')).toThrow('内置名称')
    expect(() => validCategoryName('开发', ['开发'])).toThrow('已经有')
  })
  it('保存的分类去重、去掉内置名称并限制 20 个', () => {
    expect(cleanCategories(['开发', '开发', '未分类', '全部', '', '影音'])).toEqual(['开发', '影音'])
    expect(cleanCategories(null)).toEqual([])
    expect(cleanCategories(Array.from({ length: 30 }, (_, i) => 'C' + i))).toHaveLength(20)
  })
  it('标签顺序先按保存顺序，再补上数据里仍在使用的分类', () => {
    expect(mergeCategories(['开发'], ['影音', '开发', '学习'])).toEqual(['开发', '影音', '学习'])
    expect(mergeCategories([], [])).toEqual([])
  })
  it('合并应用与网页条目，应用去掉扩展名、网页分组归入未分类', () => {
    const items = shortcutItems([entry({ category: '开发' }), entry({ id: 'e2', title: '资料.pdf', kind: 'file' })], [bookmark(), bookmark({ id: 'b2', group: '学习' })])
    expect(items.map(item => [item.kind, item.title, item.category])).toEqual([['app', 'Code', '开发'], ['web', 'GitHub', ''], ['web', 'GitHub', '学习']])
    expect(items[1].icon).toBe('')
    expect(usedCategories(items)).toEqual(['开发', '学习'])
    expect(scopeItems(items, 'all')).toHaveLength(3)
    expect(scopeCount(items, 'app')).toBe(1)
    expect(scopeCount(items, 'web')).toBe(2)
    expect(scopeCount(items, '开发')).toBe(1)
    expect(scopeCount(items, '不存在')).toBe(0)
  })
  it('空图标、过小图标与拖入文件类型都有明确判定', () => {
    expect(iconUsable(32, 32)).toBe(true)
    expect(iconUsable(0, 0)).toBe(false)
    expect(iconUsable(4, 32)).toBe(false)
    expect(shortcutKindOf('C:\\A.LNK')).toBe('app')
    expect(shortcutKindOf('C:\\b.exe')).toBe('app')
    expect(shortcutKindOf('C:\\c.url')).toBe('url')
    expect(shortcutKindOf('C:\\d.png')).toBeNull()
  })

  describe('仓储写入分类', () => {
    let f: ReturnType<typeof fixture>; let p: Planner
    beforeEach(() => { f = fixture(); p = new Planner(f.repository) })
    afterEach(() => f.cleanup())
    it('批量导入按分类写入，并统计重复与缺失文件', () => {
      const a = join(f.root, 'a.lnk'), b = join(f.root, 'b.lnk')
      writeFileSync(a, ''); writeFileSync(b, '')
      expect(p.addEntries([a, b, a], ' 开发 ')).toEqual({ added: 2, duplicates: 1, missing: 0 })
      expect(p.get().entries.map(item => item.category)).toEqual(['开发', '开发'])
      expect(p.addEntries([join(f.root, 'missing.lnk')], '开发')).toEqual({ added: 0, duplicates: 0, missing: 1 })
      expect(p.get().entries).toHaveLength(2)
    })
    it('分类改名同步迁移入口，删除分类把入口退回未分类', () => {
      const a = join(f.root, 'a.lnk'), b = join(f.root, 'b.lnk')
      writeFileSync(a, ''); writeFileSync(b, '')
      p.add([a], 'app', '开发'); p.add([b], 'app', '开发')
      p.categories(['开发', '影音'])
      p.renameCategory('开发', '编程')
      expect(p.get().categories).toEqual(['编程', '影音'])
      expect(p.get().entries.every(item => item.category === '编程')).toBe(true)
      expect(() => p.renameCategory('编程', '未分类')).toThrow('内置名称')
      p.removeCategory('编程')
      expect(p.get().categories).toEqual(['影音'])
      expect(p.get().entries.every(item => item.category === '')).toBe(true)
    })
    it('单个入口可改分类，文件入口不允许归类，分类数量有上限', () => {
      const a = join(f.root, 'a.lnk'), doc = join(f.root, 'd.txt')
      writeFileSync(a, ''); writeFileSync(doc, '资料')
      p.add([a], 'app'); p.add([doc], 'file')
      const app = p.get().entries.find(item => item.kind === 'app')!
      p.setCategory(app.id, '学习')
      expect(p.get().entries.find(item => item.id === app.id)?.category).toBe('学习')
      const file = p.get().entries.find(item => item.kind === 'file')!
      expect(() => p.setCategory(file.id, '学习')).toThrow('应用快捷方式')
      expect(() => p.setCategory('missing', '学习')).toThrow('不存在')
      expect(() => p.categories(Array.from({ length: 21 }, (_, i) => 'C' + i))).toThrow('最多')
    })
    it('图标按条目缓存，空值不会覆盖已有图标', () => {
      const a = join(f.root, 'a.lnk'); writeFileSync(a, '')
      p.add([a], 'app')
      const id = p.get().entries[0].id
      p.saveIcon(id, 'data:image/png;base64,AAAA')
      expect(p.get().entries[0].icon).toBe('data:image/png;base64,AAAA')
      p.saveIcon(id, '')
      expect(p.get().entries[0].icon).toBe('data:image/png;base64,AAAA')
    })
    it('图标带版本号：升级后重取，取不到时清掉旧占位', () => {
      const a = join(f.root, 'a.lnk'); writeFileSync(a, '')
      p.add([a], 'app')
      const id = p.get().entries[0].id
      // An entry cached by an older build has no version and may hold a generic placeholder.
      f.repository.writeSetting('localEntries', [{ id, title: 'a.lnk', path: a, kind: 'app', icon: 'data:image/png;base64,OLD' }])
      expect(p.get().entries[0].iconVersion).toBeUndefined()
      p.markIcons({ [id]: '' })
      expect(p.get().entries[0].icon).toBe('')
      expect(p.get().entries[0].iconVersion).toBe(ICON_VERSION)
      p.markIcons({ [id]: 'data:image/png;base64,NEW' })
      expect(p.get().entries[0].icon).toBe('data:image/png;base64,NEW')
      p.markIcons({ [id]: 'not-an-image' })
      expect(p.get().entries[0].icon).toBe('')
    })
    it('可执行文件图标直接从资源表读取，坏文件不会抛错', () => {
      const text = join(f.root, 'plain.exe'); writeFileSync(text, 'not a portable executable')
      expect(executableIcon(text)).toBeNull()
      expect(executableIcon(join(f.root, 'missing.exe'))).toBeNull()
      // Real programs are read in place, so the helper must never return anything but PNG bytes.
      const png = process.platform === 'win32' ? executableIcon(process.execPath) : null
      if (png) expect(png.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    })
    it('网页分类改名时链接同步移动', () => {
      const created = f.repository.createBookmark({ title: '文档', url: 'https://example.com', group: '开发' })
      f.repository.renameBookmarkGroup('开发', '编程')
      expect(f.repository.bookmarks().find(item => item.id === created.id)?.group).toBe('编程')
    })
  })
})
