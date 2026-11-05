import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fixture, task } from './helpers'
import { compareReminderTasks } from '../src/shared/reminders'
import { localDate } from '../src/shared/date'
import { DatabaseStore } from '../src/main/database'
import { Repository } from '../src/main/repository'
import { taskInput } from '../src/main/validation'
describe('每日必做分类',()=>{
 let f:ReturnType<typeof fixture>
 beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-05T23:59:00'));f=fixture()})
 afterEach(()=>{f.cleanup();vi.useRealTimers()})
 it('旧任务默认普通分类，每日必做保存在数据库并优先于已触发提醒',()=>{
  const normal=f.repository.createTask(task({priority:'high',dueDate:localDate(),dueTime:'08:00',remindBefore:0}))
  const daily=f.repository.createTask(task({category:'daily',priority:'low'}))
  expect(normal.category).toBe('normal');expect(daily.dueDate).toBe(localDate())
  expect(f.repository.tasks()[0].id).toBe(daily.id)
  expect([normal,daily].sort((a,b)=>compareReminderTasks(a,b))[0].id).toBe(daily.id)
  f.store.close();const store=new DatabaseStore(f.store.path)
  try{expect(new Repository(store).task(daily.id).category).toBe('daily')}finally{store.close()}
 })
 it('完成后当日不再置顶，次日只重置每日任务并保留任务身份',()=>{
  const daily=f.repository.createTask(task({category:'daily',dueTime:'08:00',dueDate:localDate(),remindBefore:0}))
  const normal=f.repository.createTask(task({status:'done'}))
  f.repository.updateTask(daily.id,{...daily,status:'done'})
  expect(f.repository.task(daily.id).status).toBe('done')
  expect(f.repository.dashboard().today).toHaveLength(0)
  vi.setSystemTime(new Date('2026-11-06T00:01:00'))
  const next=f.repository.tasks().find(t=>t.id===daily.id)!
  expect(next.status).toBe('todo');expect(next.dueDate).toBe('2026-11-06')
  expect(next.reminderSentAt).toBeNull();expect(next.createdAt).toBe(daily.createdAt)
  expect(f.repository.task(normal.id).status).toBe('done')
  expect(f.repository.dashboard().today.map(t=>t.id)).toEqual([daily.id])
  expect(f.repository.tasks()).toHaveLength(2)
 })
 it('可取消每日分类或删除，后续日期不再复现；拒绝未知分类',()=>{
  const daily=f.repository.createTask(task({category:'daily'}))
  f.repository.updateTask(daily.id,{...daily,category:'normal',status:'done'})
  const removed=f.repository.createTask(task({category:'daily'}));f.repository.removeTask(removed.id)
  vi.setSystemTime(new Date('2026-11-09T12:00:00'))
  expect(f.repository.tasks()).toHaveLength(1);expect(f.repository.task(daily.id).status).toBe('done')
  expect(()=>taskInput({...task(),category:'invalid'})).toThrow('分类')
 })
})
