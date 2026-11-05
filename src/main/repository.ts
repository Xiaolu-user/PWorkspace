import { randomUUID } from 'node:crypto'
import type { Bookmark, BookmarkInput, Dashboard, Note, NoteInput, Preferences, SearchResults, Task, TaskInput } from '../shared/types'
import { localDate } from '../shared/date'
import { reminderTimestamp, isReminderActive } from '../shared/reminders'
import { normalizeAppearance } from '../shared/appearance'
import { DatabaseStore } from './database'
import { AppError } from './errors'
import * as validate from './validation'

export class Repository {
  constructor(readonly store: DatabaseStore) {}
  private resetDailyTasks(today = localDate()): void {
    this.store.connection.prepare("UPDATE tasks SET status='todo',dueDate=?,reminderSentAt=NULL,reminderAcknowledgedAt=NULL,updatedAt=? WHERE category='daily' AND (dueDate IS NULL OR dueDate<>?)").run(today,new Date().toISOString(),today)
  }
  tasks(): Task[] { this.resetDailyTasks(); return this.store.connection.prepare("SELECT * FROM tasks ORDER BY CASE WHEN category='daily' AND status='todo' THEN 0 ELSE 1 END, status DESC, CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, dueDate IS NULL, dueDate, createdAt DESC, id").all() as Task[] }
  task(taskId: unknown): Task {
    this.resetDailyTasks()
    const row = this.store.connection.prepare('SELECT * FROM tasks WHERE id = ?').get(validate.id(taskId)) as Task | undefined
    if (!row) throw new AppError('NOT_FOUND', '这条任务已不存在')
    return row
  }
  createTask(input: unknown): Task {
    const data = validate.taskInput(input)
    if (data.category === 'daily') data.dueDate = localDate()
    const now = new Date().toISOString()
    const row: Task = { ...data, dueTime: data.dueTime ?? null, remindBefore: data.remindBefore ?? null, reminderSentAt: null, reminderAcknowledgedAt: null, id: randomUUID(), createdAt: now, updatedAt: now }
    this.store.connection.prepare('INSERT INTO tasks (id,title,description,status,dueDate,priority,dueTime,remindBefore,reminderSentAt,reminderAcknowledgedAt,createdAt,updatedAt,category) VALUES (@id,@title,@description,@status,@dueDate,@priority,@dueTime,@remindBefore,@reminderSentAt,@reminderAcknowledgedAt,@createdAt,@updatedAt,@category)').run(row)
    return row
  }
  updateTask(taskId: unknown, input: unknown): Task {
    const old = this.task(taskId)
    const data = validate.taskInput(input)
    if (data.category === 'daily') data.dueDate = localDate()
    const row = { ...old, ...data, updatedAt: new Date().toISOString() }
    if (old.dueDate !== row.dueDate || old.dueTime !== row.dueTime || old.remindBefore !== row.remindBefore) { row.reminderSentAt = null; row.reminderAcknowledgedAt = null }
    this.store.connection.prepare('UPDATE tasks SET category=@category,title=@title,description=@description,status=@status,dueDate=@dueDate,priority=@priority,dueTime=@dueTime,remindBefore=@remindBefore,reminderSentAt=@reminderSentAt,reminderAcknowledgedAt=@reminderAcknowledgedAt,updatedAt=@updatedAt WHERE id=@id').run(row)
    return row
  }
  removeTask(taskId: unknown): void { this.remove('tasks', taskId) }
  acknowledgeReminder(taskId: unknown): Task {
    const task = this.task(taskId)
    if (!isReminderActive(task)) throw new AppError('VALIDATION', '这条待办当前没有需要确认的提醒')
    this.store.connection.prepare('UPDATE tasks SET reminderAcknowledgedAt=COALESCE(reminderAcknowledgedAt,?) WHERE id=?').run(new Date().toISOString(), task.id)
    return this.task(task.id)
  }
  dueReminders(now = Date.now()): Task[] {
    this.resetDailyTasks(localDate(new Date(now)))
    const tasks = this.store.connection.prepare("SELECT * FROM tasks WHERE status='todo' AND remindBefore IS NOT NULL AND reminderSentAt IS NULL AND reminderAcknowledgedAt IS NULL").all() as Task[]
    return tasks.filter(task => { const time = reminderTimestamp(task); return time !== null && time <= now }).sort((a, b) => reminderTimestamp(a)! - reminderTimestamp(b)!)
  }
  markReminderSent(task: Task): void {
    this.store.connection.prepare("UPDATE tasks SET reminderSentAt=? WHERE id=? AND status='todo' AND dueDate=? AND dueTime=? AND remindBefore=? AND reminderSentAt IS NULL").run(new Date().toISOString(), task.id, task.dueDate, task.dueTime, task.remindBefore)
  }
  notes(): Note[] { return this.store.connection.prepare('SELECT * FROM notes ORDER BY updatedAt DESC, id').all() as Note[] }
  note(noteId: unknown): Note {
    const row = this.store.connection.prepare('SELECT * FROM notes WHERE id = ?').get(validate.id(noteId)) as Note | undefined
    if (!row) throw new AppError('NOT_FOUND', '这篇笔记已不存在')
    return row
  }
  saveNote(noteId: unknown, input: unknown): Note {
    const data = validate.noteInput(input)
    const now = new Date().toISOString()
    if (noteId === null) {
      const row: Note = { ...data, id: randomUUID(), createdAt: now, updatedAt: now }
      this.store.connection.prepare('INSERT INTO notes (id,title,body,createdAt,updatedAt) VALUES (@id,@title,@body,@createdAt,@updatedAt)').run(row)
      return row
    }
    const row = { ...this.note(noteId), ...data, updatedAt: now }
    this.store.connection.prepare('UPDATE notes SET title=@title,body=@body,updatedAt=@updatedAt WHERE id=@id').run(row)
    return row
  }
  removeNote(noteId: unknown): void { this.remove('notes', noteId) }
  bookmarks(): Bookmark[] { return this.store.connection.prepare('SELECT * FROM bookmarks ORDER BY "group", createdAt DESC, id').all() as Bookmark[] }
  createBookmark(input: unknown): Bookmark {
    const now = new Date().toISOString()
    const row: Bookmark = { ...validate.bookmarkInput(input), id: randomUUID(), createdAt: now, updatedAt: now }
    this.store.connection.prepare('INSERT INTO bookmarks (id,title,url,"group",createdAt,updatedAt) VALUES (@id,@title,@url,@group,@createdAt,@updatedAt)').run(row)
    return row
  }
  updateBookmark(bookmarkId: unknown, input: unknown): Bookmark {
    const key = validate.id(bookmarkId)
    const old = this.store.connection.prepare('SELECT * FROM bookmarks WHERE id=?').get(key) as Bookmark | undefined
    if (!old) throw new AppError('NOT_FOUND', '这个链接已不存在')
    const row = { ...old, ...validate.bookmarkInput(input), updatedAt: new Date().toISOString() }
    this.store.connection.prepare('UPDATE bookmarks SET title=@title,url=@url,"group"=@group,updatedAt=@updatedAt WHERE id=@id').run(row)
    return row
  }
  removeBookmark(bookmarkId: unknown): void { this.remove('bookmarks', bookmarkId) }
  // Categories are shared with bookmarks, so renaming or deleting one moves its links too.
  renameBookmarkGroup(from: string, to: string): void {
    this.store.connection.prepare('UPDATE bookmarks SET "group"=? WHERE "group"=?').run(to.slice(0, 80), from.slice(0, 80))
  }
  private remove(table: 'tasks' | 'notes' | 'bookmarks', key: unknown): void {
    const result = this.store.connection.prepare(`DELETE FROM ${table} WHERE id=?`).run(validate.id(key))
    if (!result.changes) throw new AppError('NOT_FOUND', '这条内容已不存在')
  }
  dashboard(today = localDate()): Dashboard {
    this.resetDailyTasks(today)
    const db = this.store.connection
    const count = (sql: string) => (db.prepare(sql).get() as { count: number }).count
    return {
      today: db.prepare("SELECT * FROM tasks WHERE status='todo' AND dueDate=? ORDER BY CASE WHEN category='daily' THEN 0 ELSE 1 END, CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, createdAt DESC").all(today) as Task[],
      overdue: db.prepare("SELECT * FROM tasks WHERE status='todo' AND dueDate < ? ORDER BY dueDate, createdAt").all(today) as Task[],
      recentNotes: db.prepare('SELECT * FROM notes ORDER BY updatedAt DESC, id LIMIT 4').all() as Note[],
      bookmarks: db.prepare('SELECT * FROM bookmarks ORDER BY updatedAt DESC, id LIMIT 6').all() as Bookmark[],
      totalTodo: count("SELECT COUNT(*) count FROM tasks WHERE status='todo'"), totalDone: count("SELECT COUNT(*) count FROM tasks WHERE status='done'"),
      noteCount: count('SELECT COUNT(*) count FROM notes'), bookmarkCount: count('SELECT COUNT(*) count FROM bookmarks')
    }
  }
  search(term: unknown): SearchResults {
    this.resetDailyTasks()
    const query = validate.searchTerm(term)
    if (!query) return { tasks: [], notes: [], bookmarks: [] }
    const pattern = `%${query.replace(/[!%_]/g, '!$&')}%`
    const db = this.store.connection
    return {
      tasks: db.prepare("SELECT * FROM tasks WHERE title LIKE ? ESCAPE '!' OR description LIKE ? ESCAPE '!' ORDER BY updatedAt DESC, id").all(pattern, pattern) as Task[],
      notes: db.prepare("SELECT * FROM notes WHERE title LIKE ? ESCAPE '!' OR body LIKE ? ESCAPE '!' ORDER BY updatedAt DESC, id").all(pattern, pattern) as Note[],
      bookmarks: db.prepare("SELECT * FROM bookmarks WHERE title LIKE ? ESCAPE '!' OR url LIKE ? ESCAPE '!' ORDER BY updatedAt DESC, id").all(pattern, pattern) as Bookmark[]
    }
  }
  readSetting<T>(key: string, fallback: T): T {
    const row = this.store.connection.prepare('SELECT value FROM settings WHERE key=?').get(key) as { value: string } | undefined
    if (!row) return fallback
    try { return JSON.parse(row.value) as T } catch { return fallback }
  }
  writeSetting(key: string, value: unknown): void {
    this.store.connection.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value))
  }
  preferences(): Preferences {
    const raw = this.readSetting<Partial<Preferences> | null>('preferences', null)
    return { closeBehavior: raw?.closeBehavior === 'quit' ? 'quit' : 'tray', trayExplained: raw?.trayExplained === true, appearance: normalizeAppearance(raw?.appearance) }
  }
  setCloseBehavior(value: unknown): Preferences {
    if (value !== 'tray' && value !== 'quit') throw new AppError('VALIDATION', '关闭窗口的设置不正确')
    const preferences = { ...this.preferences(), closeBehavior: value } as Preferences
    this.writeSetting('preferences', preferences)
    return preferences
  }
  setAppearance(value: unknown): Preferences {
    const preferences = { ...this.preferences(), appearance: normalizeAppearance(value) }
    this.writeSetting('preferences', preferences)
    return preferences
  }
}
