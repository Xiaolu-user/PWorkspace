import { app, nativeImage, shell, type NativeImage } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { iconUsable } from '../shared/shortcuts'
import { executableIcon } from './exeicon'
import { externalUrl } from './validation'

// Electron returns an empty or 1px image instead of throwing for Store apps, broken links and
// network paths, which used to leave a blank tile. Every source is validated before it is cached.
function dataUrl(image: NativeImage): string {
  if (!image || image.isEmpty()) return ''
  const { width, height } = image.getSize()
  if (!iconUsable(width, height)) return ''
  return image.toDataURL()
}
async function fromFileIcon(path: string): Promise<string> {
  for (const size of ['large', 'normal'] as const) {
    try { const icon = dataUrl(await app.getFileIcon(path, { size })); if (icon) return icon } catch { /* try the next source */ }
  }
  return ''
}
function fromImageFile(path: string): string {
  try { return dataUrl(nativeImage.createFromPath(path)) } catch { return '' }
}
// The shell answers with a generic placeholder — a paper sheet for shortcuts, a blank window for
// programs — instead of failing, so both images are sampled once and rejected when they come back.
interface Generic { program: string; shortcut: string }
let generic: Promise<Generic> | null = null
function genericIcons(): Promise<Generic> {
  generic ??= (async () => {
    const result: Generic = { program: '', shortcut: '' }
    for (const [key, extension] of [['program', '.exe'], ['shortcut', '.lnk']] as const) {
      const probe = join(tmpdir(), `wb-shell-icon-${process.pid}-${key}${extension}`)
      try { writeFileSync(probe, ''); result[key] = await fromFileIcon(probe) } catch { /* keep it empty */ }
      finally { try { rmSync(probe, { force: true }) } catch { /* disposable probe */ } }
    }
    return result
  })()
  return generic
}
// Hand-written links sometimes append an icon index ("C:\app.exe,0") to the icon field.
function iconPath(value: string | undefined): string | null {
  if (!value) return null
  const text = value.trim().replace(/^"|"$/g, '')
  const comma = text.lastIndexOf(',')
  return (comma > 2 && /^\d+$/.test(text.slice(comma + 1)) ? text.slice(0, comma) : text) || null
}
// Windows shortcuts keep their real icon either in their own icon file or in the target program.
function shortcutSources(path: string): string[] {
  if (process.platform !== 'win32' || extname(path).toLowerCase() !== '.lnk') return []
  try {
    const link = shell.readShortcutLink(path)
    return [link.icon, link.target].map(iconPath).filter((value): value is string => !!value && existsSync(value))
  } catch { return [] }
}
async function sourceIcon(source: string): Promise<string> {
  const extension = extname(source).toLowerCase()
  if (extension === '.exe' || extension === '.dll') {
    const png = executableIcon(source)
    const icon = png ? dataUrl(nativeImage.createFromBuffer(png)) : ''
    if (icon) return icon
  }
  if (extension === '.ico') { const icon = fromImageFile(source); if (icon) return icon }
  return fromFileIcon(source)
}
export async function entryIcon(path: string): Promise<string> {
  const placeholder = await genericIcons()
  const sources = shortcutSources(path)
  // A .lnk on its own only ever yields the generic shortcut picture, so it is the last resort.
  if (!sources.length) sources.push(path)
  const seen = new Set<string>()
  for (const source of sources) {
    if (seen.has(source)) continue
    seen.add(source)
    const icon = await sourceIcon(source)
    if (icon && icon !== placeholder.program && icon !== placeholder.shortcut) return icon
  }
  return ''
}
export interface WebLink { title: string; url: string }
// `.url` files are plain INI: URL= holds the address, and the file name is the best title.
export function readWebLink(path: string): WebLink | null {
  try {
    const text = readFileSync(path, 'utf8').slice(0, 8192)
    const line = text.split(/\r?\n/).find(item => /^\s*url\s*=/i.test(item))
    if (!line) return null
    return { title: basename(path).replace(/\.url$/i, '').slice(0, 200) || line.split('=').slice(1).join('=').trim(), url: externalUrl(line.slice(line.indexOf('=') + 1).trim()) }
  } catch { return null }
}
