const { _electron: electron } = require('playwright')
const assert = require('node:assert/strict')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { randomUUID } = require('node:crypto')
const root = resolve(__dirname, '..'), output = join(root, 'test-results/shortcuts'), data = join(root, '.cache', `shortcuts-${randomUUID()}`)
mkdirSync(output, { recursive: true }); mkdirSync(data, { recursive: true })
const env = { ...process.env, WORKBENCH_DATA_DIR: data }; delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
let app, page; const errors = [], checks = []
async function api(group, method, ...args) { const r = await page.evaluate(async ({ group, method, args }) => window.workbench[group][method](...args), { group, method, args }); assert.equal(r.ok, true, JSON.stringify(r)); return r.data }
async function launch() { app = await electron.launch({ executablePath: require('electron'), args: [root], cwd: root, env }); page = await app.firstWindow(); page.on('pageerror', e => errors.push(e.message)); await page.waitForFunction(() => document.querySelector('.page-footer')?.textContent.includes('v0.1.0')); }
async function stop() { if (app) { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); await app.close().catch(() => {}); app = null } }
async function size(width, height) { await app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0].setContentSize(...s), [width, height]); await page.waitForTimeout(420) }
const card = () => page.locator('.shortcut-card')
async function metrics() {
  return card().evaluate(el => {
    const grid = el.querySelector('.shortcut-grid')
    const style = getComputedStyle(grid)
    return {
      columns: style.gridTemplateColumns.split(' ').filter(Boolean).length,
      gridHeight: Math.round(grid.getBoundingClientRect().height),
      cardHeight: Math.round(el.getBoundingClientRect().height),
      overflowX: el.scrollWidth - el.clientWidth,
      tiles: el.querySelectorAll('.shortcut-tile').length,
      tags: [...el.querySelectorAll('.shortcut-tag')].map(node => node.textContent.trim()),
      blank: [...el.querySelectorAll('.shortcut-tile')].filter(tile => {
        const body = tile.querySelector('.shortcut-open')
        return !body.querySelector('img') && !body.querySelector('.shortcut-generic') && !body.querySelector('.shortcut-monogram')
      }).length,
      restBackground: getComputedStyle(el.querySelector('.shortcut-open')).backgroundColor
    }
  })
}
async function main() {
  const exe = join(data, 'FakeApp.exe'), link = join(data, 'Docs.url'), photo = join(data, 'photo.png')
  writeFileSync(exe, '', 'utf8'); writeFileSync(photo, 'x')
  writeFileSync(link, '[InternetShortcut]\r\nURL=https://example.com/docs\r\n', 'utf8')

  await launch(); await size(1600, 1000)
  for (const [title, group] of [['GitHub', '开发'], ['Stack Overflow', '开发'], ['MDN', '开发'], ['课程平台', '学习'], ['图书馆', '学习'], ['阅读清单', '学习'], ['邮箱', ''], ['日历', ''], ['网盘', ''], ['相册', ''], ['音乐', ''], ['个人主页', '']]) await api('bookmarks', 'create', { title, url: 'https://example.com', group })
  const imported = await api('shortcuts', 'import', [exe, link, photo], '开发')
  assert.deepEqual({ added: imported.added, links: imported.links, skipped: imported.skipped.length }, { added: 1, links: 1, skipped: 1 })
  await page.reload(); await page.locator('.shortcut-tile').first().waitFor(); await page.waitForTimeout(300)

  const base = await metrics()
  assert.ok(base.columns >= 8, `1600px 下应为 8 列以上，实际 ${base.columns}`)
  assert.equal(base.blank, 0, '每个快捷方式都必须有图标或回退图形，不能出现空白格')
  assert.equal(base.restBackground, 'rgba(0, 0, 0, 0)', '未悬停时不应有常驻卡片底色')
  assert.ok(base.tiles >= 13, `快捷方式数量应不少于 13，实际 ${base.tiles}`)
  checks.push(`1600px 下 ${base.columns} 列、卡片高 ${base.cardHeight}px、${base.tiles} 个图标同屏，未悬停时无底色`)
  await page.screenshot({ path: join(output, 'home-1600.png') })
  await card().screenshot({ path: join(output, 'card-1600.png') })

  // 1. 分类标签与计数
  const tagText = base.tags.join('|')
  assert.match(tagText, /全部\d+/); assert.match(tagText, /应用\d+/); assert.match(tagText, /网页\d+/)
  assert.match(tagText, /开发\d+/); assert.match(tagText, /学习\d+/)
  await page.getByRole('tab', { name: /^开发/ }).click()
  await page.waitForTimeout(250)
  const devOnly = await metrics()
  assert.ok(devOnly.tiles < base.tiles && devOnly.tiles >= 3, `“开发”标签应只显示该分类条目，实际 ${devOnly.tiles}`)
  await page.getByRole('tab', { name: /^全部/ }).click(); await page.waitForTimeout(200)
  checks.push('分类标签带计数，切换“开发”只显示该分类条目')

  // 2. 就地新建分类
  await page.locator('.shortcut-tag-add').click()
  await page.locator('.shortcut-tag-input').fill('影音')
  await page.locator('.shortcut-tag-input').press('Enter')
  await page.waitForTimeout(500)
  const created = await metrics()
  assert.ok(created.tags.includes('影音0'), `新建分类应出现在标签行，实际 ${created.tags.join('|')}`)
  assert.equal((await api('planner', 'get')).categories.includes('影音'), true)
  checks.push('点“＋”就地新建“影音”分类，标签立即出现并写入数据库')

  // 3. 拖动图标到分类标签归类
  await page.evaluate(() => {
    const tile = [...document.querySelectorAll('.shortcut-tile .shortcut-open')].find(node => node.textContent.includes('FakeApp'))
    const tag = [...document.querySelectorAll('.shortcut-tag')].find(node => node.textContent.startsWith('影音'))
    const dt = new DataTransfer()
    tile.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }))
    tag.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }))
    tag.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true }))
    tag.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }))
    tile.dispatchEvent(new DragEvent('dragend', { dataTransfer: dt, bubbles: true }))
  })
  await page.waitForTimeout(600)
  const moved = (await api('planner', 'get')).entries.find(item => item.title.includes('FakeApp'))
  assert.equal(moved.category, '影音', `拖动后应用应归入影音，实际 ${moved.category}`)
  checks.push('拖动图标到“影音”标签即归类，落库为 entry.category')

  // 4. 菜单里归类网页
  const webTile = page.locator('.shortcut-tile').filter({ hasText: 'GitHub' }).first()
  await webTile.hover(); await webTile.locator('.shortcut-more').click()
  await page.locator('.el-popper:visible .el-dropdown-menu__item', { hasText: '归入 影音' }).first().click()
  await page.waitForTimeout(600)
  const github = (await api('bookmarks', 'list')).find(item => item.title === 'GitHub')
  assert.equal(github.group, '影音', `网页应归入影音，实际 ${github.group}`)
  checks.push('网页通过“⋯ → 归入 影音”改分组，与分类共用一套标签')

  // 4b. 点击图标仍能打开（拖拽属性不能吞掉点击）
  await app.evaluate(({ shell }) => { global.__openedUrl = []; shell.openExternal = async url => { global.__openedUrl.push(url) } })
  await page.locator('.shortcut-tile').filter({ hasText: 'MDN' }).first().locator('.shortcut-open').click()
  await page.waitForTimeout(400)
  assert.equal((await app.evaluate(() => global.__openedUrl)).length, 1, '点击网页图标应打开链接')
  checks.push('图标可拖动归类，同时点击仍是正常打开（拖拽属性没有吞掉点击）')

  // 5. 桌面拖入蒙版
  await page.evaluate(() => {
    const dt = new DataTransfer(); dt.items.add(new File([''], 'a.lnk'))
    document.querySelector('.shortcut-card').dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }))
  })
  await page.waitForTimeout(250)
  assert.equal(await page.locator('.shortcut-drop').count(), 1, '拖入文件时应显示投放蒙版')
  const dropText = await page.locator('.shortcut-drop').innerText()
  assert.match(dropText, /松开即可添加/); assert.match(dropText, /将添加到/)
  await card().screenshot({ path: join(output, 'card-drop.png') })
  await page.evaluate(() => {
    const dt = new DataTransfer(); dt.items.add(new File([''], 'a.lnk'))
    document.querySelector('.shortcut-card').dispatchEvent(new DragEvent('dragleave', { dataTransfer: dt, bubbles: true }))
  })
  await page.waitForTimeout(250)
  assert.equal(await page.locator('.shortcut-drop').count(), 0, '离开后蒙版应消失')
  checks.push('整块卡片是投放区：拖入显示“松开即可添加 / 将添加到”蒙版，离开即消失')

  const virtualPath = await page.evaluate(() => window.workbench.filePath(new File([''], 'ghost.lnk')))
  assert.equal(virtualPath, '', '来自浏览器的虚拟文件没有真实路径，应返回空字符串而不是报错')
  checks.push('拖入虚拟文件时取路径返回空值，不会让界面报错')

  // 6. 不支持的格式返回明确提示
  const rejected = await api('shortcuts', 'import', [photo], '')
  assert.equal(rejected.added + rejected.links, 0)
  assert.equal(rejected.skipped.length, 1)
  checks.push('拖入图片等不支持的文件会被跳过并计入提示数量')

  // 7. 重复导入不会重复添加
  const again = await api('shortcuts', 'import', [exe], '')
  assert.equal(again.added, 0); assert.equal(again.duplicates, 1)
  checks.push('同一路径重复导入只记一次，第二次计入重复项')

  // 8. 管理分类：改名同步迁移条目与网页
  await card().getByRole('button', { name: '＋ 添加' }).click()
  await page.locator('.el-popper:visible .el-dropdown-menu__item', { hasText: '管理分类' }).click()
  await page.locator('.shortcut-manage-row', { hasText: '影音' }).getByRole('button', { name: '改名' }).click()
  await page.locator('.el-message-box__input input').fill('媒体')
  await page.getByRole('button', { name: '保存' }).click()
  await page.waitForTimeout(700)
  assert.equal((await api('planner', 'get')).entries.find(item => item.title.includes('FakeApp')).category, '媒体')
  assert.equal((await api('bookmarks', 'list')).find(item => item.title === 'GitHub').group, '媒体')
  await page.screenshot({ path: join(output, 'manage.png') })
  checks.push('管理分类里改名“影音→媒体”，应用条目与网页分组同步迁移')

  // 9. 删除分类回到未分类
  await page.locator('.shortcut-manage-row', { hasText: '媒体' }).getByRole('button', { name: '删除' }).click()
  await page.locator('.el-message-box').getByRole('button', { name: '删除' }).click()
  await page.waitForTimeout(700)
  assert.equal((await api('planner', 'get')).entries.find(item => item.title.includes('FakeApp')).category, '')
  assert.equal((await api('bookmarks', 'list')).find(item => item.title === 'GitHub').group, '未分类')
  await page.getByRole('button', { name: '完成' }).click()
  checks.push('删除“媒体”分类后条目回到未分类，快捷方式本身保留')

  // 10. 图标提取结果可用
  const entries = (await api('planner', 'get')).entries
  const icon = await api('shortcuts', 'refreshIcon', entries[0].id)
  assert.equal(typeof icon, 'string')
  checks.push('重新提取图标返回可用结果或空字符串（空值时界面显示通用图标）')

  // 11. 三种窗口与夜间
  for (const [w, h] of [[1320, 860], [960, 640]]) {
    await size(w, h)
    const state = await metrics()
    assert.ok(state.columns >= 5, `${w}px 下列数应不少于 5，实际 ${state.columns}`)
    assert.equal(state.overflowX <= 1, true, `${w}px 下卡片不应出现横向溢出`)
    await card().screenshot({ path: join(output, `card-${w}.png`) })
    await page.screenshot({ path: join(output, `home-${w}.png`) })
  }
  await size(1600, 1000)
  await page.getByRole('button', { name: '切换夜间模式', exact: true }).click()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
  await page.waitForTimeout(400)
  await card().screenshot({ path: join(output, 'card-dark.png') })
  const dark = await metrics()
  assert.equal(dark.blank, 0)
  await page.getByRole('button', { name: '切换日间模式', exact: true }).click()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light')
  checks.push('1320 / 960 窗口与夜间模式下网格自适应、无横向溢出、图标不空白')

  // 12. 重启保留分类
  await stop(); await launch(); await page.locator('.shortcut-tile').first().waitFor()
  const restarted = await api('planner', 'get')
  assert.deepEqual(restarted.categories, ['开发', '学习'], '仍在使用中的分类保留，删除的“媒体”不再写回')
  assert.equal(restarted.entries.find(item => item.title.includes('FakeApp')).category, '')
  const afterTags = await metrics()
  assert.ok(afterTags.tags.some(text => /^开发\d+$/.test(text)), `重启后由数据推导的分类标签应保留，实际 ${afterTags.tags.join('|')}`)
  checks.push('重启后分类标签与条目保留，删除的分类不会写回')

  assert.deepEqual(errors, [])
  writeFileSync(join(output, 'report.json'), JSON.stringify({ checks, errors, data, imported }, null, 2))
  console.log(checks.join('\n'))
}
main().catch(async e => { console.error(e); if (page) await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {}); process.exitCode = 1 }).finally(stop)
