import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseStore } from '../src/main/database'
import { Repository } from '../src/main/repository'
import { fixture, task } from './helpers'

describe('真实 SQLite 数据和查询', () => {
  let f: ReturnType<typeof fixture>
  beforeEach(() => { f = fixture() })
  afterEach(() => { f.cleanup() })
  it('任务创建、修改、完成后可以在重启时读取，删除后不存在', () => {
    const created = f.repository.createTask(task())
    expect(created.id).toMatch(/^[\da-f-]{36}$/)
    const updated = f.repository.updateTask(created.id, task({ title: '新的标题', status: 'done', dueDate: '2026-10-20', priority: 'high' }))
    expect(updated.createdAt).toBe(created.createdAt)
    f.store.close()
    const reopened = new DatabaseStore(f.store.path)
    try {
      const repository = new Repository(reopened)
      expect(repository.task(created.id)).toEqual(updated)
      repository.removeTask(created.id)
      expect(repository.tasks()).toHaveLength(0)
      expect(() => repository.task(created.id)).toThrow('不存在')
    } finally { reopened.close() }
  })
  it('中文笔记、链接和设置可完整保存', () => {
    const note = f.repository.saveNote(null, { title: '学习札记', body: '中文正文\n第二行 🌱\n  缩进' })
    const changed = f.repository.saveNote(note.id, { title: '修改后的札记', body: '' })
    expect(f.repository.note(note.id).body).toBe('')
    expect(changed.createdAt).toBe(note.createdAt)
    const bookmark = f.repository.createBookmark({ title: '学习文档', url: 'https://example.com/docs', group: '学习' })
    f.repository.updateBookmark(bookmark.id, { title: '新文档', url: 'https://example.com/new', group: '资料' })
    expect(f.repository.bookmarks()[0].group).toBe('资料')
    f.repository.setCloseBehavior('quit')
    expect(f.repository.preferences().closeBehavior).toBe('quit')
    f.repository.removeNote(note.id)
    f.repository.removeBookmark(bookmark.id)
    expect(f.repository.notes()).toEqual([])
    expect(f.repository.bookmarks()).toEqual([])
  })
  it('首页按日期与状态聚合，不重复保存统计', () => {
    f.repository.createTask(task({ dueDate: '2026-10-20' }))
    f.repository.createTask(task({ dueDate: '2026-10-19' }))
    f.repository.createTask(task({ dueDate: '2026-10-21' }))
    f.repository.createTask(task())
    f.repository.createTask(task({ dueDate: '2026-10-19', status: 'done' }))
    const summary = f.repository.dashboard('2026-10-20')
    expect(summary.today).toHaveLength(1)
    expect(summary.overdue).toHaveLength(1)
    expect(summary.totalTodo).toBe(4)
    expect(summary.totalDone).toBe(1)
  })
  it('搜索正文和网址，并将 %、_、反斜杠作为普通字符处理', () => {
    f.repository.createTask(task({ title: '今天完成 100%', description: '路径 C:\\资料' }))
    f.repository.saveNote(null, { title: '普通标题', body: '正文里有中文检索词与下划线 _' })
    f.repository.createBookmark({ title: '官网', url: 'https://example.com/chinese', group: '' })
    expect(f.repository.search('检索词').notes).toHaveLength(1)
    expect(f.repository.search('chinese').bookmarks).toHaveLength(1)
    expect(f.repository.search('%').tasks).toHaveLength(1)
    expect(f.repository.search('%').notes).toHaveLength(0)
    expect(f.repository.search('_').notes).toHaveLength(1)
    expect(f.repository.search('\\').tasks).toHaveLength(1)
    expect(f.repository.search("' OR 1=1 --")).toEqual({ tasks: [], notes: [], bookmarks: [] })
    expect(f.repository.search('')).toEqual({ tasks: [], notes: [], bookmarks: [] })
  })
  it('写入失败不会返回成功或改变原有内容', () => {
    const note = f.repository.saveNote(null, { title: '要保留的笔记', body: '保存前的内容' })
    f.store.connection.pragma('query_only = ON')
    expect(() => f.repository.saveNote(note.id, { title: '新标题', body: '这次保存应失败' })).toThrow()
    expect(f.repository.note(note.id)).toEqual(note)
    f.store.connection.pragma('query_only = OFF')
    expect(f.repository.saveNote(note.id, { title: '恢复写入', body: '成功' }).body).toBe('成功')
  })
  it('备份恢复维护期间阻止新读写，维护结束后恢复', async () => {
    let release!: () => void
    const pending = f.store.exclusive(() => new Promise<void>(resolve => { release = resolve }))
    expect(() => f.repository.createTask(task())).toThrow('正在备份或恢复')
    expect(() => f.repository.tasks()).toThrow('正在备份或恢复')
    release(); await pending
    expect(f.repository.createTask(task()).title).toBe('整理今天的工作')
  })
  it('每类 1000 条记录可进行查询与聚合', () => {
    f.store.connection.transaction(() => {
      for (let index = 0; index < 1000; index++) {
        f.repository.createTask(task({ title: `性能测试任务 ${index}`, dueDate: '2026-10-20' }))
        f.repository.saveNote(null, { title: `性能测试笔记 ${index}`, body: '中文长段落 '.repeat(30) })
        f.repository.createBookmark({ title: `性能测试链接 ${index}`, url: `https://example.com/${index}`, group: `组 ${index % 5}` })
      }
    })()
    const started = performance.now()
    expect(f.repository.search('性能测试').tasks).toHaveLength(1000)
    expect(f.repository.search('中文长段落').notes).toHaveLength(1000)
    expect(f.repository.bookmarks()).toHaveLength(1000)
    expect(f.repository.dashboard('2026-10-20').totalTodo).toBe(1000)
    const elapsed = performance.now() - started
    console.log(`3000 条记录查询与聚合耗时：${elapsed.toFixed(1)} ms`)
    expect(elapsed).toBeLessThan(5000)
  })
})
