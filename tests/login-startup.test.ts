import { describe, expect, it, vi } from 'vitest'
import type { App } from 'electron'
import { LoginStartupService } from '../src/main/loginStartup'
function fixture(packaged=true,platform:NodeJS.Platform='win32') {
 let registered=false,approved=true
 const app={isPackaged:packaged,getLoginItemSettings:vi.fn(()=>({openAtLogin:registered,executableWillLaunchAtLogin:registered&&approved})),setLoginItemSettings:vi.fn((options:{openAtLogin?:boolean;enabled?:boolean})=>{registered=!!options.openAtLogin;approved=!!options.enabled})}
 return {app,service:new LoginStartupService(app as unknown as App,platform,'C:\\Program Files\\大内总管\\PersonalWorkbench.exe'),block:()=>{approved=false},register:()=>{registered=true}}
}
describe('Windows 开机自动启动',()=>{
 it('开启和关闭后读取系统实际状态，设置与查询使用相同的可执行文件',()=>{
  const {app,service}=fixture()
  expect(service.get()).toEqual({supported:true,enabled:false})
  expect(service.set(true).enabled).toBe(true)
  const options=app.setLoginItemSettings.mock.calls[0][0]
  expect(options).toMatchObject({openAtLogin:true,enabled:true,args:[],path:'C:\\Program Files\\大内总管\\PersonalWorkbench.exe'})
  expect(app.getLoginItemSettings).toHaveBeenLastCalledWith({path:'C:\\Program Files\\大内总管\\PersonalWorkbench.exe',args:[]})
  expect(service.set(false).enabled).toBe(false)
 })
 it('Windows 外部禁用启动项后读取为关闭，用户开启时重新启用',()=>{
  const {service,register,block}=fixture();register();block()
  expect(service.get().enabled).toBe(false)
  expect(service.set(true).enabled).toBe(true)
 })
 it('开发预览和非 Windows 平台不注册启动项，拒绝无效输入',()=>{
  for(const [packaged,platform] of [[false,'win32'],[true,'linux']] as const){
   const {app,service}=fixture(packaged,platform)
   expect(service.get()).toEqual({supported:false,enabled:false})
   expect(()=>service.set(true)).toThrow('安装后的 Windows')
   expect(app.setLoginItemSettings).not.toHaveBeenCalled()
  }
  expect(()=>fixture().service.set('true')).toThrow('设置不正确')
 })
 it('系统写入失败或未生效时不报告成功',()=>{
  const {app,service}=fixture();app.setLoginItemSettings.mockImplementation(()=>{})
  expect(()=>service.set(true)).toThrow('未能更改系统启动项')
  app.setLoginItemSettings.mockImplementation(()=>{throw Error('Access denied')})
  expect(()=>service.set(true)).toThrow('Access denied')
 })
})
