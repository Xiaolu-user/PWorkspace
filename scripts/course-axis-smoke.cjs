const { _electron: electron } = require('playwright')
const assert = require('node:assert/strict')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { randomUUID } = require('node:crypto')
const root = resolve(__dirname, '..'), output = join(root, 'test-results/course-axis'), data = join(root, '.cache', `course-axis-${randomUUID()}`)
mkdirSync(output, { recursive: true }); mkdirSync(data, { recursive: true })
const env = { ...process.env, WORKBENCH_DATA_DIR: data }; delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
let app, page; const errors = [], checks = []
async function api(group, method, ...args) { const r = await page.evaluate(async ({ group, method, args }) => window.workbench[group][method](...args), { group, method, args }); assert.equal(r.ok, true, JSON.stringify(r)); return r.data }
async function launch() { app = await electron.launch({ executablePath: require('electron'), args: [root], cwd: root, env }); page = await app.firstWindow(); page.on('pageerror', e => errors.push(e.message)); await page.waitForFunction(() => document.querySelector('.page-footer')?.textContent.includes('v0.1.0')) }
async function stop() { if (app) { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); await app.close().catch(() => {}); app = null } }
async function main() {
  await launch(); await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1600, 1000))
  const week = [8]
  await api('planner', 'semester', { title: '2026-2027第一学期', startDate: '2026-09-07', weeks: 18, courses: [
    { id: 'c1', title: '新时代中国特色社会主义', teacher: '', color: '#d85a30', schedules: [{ id: 's1', day: 1, start: '08:00', end: '11:25', room: '南三阶梯', weeks: week, exceptions: [] }] },
    { id: 'c2', title: '机器学习', teacher: '王老师', color: '#9674cc', schedules: [{ id: 's2', day: 3, start: '09:50', end: '11:25', room: '獐子岛104', weeks: week, exceptions: [] }] },
    { id: 'c3', title: '矩阵分析', teacher: '', color: '#3b5bdb', schedules: [
      { id: 's3', day: 1, start: '13:30', end: '15:05', room: '獐子岛222', weeks: week, exceptions: [] },
      { id: 's4', day: 3, start: '13:30', end: '15:05', room: '獐子岛232', weeks: week, exceptions: [] }] },
    { id: 'c4', title: '夜间实验课', teacher: '', color: '#17765c', schedules: [{ id: 's5', day: 4, start: '19:00', end: '20:40', room: '实验楼B201', weeks: week, exceptions: [] }] }
  ] })
  await page.reload(); await page.locator('.week-grid-body').waitFor(); await page.waitForTimeout(250)
  const card = page.locator('.courses-card')
  const axis = await card.locator('.period-cell').evaluateAll(nodes => nodes.map(node => node.innerText.split('\n').map(text => text.trim()).filter(Boolean).join('–')))
  assert.deepEqual(axis, ['08:00–11:25', '09:50–11:25', '13:30–15:05', '19:00–20:40'])
  assert.equal(await card.getByText('08:45', { exact: true }).count(), 0)
  assert.equal(await card.getByText('16:05', { exact: true }).count(), 0)
  checks.push('左轴只列出 4 个实际排课时段，未排课的固定节次不再出现')

  const gridHeight = async () => Math.round((await card.locator('.week-grid-body').boundingBox()).height)
  const seps = await card.locator('.week-sep').evaluateAll(nodes => nodes.map(node => node.style.gridRow))
  assert.deepEqual(seps, ['3', '4'])
  assert.deepEqual(await card.locator('.week-sep').evaluateAll(nodes => nodes.map(node => node.classList.contains('noon'))), [true, false])
  const rowTops = await card.locator('.period-cell').evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().top)))
  const sepTops = await card.locator('.week-sep').evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().top)))
  assert.ok(Math.abs(sepTops[0] - rowTops[2]) <= 2, `上午/下午分隔线应与 13:30 行对齐，实际 ${sepTops[0]} vs ${rowTops[2]}`)
  assert.ok(Math.abs(sepTops[1] - rowTops[3]) <= 2, `下午/晚上分隔线应与 19:00 行对齐，实际 ${sepTops[1]} vs ${rowTops[3]}`)
  checks.push('上午/下午分界为两条平行浅线并与 13:30 行齐平，晚间分界与 19:00 行齐平')

  const blocks = card.locator('.course-block')
  assert.equal(await blocks.count(), 5)
  const clipped = await blocks.evaluateAll(nodes => nodes.map(node => ({ text: node.innerText.replace(/\n/g, ' / '), over: node.scrollHeight - node.clientHeight, wide: node.scrollWidth - node.clientWidth })).filter(item => item.over > 1 || item.wide > 1))
  assert.deepEqual(clipped, [])
  const texts = await blocks.evaluateAll(nodes => nodes.map(node => node.innerText.split('\n').map(line => line.trim()).filter(Boolean)))
  for (const lines of texts) {
    assert.equal(lines.length, 2, `课程块只应有两行内容：${lines.join(' | ')}`)
    assert.equal(/^([01]\d|2[0-3]):[0-5]\d/.test(lines[0]), false, `课程块不应再显示时间：${lines.join(' | ')}`)
  }
  assert.deepEqual(texts[0], ['新时代中国特色社会主义', '南三阶梯'])
  checks.push('课程块只显示课程名称与上课教室，时间从块内移除；所有块内容完整无裁切')

  const blockBox = await card.locator('.course-block').first().boundingBox()
  const grid100 = await gridHeight()
  assert.ok(blockBox.height > 0)

  await page.screenshot({ path: join(output, 'home-axis-1600.png') })
  await page.getByRole('button', { name: '学期课程', exact: false }).first().click()
  await page.locator('.course-planner-dialog').waitFor(); await page.waitForTimeout(300)
  const font = page.getByRole('spinbutton', { name: '首页课程文字大小', exact: true })
  assert.equal(await font.inputValue(), '100')
  await font.fill('140'); await font.press('Tab')
  await page.screenshot({ path: join(output, 'planner-font-140.png') })
  await page.getByRole('button', { name: '保存课程表', exact: true }).click()
  await page.locator('.course-planner-dialog').waitFor({ state: 'hidden' })
  assert.equal((await api('app', 'preferences')).appearance.courseFontScale, 140)
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.courses-card')).getPropertyValue('--course-text-scale').trim() === '1.4')
  const grid140 = await gridHeight()
  assert.ok(grid140 > grid100, `字号放大后网格应重新排版增高，实际 ${grid100} → ${grid140}`)
  const titleSize = await card.locator('.course-block strong').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))
  assert.ok(Math.abs(titleSize - 15.4) < 0.6, `课程标题字号应为 15.4px，实际 ${titleSize}`)
  const clipped140 = await blocks.evaluateAll(nodes => nodes.map(node => ({ over: node.scrollHeight - node.clientHeight, wide: node.scrollWidth - node.clientWidth })).filter(item => item.over > 1 || item.wide > 1))
  assert.deepEqual(clipped140, [])
  checks.push(`学期课程内新增“首页课程文字大小”，140% 后标题 11px → 15.4px，网格由 ${grid100}px 自动重排到 ${grid140}px 且内容仍完整`)

  await page.screenshot({ path: join(output, 'home-axis-font-140.png') })
  await page.reload(); await page.locator('.week-grid-body').waitFor(); await page.waitForTimeout(250)
  assert.equal(await gridHeight(), grid140)
  assert.deepEqual(await card.locator('.week-sep').evaluateAll(nodes => nodes.map(node => node.style.gridRow)), ['3', '4'])
  checks.push('字号设置与两条分隔线在重启后保持')

  const appearance = async () => (await api('app', 'preferences')).appearance
  await api('app', 'setAppearance', { ...(await appearance()), courseFontScale: 160 })
  await page.reload(); await page.locator('.week-grid-body').waitFor(); await page.waitForTimeout(250)
  const clipped160 = await blocks.evaluateAll(nodes => nodes.map(node => ({ over: node.scrollHeight - node.clientHeight, wide: node.scrollWidth - node.clientWidth })).filter(item => item.over > 1 || item.wide > 1))
  assert.deepEqual(clipped160, [])
  assert.ok(await gridHeight() > grid140)
  checks.push('上限 160% 时网格继续自动增高，课程名与教室仍完整')
  await api('app', 'setAppearance', { ...(await appearance()), courseFontScale: 140 })
  await page.reload(); await page.locator('.week-grid-body').waitFor()

  await page.getByRole('button', { name: '查看下一周', exact: true }).click()
  await page.locator('.week-empty').waitFor()
  assert.equal(await page.locator('.period-cell').count(), 0)
  assert.equal(await page.locator('.week-sep').count(), 0)
  await page.screenshot({ path: join(output, 'home-empty-week.png') })
  checks.push('无课的一周只显示提示，不渲染空节次行或分隔线')
  await page.getByRole('button', { name: '本周', exact: true }).click(); await page.locator('.period-cell').first().waitFor()

  for (const size of [[1600, 1000], [1320, 860], [960, 640]]) {
    await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(...size), size)
    await page.waitForTimeout(260)
    assert.equal(await card.evaluate(el => el.scrollWidth > el.clientWidth + 1), false)
    const narrow = await blocks.evaluateAll(nodes => nodes.map(node => ({ over: node.scrollHeight - node.clientHeight, wide: node.scrollWidth - node.clientWidth })).filter(item => item.over > 1 || item.wide > 1))
    assert.deepEqual(narrow, [], `${size[0]}px 窗口下课程块被裁切`)
    await page.screenshot({ path: join(output, `layout-${size[0]}.png`) })
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1600, 1000)); await page.waitForTimeout(350)
  await page.locator('.theme-toggle').click()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
  await page.waitForTimeout(220)
  await page.screenshot({ path: join(output, 'home-axis-dark.png') })
  await page.locator('.theme-toggle').click()
  checks.push('三种窗口无横向溢出、课程块无裁切，夜间模式时间轴与分隔线配色正常')

  assert.deepEqual(errors, [])
  writeFileSync(join(output, 'report.json'), JSON.stringify({ checks, errors, data, grid100, grid140 }, null, 2)); console.log(checks.join('\n'))
}
main().catch(async e => { console.error(e); if (page) await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {}); process.exitCode = 1 }).finally(stop)
