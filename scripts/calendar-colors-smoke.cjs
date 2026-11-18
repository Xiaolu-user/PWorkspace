const { _electron: electron } = require('playwright')
const assert = require('node:assert/strict')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { randomUUID } = require('node:crypto')
const root = resolve(__dirname, '..'), output = join(root, 'test-results/calendar-colors'), data = join(root, '.cache', `calendar-colors-${randomUUID()}`)
mkdirSync(output, { recursive: true }); mkdirSync(data, { recursive: true })
const env = { ...process.env, WORKBENCH_DATA_DIR: data }; delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
let app, page; const errors = [], checks = []
async function api(group, method, ...args) { const result = await page.evaluate(async ({group,method,args}) => window.workbench[group][method](...args), {group,method,args}); assert.equal(result.ok,true,JSON.stringify(result)); return result.data }
async function launch() { app = await electron.launch({ executablePath:require('electron'),args:[root],cwd:root,env }); page = await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(version=>document.querySelector('.page-footer')?.textContent.includes('v'+version),require('../package.json').version); await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1600,1000)) }
async function stop() { if(app) { await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});app=null } }
async function shot(name) { await page.mouse.move(0,0);await page.locator('.el-message').last().waitFor({state:'hidden',timeout:5000}).catch(()=>{});await page.screenshot({animations:'disabled',path:join(output,name+'.png')}) }
const rgb = hex => `rgb(${[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(', ')})`
async function color(locator) { return locator.evaluate(el=>getComputedStyle(el).color) }
async function main() {
  await launch()
  await page.getByRole('button',{name:'打开日历',exact:true}).click()
  const calendar = page.getByRole('dialog',{name:'日历与待办',exact:true});await calendar.waitFor()
  const national = calendar.locator('[data-date="2026-10-01"]')
  assert.ok(await national.locator('.calendar-event-dot').count()>1)
  assert.equal((await national.locator('.calendar-festivals').textContent()).trim(),'')
  await national.click()
  assert.match(await calendar.locator('.calendar-event-details').textContent(),/国庆节/)
  assert.equal(await national.locator('.calendar-event-dot').count(),await calendar.locator('.calendar-event-detail').count())
  await shot('day-multiple-festivals')
  await calendar.locator('[data-date="2026-10-23"]').click()
  assert.equal(await calendar.locator('[data-date="2026-10-23"] .calendar-event-name').getAttribute('data-kind'),'solarTerm')
  assert.notEqual(await color(calendar.locator('[data-date="2026-10-23"] .calendar-event-name')),await color(calendar.locator('[data-date="2026-10-06"] .calendar-event-name')))
  const rest=calendar.locator('[data-date="2026-10-01"] .calendar-holiday-tag'),work=calendar.locator('[data-date="2026-10-10"] .calendar-holiday-tag')
  assert.notEqual(await color(rest),await color(work))
  await shot('day-solar-term')
  await page.keyboard.press('Escape');await calendar.waitFor({state:'hidden'})
  checks.push('多节日以逐项圆点表示，选中后右侧完整显示；节日、节气、休、班颜色不同')
  await page.getByRole('link',{name:'设置与备份',exact:true}).click()
  const colors={festival:'#cc66ff',solarTerm:'#11aa88',rest:'#ff3355',work:'#2288ff',lunar:'#708090',todo:'#33bb77'}
  const labels={festival:'节日与纪念日',solarTerm:'节气',rest:'休 · 放假',work:'班 · 补班',lunar:'农历日期',todo:'待办数量'}
  for(const [key,label] of Object.entries(labels)) await page.getByLabel(label+'颜色',{exact:true}).fill(colors[key])
  await page.getByRole('button',{name:'保存日历颜色',exact:true}).click();await page.getByText('显示设置已保存并生效',{exact:true}).waitFor()
  assert.deepEqual((await api('app','preferences')).appearance.calendarColors,colors)
  await page.locator('.calendar-color-settings').scrollIntoViewIfNeeded();await shot('calendar-color-settings')
  await page.getByRole('link',{name:'今日概览',exact:true}).click();await page.getByRole('button',{name:'打开日历',exact:true}).click();await calendar.waitFor()
  assert.equal(await color(rest),rgb(colors.rest));assert.equal(await color(work),rgb(colors.work))
  assert.equal(await color(calendar.locator('[data-date="2026-10-23"] .calendar-event-name')),rgb(colors.solarTerm))
  assert.equal(await color(calendar.locator('[data-date="2026-10-06"] .calendar-event-name')),rgb(colors.festival))
  await national.click();assert.equal(await color(rest),rgb(colors.rest))
  await page.keyboard.press('Escape');await calendar.waitFor({state:'hidden'})
  await page.getByRole('button',{name:'切换夜间模式',exact:true}).click();await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark')
  await page.getByRole('button',{name:'打开日历',exact:true}).click();await calendar.waitFor();await national.click()
  assert.equal(await color(rest),rgb(colors.rest));assert.equal(await color(work),rgb(colors.work))
  await shot('night-custom-colors')
  for(const size of [[1320,860],[960,640]]) {
    await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(...size),size)
    await page.waitForTimeout(100)
    assert.equal(await calendar.evaluate(el=>el.scrollWidth>el.clientWidth),false)
    await shot(`calendar-${size[0]}`)
  }
  checks.push('设置六类自定义颜色，月历、选中日及右侧详情在日夜模式同步；三种尺寸无横向溢出')
  await stop();await launch();assert.deepEqual((await api('app','preferences')).appearance.calendarColors,colors)
  await page.getByRole('link',{name:'设置与备份',exact:true}).click();await page.getByRole('button',{name:'恢复日历默认颜色',exact:true}).click()
  await page.getByText('显示设置已保存并生效',{exact:true}).waitFor()
  const preferences=await api('app','preferences');assert.equal(preferences.appearance.calendarColors.rest,'#ff526c');assert.equal(preferences.appearance.theme,'dark')
  checks.push('颜色配置重启保留，恢复默认日历颜色不改变当前主题')
  assert.deepEqual(errors,[]);writeFileSync(join(output,'report.json'),JSON.stringify({checks,errors,data},null,2));console.log(checks.join('\n'))
}
main().catch(async error=>{console.error(error);if(page)await shot('failure').catch(()=>{});process.exitCode=1}).finally(stop)
