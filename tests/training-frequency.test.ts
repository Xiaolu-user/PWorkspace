import { describe, expect, it } from 'vitest'
import { trainingFrequency } from '../src/renderer/src/fitness/trainingFrequency'
import type { TrainingRecord } from '../src/shared/fitness'

const records = (...dates: string[]): TrainingRecord[] => dates.map((date,i) => ({id:String(i),date,title:'训练',type:'推',minutes:null,notes:'',tags:'',source:'手动补录',items:[],updated:''}))
describe('训练频率的统计范围', () => {
  it('自然周以周一开始，首尾按筛选日期截取，包含无记录周', () => {
    const buckets=trainingFrequency(records('2026-10-30','2026-11-01','2026-11-09'),'2026-10-30','2026-11-10','week','2026-11-01',4)
    expect(buckets.map(b=>[b.start,b.end,b.records.length])).toEqual([['2026-10-30','2026-11-01',2],['2026-11-02','2026-11-08',0],['2026-11-09','2026-11-10',1]])
  })
  it('月底开始筛选也不会跳过二月，并正确跨年', () => {
    expect(trainingFrequency([],'2026-01-31','2026-03-02','month','2026-01-01',4).map(b=>[b.start,b.end])).toEqual([['2026-01-31','2026-01-31'],['2026-02-01','2026-02-28'],['2026-03-01','2026-03-02']])
    expect(trainingFrequency([],'2026-12-31','2027-01-02','month','2026-01-01',4).map(b=>b.label)).toEqual(['2026年12月','2027年1月'])
  })
  it('训练周期跟随计划起始日，而不是筛选起始日', () => {
    const buckets=trainingFrequency([],'2026-10-30','2026-11-08','cycle','2026-11-01',4)
    expect(buckets.map(b=>[b.start,b.end,b.label])).toEqual([['2026-10-30','2026-10-31','计划开始前'],['2026-11-01','2026-11-04','第 1 周期'],['2026-11-05','2026-11-08','第 2 周期']])
  })
  it('同日多条记录保留次数，空白日期仍有分组', () => {
    const buckets=trainingFrequency(records('2026-11-01','2026-11-01'),'2026-11-01','2026-11-02','day','2026-11-01',4)
    expect(buckets.map(b=>b.records.length)).toEqual([2,0])
    expect(new Set(buckets[0].records.map(r=>r.date)).size).toBe(1)
  })
  it('无效日期范围不生成图柱', () => {
    expect(trainingFrequency([],'2026-11-02','2026-11-01','day','2026-11-01',4)).toEqual([])
    expect(trainingFrequency([],'','2026-11-01','day','2026-11-01',4)).toEqual([])
  })
})
