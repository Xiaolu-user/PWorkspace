import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

export class Logger {
  private path: string
  constructor(directory: string) { mkdirSync(directory, { recursive: true }); this.path = join(directory, 'workbench.log') }
  error(operation: string, error: unknown): void {
    try {
      if (existsSync(this.path) && statSync(this.path).size > 1_000_000) {
        rmSync(this.path + '.2', { force: true })
        if (existsSync(this.path + '.1')) renameSync(this.path + '.1', this.path + '.2')
        renameSync(this.path, this.path + '.1')
      }
      const detail = error as { name?: string; code?: string; stack?: string }
      // Never log IPC arguments, note content, or the error's first line.
      appendFileSync(this.path, JSON.stringify({ time: new Date().toISOString(), operation, name: detail?.name ?? 'Unknown', code: detail?.code ?? 'UNKNOWN', trace: detail?.stack?.split('\n').slice(1, 7) }) + '\n')
    } catch { /* A logging failure must not hide the original error. */ }
  }
}
