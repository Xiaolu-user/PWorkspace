import type { App } from 'electron'
import type { LoginStartup } from '../shared/types'
import { AppError } from './errors'

type StartupApp = Pick<App, 'isPackaged' | 'getLoginItemSettings' | 'setLoginItemSettings'>
export class LoginStartupService {
  constructor(private readonly app: StartupApp, private readonly platform = process.platform, private readonly path = process.execPath) {}
  get(): LoginStartup {
    if (this.platform !== 'win32' || !this.app.isPackaged) return { supported: false, enabled: false }
    const settings = this.app.getLoginItemSettings({ path: this.path, args: [] })
    return { supported: true, enabled: settings.openAtLogin && settings.executableWillLaunchAtLogin }
  }
  set(enabled: unknown): LoginStartup {
    if (typeof enabled !== 'boolean') throw new AppError('VALIDATION', '开机启动设置不正确')
    if (!this.get().supported) throw new AppError('VALIDATION', '请在安装后的 Windows 版本中设置开机自动启动')
    this.app.setLoginItemSettings({ openAtLogin: enabled, enabled, path: this.path, args: [] })
    const result = this.get()
    if (result.enabled !== enabled) throw new AppError('IO', '未能更改系统启动项，请检查 Windows 启动应用设置后重试')
    return result
  }
}
