const { spawn } = require('node:child_process')
const { resolve } = require('node:path')

const root = resolve(__dirname, '..')
const env = { ...process.env, WORKBENCH_DATA_DIR: resolve(root, '.cache/dev-profile') }
delete env.ELECTRON_RUN_AS_NODE
// Keep preview data separate from the installed application's personal records.
const child = spawn(process.execPath, [resolve(root, 'node_modules/electron-vite/bin/electron-vite.js'), 'dev', '--watch'], {
  cwd: root, env, stdio: 'inherit'
})
child.on('error', error => { console.error(error); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 0 })
