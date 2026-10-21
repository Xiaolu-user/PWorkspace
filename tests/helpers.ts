import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { DatabaseStore } from '../src/main/database'
import { Repository } from '../src/main/repository'
import { BackupService } from '../src/main/backup'
import type { TaskInput } from '../src/shared/types'

export function fixture(): { root: string; store: DatabaseStore; repository: Repository; backup: BackupService; cleanup: () => void } {
  const cache = resolve('.cache')
  mkdirSync(cache, { recursive: true })
  const root = mkdtempSync(join(cache, 'database-test-'))
  const store = new DatabaseStore(join(root, 'data/workbench.db'))
  return { root, store, repository: new Repository(store), backup: new BackupService(store), cleanup: () => {
    store.close()
    if (dirname(resolve(root)) !== cache) throw new Error('Refusing to remove a directory outside the test cache')
    rmSync(root, { recursive: true, force: true })
  } }
}
export function task(overrides: Partial<TaskInput> = {}): TaskInput {
  return { title: '整理今天的工作', description: '第一步\n写下一件事', status: 'todo', priority: 'normal', dueDate: null, ...overrides }
}
