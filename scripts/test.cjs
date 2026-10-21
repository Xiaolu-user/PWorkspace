const { spawnSync } = require('node:child_process')
const electron = require('electron')
// Run the test runner in Electron's Node runtime, matching better-sqlite3's ABI.
const result = spawnSync(electron, [require.resolve('vitest/vitest.mjs'), 'run', ...process.argv.slice(2)], {
  stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})
if (result.error) console.error(result.error)
process.exit(result.status ?? 1)
