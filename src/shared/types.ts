export type Status = 'todo' | 'done'
export type Priority = 'low' | 'normal' | 'high'
export interface TaskInput { category?: 'normal' | 'daily'; title: string; description: string; status: Status; dueDate: string | null; priority: Priority; dueTime?: string | null; remindBefore?: number | null }
export interface Task extends TaskInput { id: string; createdAt: string; updatedAt: string; dueTime: string | null; remindBefore: number | null; reminderSentAt: string | null; reminderAcknowledgedAt: string | null }
export interface NoteInput { title: string; body: string }
export interface Note extends NoteInput { id: string; createdAt: string; updatedAt: string }
export interface BookmarkInput { title: string; url: string; group: string }
export interface Bookmark extends BookmarkInput { id: string; createdAt: string; updatedAt: string }
export interface Preferences { closeBehavior: 'tray' | 'quit'; trayExplained: boolean; appearance: import('./appearance').Appearance }
export interface Dashboard { today: Task[]; overdue: Task[]; recentNotes: Note[]; bookmarks: Bookmark[]; totalTodo: number; totalDone: number; noteCount: number; bookmarkCount: number }
export interface SearchResults { tasks: Task[]; notes: Note[]; bookmarks: Bookmark[] }
export interface LoginStartup { supported: boolean; enabled: boolean }
export interface AppInfo { version: string; dataPath: string; backupPath: string; startupWarning: string | null }
export interface BackupResult { path: string; safetyBackup?: string }
export interface ShortcutImport { added: number; links: number; duplicates: number; skipped: string[] }
export type ErrorCode = 'VALIDATION' | 'NOT_FOUND' | 'BUSY' | 'DATABASE' | 'BACKUP' | 'INCOMPATIBLE' | 'IO' | 'UNAUTHORIZED' | 'INTERNAL'
export type Result<T> = { ok: true; data: T } | { ok: false; error: { code: ErrorCode; message: string } }
export interface WorkbenchAPI {
  // Real filesystem path of a dropped file; empty for virtual or browser-provided files.
  filePath(file: File): string
  weather: { search(query: string): Promise<Result<import('./appearance').WeatherLocation[]>>; current(): Promise<Result<import('./weather').Weather | null>> }
  fitness: { get(): Promise<Result<import('./fitness').FitnessData>>; save(value: import('./fitness').FitnessData): Promise<Result<void>>; exportFile(name: string, content: string): Promise<Result<boolean>> }
  planner: {
    get(): Promise<Result<import('./planner').PlannerData>>
    semester(value: import('./planner').Semester): Promise<Result<import('./planner').PlannerData>>
    setHomeSemester(id: string): Promise<Result<import('./planner').PlannerData>>
    removeSemester(id: string): Promise<Result<import('./planner').PlannerData>>
    workouts(value: import('./planner').Workout[]): Promise<Result<void>>
    pick(kind: 'app' | 'file' | 'folder', category?: string): Promise<Result<void>>
    open(id: string): Promise<Result<void>>
    remove(id: string): Promise<Result<void>>
  }
  shortcuts: {
    import(paths: string[], category: string): Promise<Result<ShortcutImport>>
    assign(id: string, category: string): Promise<Result<void>>
    refreshIcon(id: string): Promise<Result<string>>
    saveCategories(list: string[]): Promise<Result<string[]>>
    renameCategory(from: string, to: string): Promise<Result<void>>
    removeCategory(name: string): Promise<Result<void>>
  }
  tasks: {
    list(): Promise<Result<Task[]>>
    get(id: string): Promise<Result<Task>>
    create(input: TaskInput): Promise<Result<Task>>
    update(id: string, input: TaskInput): Promise<Result<Task>>
    remove(id: string): Promise<Result<void>>
    acknowledge(id: string): Promise<Result<Task>>
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
    loginStartup(): Promise<Result<LoginStartup>>
    setLoginStartup(enabled: boolean): Promise<Result<LoginStartup>>
    info(): Promise<Result<AppInfo>>
    preferences(): Promise<Result<Preferences>>
    setCloseBehavior(value: 'tray' | 'quit'): Promise<Result<Preferences>>
    setAppearance(value: import('./appearance').Appearance): Promise<Result<Preferences>>
    openExternal(url: string): Promise<Result<void>>
    openDataDirectory(): Promise<Result<void>>
    ready(): Promise<Result<void>>
    respondClose(token: string, allow: boolean): Promise<Result<void>>
    onRequestClose(callback: (token: string) => void): () => void
  }
}
