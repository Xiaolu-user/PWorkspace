import { closeSync, openSync, readSync, statSync } from 'node:fs'

const RT_ICON = 3
const RT_GROUP_ICON = 14
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47])
const HEADER_BYTES = 8192
const MAX_RESOURCES = 32 * 1024 * 1024
// Tiles render at 48px, so 128px is sharp without inflating the cached data URL.
const PREFERRED = [128, 96, 80, 64, 48, 40, 32, 256, 24, 20, 16]

interface Section { virtual: number; size: number; raw: number; rawSize: number }
interface Directory { id: number; directory: boolean; offset: number }
interface Resource { type: number; name: number; offset: number }

function read(fd: number, position: number, length: number): Buffer {
  const buffer = Buffer.alloc(length)
  const bytes = readSync(fd, buffer, 0, length, position)
  return bytes === length ? buffer : buffer.subarray(0, bytes)
}
function locate(sections: Section[], rva: number): number {
  for (const section of sections) if (rva >= section.virtual && rva < section.virtual + Math.max(section.size, section.rawSize)) return rva - section.virtual + section.raw
  return -1
}
// Only the PE header and the section table are needed to find the resource directory.
function header(head: Buffer): { sections: Section[]; rva: number; size: number } | null {
  if (head.length < 0x40 || head.readUInt16LE(0) !== 0x5a4d) return null
  const pe = head.readUInt32LE(0x3c)
  if (pe < 0x40 || pe + 24 > head.length || head.readUInt32LE(pe) !== 0x4550) return null
  const optional = pe + 24, optionalSize = head.readUInt16LE(pe + 20)
  if (!optionalSize || optional + optionalSize > head.length) return null
  const directories = optional + (head.readUInt16LE(optional) === 0x20b ? 112 : 96)
  if (directories + 24 > optional + optionalSize) return null
  const rva = head.readUInt32LE(directories + 16), size = head.readUInt32LE(directories + 20)
  const table = optional + optionalSize, count = head.readUInt16LE(pe + 6)
  const sections: Section[] = []
  for (let i = 0; i < count; i++) {
    const item = table + i * 40
    if (item + 40 > head.length) return null
    sections.push({ virtual: head.readUInt32LE(item + 12), size: head.readUInt32LE(item + 8), raw: head.readUInt32LE(item + 20), rawSize: head.readUInt32LE(item + 16) })
  }
  return rva ? { sections, rva, size } : null
}
function children(buffer: Buffer, offset: number): Directory[] {
  if (offset < 0 || offset + 16 > buffer.length) return []
  const count = buffer.readUInt16LE(offset + 12) + buffer.readUInt16LE(offset + 14), list: Directory[] = []
  for (let i = 0; i < count; i++) {
    const item = offset + 16 + i * 8
    if (item + 8 > buffer.length) break
    const target = buffer.readUInt32LE(item + 4)
    list.push({ id: buffer.readUInt32LE(item) & 0x7fffffff, directory: (target & 0x80000000) !== 0, offset: target & 0x7fffffff })
  }
  return list
}
// Type → name → language; every language entry points at one data record.
function resources(buffer: Buffer): Resource[] {
  const list: Resource[] = []
  for (const type of children(buffer, 0)) {
    if (!type.directory) continue
    for (const name of children(buffer, type.offset)) {
      if (!name.directory) continue
      for (const language of children(buffer, name.offset)) if (!language.directory) list.push({ type: type.id, name: name.id, offset: language.offset })
    }
  }
  return list
}
function data(buffer: Buffer, item: Resource, base: number): Buffer | null {
  if (item.offset < 0 || item.offset + 8 > buffer.length) return null
  const start = buffer.readUInt32LE(item.offset) - base, length = buffer.readUInt32LE(item.offset + 4)
  if (start < 0 || length < 8 || start + length > buffer.length) return null
  return buffer.subarray(start, start + length)
}
// Some executables store every icon as PNG data, which SHGetFileInfo refuses to decode: the shell
// then answers with its generic program icon. Reading the resource table keeps the real artwork.
function pick(buffer: Buffer, base: number): Buffer | null {
  const list = resources(buffer)
  const group = list.find(item => item.type === RT_GROUP_ICON)
  if (!group) return null
  const table = data(buffer, group, base)
  if (!table || table.length < 6) return null
  const count = table.readUInt16LE(4), found: { width: number; png: Buffer }[] = []
  for (let i = 0; i < count; i++) {
    const entry = 6 + i * 14
    if (entry + 14 > table.length) break
    const width = table[entry] || 256, icon = list.find(item => item.type === RT_ICON && item.name === table.readUInt16LE(entry + 12))
    if (!icon) continue
    const png = data(buffer, icon, base)
    if (png && png.length > PNG.length && png.subarray(0, PNG.length).equals(PNG)) found.push({ width, png })
  }
  if (!found.length) return null
  const rank = (width: number): number => { const index = PREFERRED.indexOf(width); return index < 0 ? PREFERRED.length : index }
  found.sort((a, b) => rank(a.width) - rank(b.width) || b.width - a.width)
  return found[0].png
}
export function executableIcon(path: string): Buffer | null {
  let fd: number | undefined
  try {
    const total = statSync(path).size
    if (!total) return null
    fd = openSync(path, 'r')
    const layout = header(read(fd, 0, Math.min(total, HEADER_BYTES)))
    if (!layout) return null
    const start = locate(layout.sections, layout.rva)
    if (start < 0) return null
    const length = Math.min(layout.size || MAX_RESOURCES, MAX_RESOURCES, total - start)
    if (length < 16) return null
    return pick(read(fd, start, length), layout.rva)
  } catch { return null }
  finally { if (fd !== undefined) try { closeSync(fd) } catch { /* already closed */ } }
}
