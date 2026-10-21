const { spawnSync } = require('node:child_process')
const { resolve } = require('node:path')
const fs = require('node:fs')
const root = resolve(__dirname, '..')
const env = {
  ...process.env,
  electron_config_cache: process.env.electron_config_cache || resolve(root, '.cache/electron'),
  ELECTRON_BUILDER_CACHE: process.env.ELECTRON_BUILDER_CACHE || resolve(root, '.cache/electron-builder'),
  npm_config_cache: resolve(root, '.cache/npm')
}
function run(script, args = []) {
  const result = spawnSync(process.execPath, [resolve(root, script), ...args], { cwd: root, env, stdio: 'inherit' })
  if (result.error) console.error(result.error)
  if (result.status !== 0) process.exit(result.status || 1)
}
run('scripts/icons.cjs')
run('node_modules/vue-tsc/bin/vue-tsc.js', ['--noEmit'])
run('node_modules/electron-vite/bin/electron-vite.js', ['build'])
const mode = process.argv[2]
if (mode === 'pack' || mode === 'dist') {
  run('node_modules/electron-builder/cli.js', ['--win', ...(mode === 'pack' ? ['--dir'] : ['nsis']), '--x64', '--publish', 'never'])
  if (!fs.existsSync(resolve(root, 'release/win-unpacked/PersonalWorkbench.exe'))) throw new Error('Packaged executable was not produced')
}
