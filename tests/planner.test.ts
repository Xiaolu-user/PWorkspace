import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { Planner } from '../src/main/planner'
import { coursesOn, semesterWeek, type Semester } from '../src/shared/planner'
import { fixture } from './helpers'
const semester: Semester = { title: '2026秋季', startDate: '2026-09-02', weeks: 18, courses: [{ id: '', title: '高等数学', room: 'A302', day: 3, start: '08:00', end: '09:40', firstWeek: 1, lastWeek: 18, parity: 'even' }] }
describe('首页计划与本地入口', () => {
  let f: ReturnType<typeof fixture>; let p: Planner
  beforeEach(() => { f = fixture(); p = new Planner(f.repository) })
  afterEach(() => f.cleanup())
  it('以包含开学日的周一为第一周，跨周、单双周和学期边界正确', () => {
    expect(semesterWeek(semester.startDate, '2026-09-02')).toBe(1)
    expect(semesterWeek(semester.startDate, '2026-09-07')).toBe(2)
    expect(coursesOn(semester, '2026-09-02')).toHaveLength(0)
    expect(coursesOn(semester, '2026-09-09')).toHaveLength(1)
    expect(coursesOn(semester, '2026-09-10')).toHaveLength(0)
    expect(coursesOn(semester, '2026-08-26')).toHaveLength(0)
    expect(coursesOn(semester, '2027-03-10')).toHaveLength(0)
  })
  it('课程、健身及文件入口随数据库备份恢复，移除入口保留文件', async () => {
    p.semester(semester)
    p.workouts([{ day: 3, title: '上肢', minutes: 45, exercises: '俯卧撑 3×12\n拉伸' }])
    const path = join(f.root, '资料.txt'); writeFileSync(path, '个人资料')
    p.add([path, path], 'file'); expect(p.get().entries).toHaveLength(1)
    const backup = join(f.root, 'planner.db'); await f.backup.create(backup)
    const original = p.get(); p.remove(original.entries[0].id); p.workouts([])
    expect(existsSync(path)).toBe(true)
    await f.backup.restore(backup)
    expect(p.get()).toEqual(original)
  })
  it('拒绝无效课程时段、越界周次和重复训练日期且保留原计划', () => {
    p.semester(semester)
    const original = p.get().semester
    expect(() => p.semester({ ...semester, courses: [{ ...semester.courses[0], end: '07:00' }] })).toThrow()
    expect(() => p.semester({ ...semester, courses: [{ ...semester.courses[0], lastWeek: 19 }] })).toThrow()
    expect(() => p.workouts([{ day: 1, title: '一', minutes: 30, exercises: '' }, { day: 1, title: '二', minutes: 30, exercises: '' }])).toThrow()
    expect(p.get().semester).toEqual(original)
    expect(() => p.add(['relative.txt'], 'file')).toThrow()
    expect(() => p.entry('unknown')).toThrow()
  })
})
