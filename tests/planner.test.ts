import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { Planner } from '../src/main/planner'
import { coursesOn, semesterWeek, upgradeSemester, parseWeeks, formatWeeks, courseOccurrences, courseConflicts, type Semester, type LegacySemester } from '../src/shared/planner'
import { fixture } from './helpers'
const semester: LegacySemester = { title: '2026秋季', startDate: '2026-09-02', weeks: 18, courses: [{ id: '', title: '高等数学', room: 'A302', day: 3, start: '08:00', end: '09:40', firstWeek: 1, lastWeek: 18, parity: 'even' }] }
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
  it('旧版同名课程合并，单双周、教室和稳定编号保留', () => {
    const old: LegacySemester = { ...semester, courses: [{ ...semester.courses[0], id: 'old-a' }, { ...semester.courses[0], id: 'old-b', day: 5, room: 'B203', parity: 'odd' }] }
    f.repository.writeSetting('semester', old)
    const upgraded = p.get().semester
    expect(upgraded).toEqual(upgradeSemester(old))
    expect(upgraded.courses).toHaveLength(1)
    expect(upgraded.courses[0].schedules.map(s => s.id)).toEqual(['old-a', 'old-b'])
    expect(coursesOn(upgraded, '2026-09-04')[0].room).toBe('B203')
    expect(coursesOn(upgraded, '2026-09-09')[0].room).toBe('A302')
    p.semester(upgraded)
    expect(p.get().semester).toEqual(upgraded)
  })
  it('任意周次与同课不同教室按实际日期展开，单次调整和停课独立生效', async () => {
    const value = flexibleSemester()
    expect(courseOccurrences(value)).toHaveLength(8)
    expect(coursesOn(value, '2026-10-05')[0].room).toBe('獐子岛226')
    expect(coursesOn(value, '2026-10-08')[0].room).toBe('海洋楼301')
    expect(coursesOn(value, '2026-10-12')).toHaveLength(0)
    value.courses[0].schedules[0].exceptions.push({ week: 5, day: 2, start: '10:00', end: '11:30', room: '临时教室', cancelled: false })
    value.courses[0].schedules[1].exceptions.push({ week: 8, day: 4, start: '18:30', end: '20:05', room: '海洋楼301', cancelled: true })
    expect(coursesOn(value, '2026-10-05')).toHaveLength(0)
    expect(coursesOn(value, '2026-10-06')[0]).toMatchObject({ room: '临时教室', modified: true })
    expect(coursesOn(value, '2026-10-29')).toHaveLength(0)
    expect(coursesOn(value, '2026-11-12')[0].room).toBe('海洋楼301')
    p.semester(value)
    const backup = join(f.root, 'flexible.db'); await f.backup.create(backup)
    p.semester({ ...value, courses: [] }); await f.backup.restore(backup)
    expect(new Planner(f.repository).get().semester).toEqual(value)
    value.courses[0].schedules[0].exceptions = []
    p.semester(value)
    expect(coursesOn(p.get().semester, '2026-10-05')[0].room).toBe('獐子岛226')
  })
  it('周次输入支持范围、中文分隔、去重，拒绝歧义与越界', () => {
    expect(parseWeeks('3，5、8-10,9', 18)).toEqual([3,5,8,9,10])
    expect(formatWeeks([10,3,8,9,5,3])).toBe('3、5、8-10')
    for (const input of ['0','19','5-3','3.5','1,','1-99','NaN']) expect(parseWeeks(input,18)).toBeNull()
    expect(parseWeeks('',18)).toEqual([])
  })
  it('冲突按实际周次及时间交集判断，同课也提示，相邻与停课不误报', () => {
    const value = flexibleSemester(), first = value.courses[0].schedules[0]
    value.courses.push({ id: 'other', title: '高数', teacher: '', color: '#336699', schedules: [{ ...first, id: 'other-rule', weeks: [5,6], start: '14:00' }] })
    expect(courseConflicts(courseOccurrences(value))).toHaveLength(1)
    value.courses[1].schedules[0].start = first.end
    value.courses[1].schedules[0].end = '16:00'
    expect(courseConflicts(courseOccurrences(value))).toHaveLength(0)
    value.courses[1].schedules[0].start = '14:00'
    value.courses[1].schedules[0].exceptions = [{ ...first, week: 5, cancelled: true }]
    expect(courseConflicts(courseOccurrences(value))).toHaveLength(0)
    value.courses[0].schedules.push({ ...first, id: 'duplicate', weeks: [3] })
    expect(courseConflicts(courseOccurrences(value))).toHaveLength(1)
  })
  it('新安排校验失败不覆盖原数据', () => {
    const value = flexibleSemester(); p.semester(value)
    const invalidRules = [
      { weeks: [] }, { weeks: [19] }, { end: '12:00' }, { day: 8 },
      { exceptions: [{ week: 4, day: 1, start: '08:00', end: '09:00', room: '', cancelled: false }] },
      { exceptions: [{ week: 5, day: 1, start: '09:00', end: '08:00', room: '', cancelled: false }] }
    ]
    for (const change of invalidRules) {
      const draft = structuredClone(value); Object.assign(draft.courses[0].schedules[0], change)
      expect(() => p.semester(draft)).toThrow()
      expect(p.get().semester).toEqual(value)
    }
    const draft = structuredClone(value); draft.courses[0].schedules[1].id = draft.courses[0].schedules[0].id
    expect(() => p.semester(draft)).toThrow()
  })
})
function flexibleSemester(): Semester {
  return { title: '2026秋季', startDate: '2026-09-07', weeks: 18, courses: [{ id: 'machine-learning', title: '机器学习', teacher: '王老师', color: '#17765c', schedules: [
    { id: 'monday', day: 1, start: '13:30', end: '15:05', room: '獐子岛226', weeks: [3,5,8,9,10], exceptions: [] },
    { id: 'thursday', day: 4, start: '18:30', end: '20:05', room: '海洋楼301', weeks: [5,8,10], exceptions: [] }
  ] }] }
}
