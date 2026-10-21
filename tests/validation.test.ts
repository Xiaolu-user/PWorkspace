import { describe, expect, it } from 'vitest'
import { isOverdue, isValidDate, localDate } from '../src/shared/date'
import { bookmarkInput, externalUrl, id, noteInput, taskInput } from '../src/main/validation'
import { task } from './helpers'

describe('本地日期与输入规则', () => {
  it('使用本地日历日期，不把 UTC 时间当作今天', () => {
    expect(localDate(new Date(2026, 9, 20, 0, 5))).toBe('2026-10-20')
    expect(localDate(new Date(2026, 9, 20, 23, 55))).toBe('2026-10-20')
  })
  it('处理闰年、跨月和非法日期', () => {
    expect(isValidDate('2024-02-29')).toBe(true)
    for (const value of ['2026-02-29', '2100-02-29', '2026-04-31', '2026-13-01', '2026-1-01', 'not-a-date']) expect(isValidDate(value)).toBe(false)
  })
  it('只有未完成、过去截止的任务才算逾期', () => {
    const today = '2026-10-20'
    expect(isOverdue(task({ dueDate: '2026-10-19' }), today)).toBe(true)
    expect(isOverdue(task({ dueDate: today }), today)).toBe(false)
    expect(isOverdue(task({ dueDate: '2026-10-21' }), today)).toBe(false)
    expect(isOverdue(task(), today)).toBe(false)
    expect(isOverdue(task({ status: 'done', dueDate: '2026-10-19' }), today)).toBe(false)
  })
  it('拒绝空标题、超长输入、不支持的状态和无效日期', () => {
    expect(() => taskInput(task({ title: '  ' }))).toThrow('标题')
    expect(() => taskInput(task({ title: '字'.repeat(201) }))).toThrow('200')
    expect(() => taskInput({ ...task(), status: 'unexpected' })).toThrow('状态')
    expect(() => taskInput(task({ dueDate: '2026-02-30' }))).toThrow('截止日期')
    expect(() => noteInput({ title: '记录', body: '字'.repeat(200001) })).toThrow('200000')
    expect(() => taskInput(null)).toThrow('格式')
  })
  it('保留中文、多行正文和空格，仅规范标题', () => {
    expect(noteInput({ title: '  今日笔记  ', body: ' 第一行\n第二行\t🌱 ' })).toEqual({ title: '今日笔记', body: ' 第一行\n第二行\t🌱 ' })
    expect(bookmarkInput({ title: '文档', url: 'https://example.com', group: '' }).group).toBe('未分类')
  })
  it('仅接受 HTTP(S) 链接且不含账号密码', () => {
    expect(externalUrl('https://example.com/学习?q=笔记')).toContain('https://example.com/')
    expect(externalUrl('http://localhost:8080')).toBe('http://localhost:8080/')
    for (const value of ['file:///C:/Windows', 'javascript:alert(1)', 'data:text/html,test', 'mailto:test@example.com', 'https://user:password@example.com', 'not a url']) expect(() => externalUrl(value)).toThrow('http')
  })
  it('不允许将 SQL 片段或普通路径当作记录标识', () => {
    expect(() => id("' OR 1=1 --")).toThrow()
    expect(() => id('../workbench.db')).toThrow()
  })
})
