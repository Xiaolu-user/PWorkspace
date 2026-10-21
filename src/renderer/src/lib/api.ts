import { ElMessage, ElMessageBox } from 'element-plus'
import type { Result } from '../../../shared/types'

export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}
export function report(error: unknown): void { ElMessage.error(error instanceof Error ? error.message : '操作失败，请稍后重试') }
export async function confirmDelete(title: string): Promise<boolean> {
  try { await ElMessageBox.confirm(`确定删除“${title}”吗？删除后无法直接撤销。`, '删除确认', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消', confirmButtonClass: 'danger-confirm', closeOnClickModal: false }); return true }
  catch { return false }
}
export function formatTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}
export async function openLink(url: string): Promise<void> { try { unwrap(await window.workbench.app.openExternal(url)) } catch (error) { report(error) } }
