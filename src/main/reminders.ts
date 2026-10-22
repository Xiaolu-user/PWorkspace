import type { Task } from '../shared/types'
import type { Repository } from './repository'

export class ReminderService {
  private checking = false
  constructor(private repository: Repository, private deliver: (task: Task) => Promise<boolean>) {}
  async check(now = Date.now()): Promise<void> {
    if (this.checking || this.repository.store.maintenance) return
    this.checking = true
    try {
      for (const pending of this.repository.dueReminders(now)) {
        if (this.repository.store.maintenance) break
        // Recheck after awaiting another delivery: the task may have been edited or removed.
        const task = this.repository.dueReminders(now).find(item => item.id === pending.id)
        if (task && await this.deliver(task)) this.repository.markReminderSent(task)
      }
    } finally { this.checking = false }
  }
}
