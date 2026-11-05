const { _electron: electron } = require('playwright')
const { strict: assert } = require('node:assert')
const { mkdirSync, writeFileSync } = require('node:fs')
const { resolve, join } = require('node:path')
const { randomUUID } = require('node:crypto')
const root = resolve(__dirname, '..')
const packaged = process.argv.includes('--packaged')
const output = resolve(root, 'test-results', packaged ? 'packaged' : 'desktop')
const data = resolve(root, '.cache', `smoke-${randomUUID()}`)
mkdirSync(output, { recursive: true })
const env = { ...process.env, WORKBENCH_DATA_DIR: data }
delete env.ELECTRON_RUN_AS_NODE
delete env.ELECTRON_RENDERER_URL
let app
let page
const errors = []
const checks = []
const started = Date.now()
const screenshot = async name => {
  await page.waitForFunction(() => !document.querySelector('.el-message'), { timeout: 6000 })
  return page.screenshot({ path: join(output, `${name}.png`), fullPage: true })
}
async function check(name, operation) {
  await operation()
  checks.push(name)
  console.log(`PASS ${name}`)
}
async function launch() {
  app = await electron.launch({
    executablePath: process.env.WORKBENCH_TEST_EXECUTABLE || (packaged ? resolve(root, 'release/win-unpacked/PersonalWorkbench.exe') : require('electron')),
    args: packaged ? [] : [root],
    cwd: root, env, timeout: 30000
  })
  page = await app.firstWindow()
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.waitForFunction(() => !!window.workbench)
  await page.locator('.daily-content').waitFor()
  await page.waitForFunction(() => document.querySelector('.page-footer')?.textContent.includes('v0.1.0'))
  assert.equal(await page.locator('.error-banner').count(), 0)
}
async function forceClose() {
  if (app) {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {})
    await app.close().catch(() => {})
    app = null
  }
}
async function queryAPI(group, method, args = []) {
  const response = await page.evaluate(async ({ group, method, args }) => window.workbench[group][method](...args), { group, method, args })
  assert.equal(response.ok, true, JSON.stringify(response))
  return response.data
}
async function main() {
  await launch()
  await check('首次启动与空状态', async () => {
    assert.equal((await queryAPI('tasks', 'list')).length, 0)
    await screenshot('01-dashboard-empty')
  })
  await check('界面新增任务并切换完成状态', async () => {
    await page.getByRole('button', { name: '添加任务', exact: true }).first().click()
    const dialog = page.getByRole('dialog', { name: '添加一件要做的事' })
    await dialog.getByPlaceholder('接下来，想完成什么？').fill('安排本周的学习计划')
    await dialog.getByPlaceholder('补充一些细节（选填）').fill('学习桌面开发\n先做好一个完整的小功能')
    await dialog.getByRole('button', { name: '添加任务', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    await page.getByRole('link', { name: /我的待办/ }).click()
    await page.locator('.task-title', { hasText: '安排本周的学习计划' }).waitFor()
    await page.getByRole('button', { name: '完成任务', exact: true }).click()
    await page.getByRole('button', { name: '标记为未完成', exact: true }).waitFor()
    assert.equal((await queryAPI('tasks', 'list'))[0].status, 'done')
    await page.getByRole('button', { name: '标记为未完成', exact: true }).click()
    await page.getByRole('button', { name: '完成任务', exact: true }).waitFor()
    await screenshot('02-tasks')
  })
  await check('中文笔记保存与离开时的取消、放弃、保存', async () => {
    await page.getByRole('link', { name: '随手笔记', exact: true }).click()
    await page.getByRole('textbox', { name: '笔记标题', exact: true }).fill('关于工作台的一些想法')
    await page.getByRole('textbox', { name: '笔记正文', exact: true }).fill('今天开始搭建自己的工作台。\n保留灵感，也整理日常。🌱')
    await page.keyboard.press('Control+s')
    await page.getByText('已保存到本机', { exact: true }).waitFor()
    await page.getByRole('textbox', { name: '笔记正文', exact: true }).fill('未保存的修改')
    await page.getByRole('link', { name: '常用链接', exact: true }).click()
    const unsaved = page.getByRole('dialog', { name: '还有未保存的笔记' })
    await unsaved.getByRole('button', { name: '取消', exact: true }).click()
    assert.equal(await page.getByRole('textbox', { name: '笔记正文', exact: true }).inputValue(), '未保存的修改')
    await page.getByRole('link', { name: '常用链接', exact: true }).click()
    await unsaved.getByRole('button', { name: '放弃修改', exact: true }).click()
    await page.getByRole('heading', { name: '常用链接', exact: true }).waitFor()
    const note = (await queryAPI('notes', 'list'))[0]
    assert(note.body.includes('今天开始搭建'))
    await page.getByRole('link', { name: '随手笔记', exact: true }).click()
    await page.locator('.note-index-item', { hasText: note.title }).click()
    await page.getByRole('textbox', { name: '笔记正文', exact: true }).fill(note.body + '\n继续，慢慢做好每一步。')
    await page.getByRole('link', { name: '今日概览', exact: true }).click()
    await unsaved.getByRole('button', { name: '保存并继续', exact: true }).click()
    await page.locator('.daily-content').waitFor()
    assert((await queryAPI('notes', 'get', [note.id])).body.includes('继续'))
    await page.getByRole('link', { name: '随手笔记', exact: true }).click()
    await page.locator('.note-index-item', { hasText: note.title }).click()
    await screenshot('03-notes')
  })
  await check('链接新增、编辑和协议校验', async () => {
    await page.getByRole('link', { name: '常用链接', exact: true }).click()
    await page.getByRole('button', { name: '添加链接', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '收藏一个好去处' })
    await dialog.getByPlaceholder('例如：我的学习资料').fill('Vue 学习文档')
    await dialog.getByPlaceholder('https://', { exact: true }).fill('https://cn.vuejs.org/')
    await dialog.getByRole('button', { name: '收藏链接', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    await page.getByRole('button', { name: '编辑链接', exact: true }).click()
    const edit = page.getByRole('dialog', { name: '编辑链接' })
    await edit.getByPlaceholder('例如：我的学习资料').fill('Vue 官方文档')
    await edit.getByRole('button', { name: '保存修改', exact: true }).click()
    await edit.waitFor({ state: 'hidden' })
    const blocked = await page.evaluate(() => window.workbench.app.openExternal('file:///C:/Windows'))
    assert.equal(blocked.ok, false)
    assert.equal(blocked.error.code, 'VALIDATION')
    // Substitute only the OS launch side effect; validation and IPC stay real.
    await app.evaluate(({ shell }) => { global.__openedURL = null; shell.openExternal = async url => { global.__openedURL = url } })
    await page.locator('.bookmark-open').first().click()
    await page.waitForTimeout(100)
    assert.equal(await app.evaluate(() => global.__openedURL), 'https://cn.vuejs.org/')
    await screenshot('04-bookmarks')
  })
  await check('搜索中文正文并定位笔记', async () => {
    await page.getByRole('textbox', { name: '全局搜索', exact: true }).fill('灵感')
    await page.getByRole('textbox', { name: '全局搜索', exact: true }).press('Enter')
    await page.locator('.search-result', { hasText: '关于工作台的一些想法' }).waitFor()
    await screenshot('05-search')
    await page.locator('.search-result', { hasText: '关于工作台的一些想法' }).click()
    await page.waitForFunction(() => document.querySelector('.note-title-input')?.value === '关于工作台的一些想法')
  })
  await check('从设置页备份与恢复，内容刷新且保留恢复前备份', async () => {
    await page.getByRole('link', { name: '设置与备份', exact: true }).click()
    const destination = join(data, 'ui-manual.db')
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath })
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] })
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
    }, destination)
    const fitness = await queryAPI('fitness', 'get')
    const date = new Date().toLocaleDateString('sv-SE')
    fitness.records = [{ id: randomUUID(), date, title: '备份恢复训练检查', type: '推', minutes: 30, notes: '', tags: '', source: '手动补录', items: [], updated: new Date().toISOString() }]
    await queryAPI('fitness', 'save', [fitness])
    await page.getByRole('button', { name: '创建备份', exact: true }).click()
    await page.locator('.success-note', { hasText: '最近手动备份' }).waitFor()
    await queryAPI('tasks', 'create', [{ title: '恢复时应被替换的新任务', description: '', status: 'todo', priority: 'normal', dueDate: null }])
    await page.getByRole('button', { name: '选择备份并恢复', exact: true }).click()
    await page.locator('.success-note', { hasText: '恢复前的数据已保留' }).waitFor()
    assert.equal((await queryAPI('tasks', 'list')).length, 1)
    await page.evaluate(() => { location.hash = '/fitness?view=stats' })
    await page.locator('.tf-stat-strip').waitFor()
    assert.match(await page.locator('.tf-stat-strip>div').first().textContent(), /1次/)
    await page.evaluate(() => { location.hash = '/settings' })
    await page.locator('.settings-layout').waitFor()
    await screenshot('06-settings')
  })
  await check('托盘隐藏、重复启动和笔记未保存退出保护', async () => {
    await queryAPI('app', 'setCloseBehavior', ['tray'])
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false)
    const { spawn } = require('node:child_process')
    const child = spawn(process.env.WORKBENCH_TEST_EXECUTABLE || (packaged ? resolve(root, 'release/win-unpacked/PersonalWorkbench.exe') : require('electron')), packaged ? [] : [root], { cwd: root, env, windowsHide: true, stdio: 'ignore' })
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
    assert.equal(code, 0)
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), true)
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1)
    await queryAPI('app', 'setCloseBehavior', ['quit'])
    await page.getByRole('link', { name: '随手笔记', exact: true }).click()
    await page.getByRole('textbox', { name: '笔记标题', exact: true }).fill('退出保护')
    await page.getByRole('textbox', { name: '笔记正文', exact: true }).fill('暂时不退出')
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
    const unsaved = page.getByRole('dialog', { name: '还有未保存的笔记' })
    await unsaved.getByRole('button', { name: '取消', exact: true }).click()
    assert.equal(await page.getByRole('textbox', { name: '笔记正文', exact: true }).inputValue(), '暂时不退出')
    await page.getByRole('link', { name: '今日概览', exact: true }).click()
    await unsaved.getByRole('button', { name: '放弃修改', exact: true }).click()
  })
  await check('离线访问和不同窗口尺寸', async () => {
    await page.context().setOffline(true)
    await page.getByRole('link', { name: /我的待办/ }).click()
    assert((await queryAPI('tasks', 'list')).length > 0)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 720))
    await page.getByRole('link', { name: '今日概览', exact: true }).click()
    await screenshot('07-small-window')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1360, 900))
    await screenshot('08-dashboard-filled')
    await page.context().setOffline(false)
  })
  await check('正常退出后重新打开，数据仍然存在', async () => {
    await queryAPI('app', 'setCloseBehavior', ['quit'])
    const old = app
    await old.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
    await old.waitForEvent('close', { timeout: 10000 }).catch(() => {})
    await old.close().catch(() => {})
    app = null
    await launch()
    assert.equal((await queryAPI('tasks', 'list')).length, 1)
    assert.equal((await queryAPI('notes', 'list')).length, 1)
    assert.equal((await queryAPI('bookmarks', 'list')).length, 1)
  })
  assert.deepEqual(errors, [], 'Renderer errors were recorded')
  writeFileSync(join(output, 'report.json'), JSON.stringify({ passed: checks, errors, durationMs: Date.now() - started, dataDirectory: data, packaged, nativeDialogs: 'File selection and confirmation responses are substituted in this automated test; all application IPC, SQLite and restore operations are real.' }, null, 2))
  console.log(`Completed ${checks.length} desktop checks in ${Date.now() - started} ms`)
}
main().catch(async error => {
  console.error(error)
  if (page) await screenshot('failure').catch(() => {})
  writeFileSync(join(output, 'failure.json'), JSON.stringify({ message: String(error), stack: error.stack, errors, passed: checks, dataDirectory: data }, null, 2))
  process.exitCode = 1
}).finally(forceClose)
