import type { ErrorCode } from '../shared/types'
export class AppError extends Error {
  constructor(public code: ErrorCode, message: string) { super(message); this.name = 'AppError' }
}
