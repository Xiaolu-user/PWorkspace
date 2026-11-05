import { describe, expect, it } from 'vitest'
import { fixture } from './helpers'
import { Planner } from '../src/main/planner'
import { emptyFitness, dayOn, cycleOn } from '../src/shared/fitness'
describe('新用户空白初始化',()=>{
 it('读取课程不生成学期、课程或示例数据',()=>{const f=fixture();try{const p=new Planner(f.repository);expect(p.get().semesters).toEqual([]);expect(p.get().semester.courses).toEqual([]);expect(p.get().semester.startDate).toBe('');expect(f.repository.readSetting('semesters',null)).toBeNull()}finally{f.cleanup()}})
 it('空白健身数据没有循环、日期、模板或记录，查询当天安全返回无安排',()=>{const data=emptyFitness();expect(data.rhythm).toEqual([]);expect(data.templates).toEqual([]);expect(data.startDate).toBe('');expect(data.records).toEqual([]);expect(dayOn(data,'2026-11-05')).toBeUndefined();expect(cycleOn(data,'2026-11-05')).toBe(0)})
 it('已有课程继续保留，不因初始化改为空白',()=>{const f=fixture();try{const p=new Planner(f.repository);const s=p.get().semester;p.saveSemester({...s,title:'自己创建的学期',startDate:'2026-11-02'});expect(p.get().semesters).toHaveLength(1);expect(p.get().semester.title).toBe('自己创建的学期')}finally{f.cleanup()}})
})
