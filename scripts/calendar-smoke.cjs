const { _electron: electron } = require('playwright')
const assert = require('node:assert/strict')
const { mkdirSync, writeFileSync } = require('node:fs')
const { resolve, join } = require('node:path')
const { randomUUID } = require('node:crypto')
const root = resolve(__dirname, '..')
const output = join(root, 'test-results/calendar'), data = join(root, '.cache', `calendar-${randomUUID()}`)
mkdirSync(output, { recursive: true }); mkdirSync(data, { recursive: true })
const env = { ...process.env, WORKBENCH_DATA_DIR: data }
delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
let app, page
const errors = [], checks = []
async function api(method, ...args) {
  const response = await page.evaluate(async ({ method, args }) => window.workbench.tasks[method](...args), { method, args })
  assert.equal(response.ok, true, JSON.stringify(response)); return response.data
}
async function launch() {
  app = await electron.launch({ executablePath: require('electron'), args: [root], cwd: root, env })
  page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message))
  await page.waitForFunction(version => document.querySelector('.page-footer')?.textContent.includes('v' + version), require('../package.json').version)
}
async function stop() {
  if (app) { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); await app.close().catch(() => {}); app = null }
}
async function main() {
  await launch()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1320, 860))
  const dates = await page.evaluate(() => {
    const format = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const date = new Date(); const today = format(date); date.setDate(date.getDate() + 3)
    return { today, target: format(date) }
  })
  const trigger = page.getByRole('button', { name: '打开日历', exact: true })
  const triggerBounds = await trigger.boundingBox(), dateBounds = await page.locator('.time-date-row p').boundingBox()
  assert.ok(triggerBounds.x >= dateBounds.x + dateBounds.width)
  await page.screenshot({ animations: "disabled", path: join(output, 'calendar-entry.png') })
  await trigger.click()
  const calendar = page.getByRole('dialog', { name: '日历与待办', exact: true })
  await calendar.waitFor()
  assert.equal(await calendar.locator('.calendar-day').count(), 42)
  const month = await calendar.locator('.calendar-toolbar strong').textContent()
  await calendar.getByRole('button', { name: '下个月', exact: true }).click()
  assert.notEqual(await calendar.locator('.calendar-toolbar strong').textContent(), month)
  await calendar.getByRole('button', { name: '上个月', exact: true }).click()
  assert.equal(await calendar.locator('.calendar-toolbar strong').textContent(), month)
  await calendar.locator(`[data-date="${dates.target}"]`).click()
  await calendar.getByRole('button', { name: '添加当天待办', exact: true }).click()
  let form = page.getByRole('dialog', { name: '添加一件要做的事', exact: true })
  assert.equal(await form.getByPlaceholder('不设置日期').inputValue(), dates.target)
  await form.getByPlaceholder('接下来，想完成什么？').fill('日历测试：准备读书分享')
  await form.getByPlaceholder('选择具体时间（选填）').fill('00:10')
  await form.getByPlaceholder('选择具体时间（选填）').press('Enter')
  await form.getByRole('combobox', { name: '提前提醒', exact: true }).press('Enter')
  await page.getByRole('option', { name: '自定义提前时间', exact: true }).click()
  await form.getByRole('spinbutton', { name: '提前分钟数', exact: true }).fill('30')
  await form.getByRole('spinbutton', { name: '提前分钟数', exact: true }).press('Tab')
  assert.match(await form.locator('.reminder-preview').textContent(), /23:40/)
  await form.getByRole('button', { name: '添加任务', exact: true }).click()
  await form.waitFor({ state: 'hidden' })
  let saved = (await api('list'))[0]
  assert.equal(saved.dueDate, dates.target); assert.equal(saved.dueTime, '00:10'); assert.equal(saved.remindBefore, 30)
  await calendar.getByRole('button', { name: '编辑日历任务：日历测试：准备读书分享', exact: true }).waitFor()
  assert.match(await calendar.locator(`[data-date="${dates.target}"]`).textContent(), /1 项/)
  checks.push('日期右侧入口、月历切换、选中日期创建待办、自定义跨日提醒和日期数量标记')
  await page.screenshot({ animations: "disabled", path: join(output, 'calendar-1320.png') })
  await calendar.getByRole('button', { name: '编辑日历任务：日历测试：准备读书分享', exact: true }).click()
  form = page.getByRole('dialog', { name: '编辑任务', exact: true })
  assert.equal(await form.getByPlaceholder('选择具体时间（选填）').inputValue(), '00:10')
  await form.getByPlaceholder('补充一些细节（选填）').fill('带上阅读笔记')
  await form.getByRole('button', { name: '保存修改', exact: true }).click()
  await form.waitFor({ state: 'hidden' })
  await calendar.getByRole('checkbox', { name: '完成日历任务：日历测试：准备读书分享' }).check()
  await page.waitForFunction(() => document.querySelector('.calendar-task')?.classList.contains('completed'))
  saved = (await api('list'))[0]; assert.equal(saved.status, 'done'); assert.equal(saved.remindBefore, 30)
  await calendar.getByRole('button', { name: '今天', exact: true }).click()
  assert.equal(await calendar.locator(`[data-date="${dates.today}"]`).getAttribute('aria-pressed'), 'true')
  await calendar.getByRole('button', { name: '添加当天待办', exact: true }).click()
  form = page.getByRole('dialog', { name: '添加一件要做的事', exact: true })
  assert.equal(await form.getByPlaceholder('选择具体时间（选填）').inputValue(), '')
  assert.equal(await form.getByRole('combobox', { name: '提前提醒', exact: true }).isDisabled(), true)
  await form.getByRole('button', { name: '取消', exact: true }).click()
  await form.waitFor({ state: 'hidden' }); assert.equal((await api('list')).length, 1)
  checks.push('编辑和完成保留提醒设置、今天按钮、取消创建不落库、新建表单不串用上次提醒')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(960, 640))
  await calendar.locator(`[data-date="${dates.target}"]`).click()
  assert.equal(await calendar.evaluate(el => el.scrollWidth > el.clientWidth), false)
  await page.screenshot({ animations: "disabled", path: join(output, 'calendar-960.png') })
  await page.keyboard.press('Escape')
  await calendar.waitFor({ state: 'hidden' })
  await page.getByRole('link', { name: '我的待办', exact: true }).click()
  await page.getByRole('button', { name: '标记为未完成', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('.task-row')?.classList.contains('completed'))
  saved = (await api('list'))[0]; assert.equal(saved.remindBefore, 30)
  checks.push('960 窗口无横向溢出、我的待办中切换完成状态保留提醒')
  await stop(); await launch()
  saved = (await api('list'))[0]; assert.equal(saved.dueDate, dates.target); assert.equal(saved.remindBefore, 30); assert.equal(saved.description, '带上阅读笔记')
  checks.push('退出重开后日期、时间、说明和提醒均保留')
  // Exercise the real main-process polling while hiding the window. Stub only the OS toast.
  await app.evaluate(({ Notification, BrowserWindow }) => {
    global.__reminderToasts = []
    Notification.isSupported = () => true
    Notification.prototype.show = function () { global.__reminderToasts.push({ title: this.title, body: this.body }); this.emit('show') }
    BrowserWindow.getAllWindows()[0].hide()
  })
  const pending = await api('create', { title: '后台提醒测试', description: '', status: 'todo', priority: 'normal', dueDate: '2026-01-01', dueTime: '09:00', remindBefore: 10 })
  const deadline = Date.now() + 22000
  while (!(await api('get', pending.id)).reminderSentAt && Date.now() < deadline) await page.waitForTimeout(250)
  assert.ok((await api('get', pending.id)).reminderSentAt, '后台提醒应在轮询周期内发送')
  const toasts = await app.evaluate(() => global.__reminderToasts)
  assert.equal(toasts.filter(toast => toast.title.includes('后台提醒测试')).length, 1, JSON.stringify({ toasts, task: await api('get', pending.id) }))
  await page.waitForTimeout(15500)
  assert.equal((await app.evaluate(() => global.__reminderToasts)).filter(toast => toast.title.includes('后台提醒测试')).length, 1)
  await api('remove', pending.id)
  checks.push('窗口隐藏时主进程轮询触发提醒且不重复（系统通知使用替身）')
  assert.deepEqual(errors, [])
  writeFileSync(join(output, 'report.json'), JSON.stringify({ checks, errors, data }, null, 2))
  console.log(checks.join('\n'))
}
main().catch(async error => { console.error(error); if (page) await page.screenshot({ animations: "disabled", path: join(output, 'failure.png') }).catch(() => {}); process.exitCode = 1 }).finally(stop)
