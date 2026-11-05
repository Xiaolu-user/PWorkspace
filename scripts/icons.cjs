const fs = require('node:fs')
const path = require('node:path')
// The approved illustrated PNG and multi-resolution ICO are checked-in brand assets.
// Builds must preserve them rather than regenerating the old geometric icon.
const resources = path.join(__dirname, '../resources')
for (const file of ['icon.png', 'icon.ico']) {
  if (!fs.existsSync(path.join(resources, file))) throw new Error(`Missing application icon: ${file}`)
}
const publicDir = path.join(__dirname, '../src/renderer/public')
fs.mkdirSync(publicDir, { recursive: true })
fs.copyFileSync(path.join(resources, 'icon.png'), path.join(publicDir, 'app-icon.png'))
