export type Status = 'todo' | 'done'
export type Priority = 'low' | 'normal' | 'high'
export interface TaskInput { title: string; description: string; status: Status; dueDate: string | null; priority: Priority }
export interface Task extends TaskInput { id: string; createdAt: string; updatedAt: string }
export interface NoteInput { title: string; body: string }
export interface Note extends NoteInput { id: string; createdAt: string; updatedAt: string }
export interface BookmarkInput { title: string; url: string; group: string }
export interface Bookmark extends BookmarkInput { id: string; createdAt: string; updatedAt: string }
export interface Preferences { closeBehavior: 'tray' | 'quit'; trayExplained: boolean }
export interface Dashboard { today: Task[]; overdue: Task[]; recentNotes: Note[]; bookmarks: Bookmark[]; totalTodo: number; totalDone: number; noteCount: number; bookmarkCount: number }
export interface SearchResults { tasks: Task[]; notes: Note[]; bookmarks: Bookmark[] }
export interface AppInfo { version: string; dataPath: string; backupPath: string; startupWarning: string | null }
export interface BackupResult { path: string; safetyBackup?: string }
export type ErrorCode = 'VALIDATION' | 'NOT_FOUND' | 'BUSY' | 'DATABASE' | 'BACKUP' | 'INCOMPATIBLE' | 'IO' | 'UNAUTHORIZED' | 'INTERNAL'
export type Result<T> = { ok: true; data: T } | { ok: false; error: { code: ErrorCode; message: string } }
export interface WorkbenchAPI {
  tasks: {
    list(): Promise<Result<Task[]>>
    get(id: string): Promise<Result<Task>>
    create(input: TaskInput): Promise<Result<Task>>
    update(id: string, input: TaskInput): Promise<Result<Task>>
    remove(id: string): Promise<Result<void>>
  }
  notes: {
    list(): Promise<Result<Note[]>>
    get(id: string): Promise<Result<Note>>
    save(id: string | null, input: NoteInput): Promise<Result<Note>>
    remove(id: string): Promise<Result<void>>
  }
  bookmarks: {
    list(): Promise<Result<Bookmark[]>>
    create(input: BookmarkInput): Promise<Result<Bookmark>>
    update(id: string, input: BookmarkInput): Promise<Result<Bookmark>>
    remove(id: string): Promise<Result<void>>
  }
  dashboard: { getSummary(): Promise<Result<Dashboard>> }
  search: { query(term: string): Promise<Result<SearchResults>> }
  backup: { create(): Promise<Result<BackupResult | null>>; restore(): Promise<Result<BackupResult | null>> }
  app: {
    info(): Promise<Result<AppInfo>>
    preferences(): Promise<Result<Preferences>>
    setCloseBehavior(value: 'tray' | 'quit'): Promise<Result<Preferences>>
    openExternal(url: string): Promise<Result<void>>
    openDataDirectory(): Promise<Result<void>>
    ready(): Promise<Result<void>>
    respondClose(token: string, allow: boolean): Promise<Result<void>>
    onRequestClose(callback: (token: string) => void): () => void
  }
}
