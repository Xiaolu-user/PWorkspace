import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { artworkPath } from '../src/renderer/src/fitness/artwork'
import catalog from '../src/renderer/src/fitness/catalog.json'
const publicDir=join(process.cwd(),'src/renderer/public')
describe('发布插画与旧备份路径兼容',()=>{
 it('全部预置动作和默认图都有实际的 WebP 文件',()=>{
  for(const e of catalog){expect(e.image.endsWith('.webp')).toBe(true);expect(existsSync(join(publicDir,e.image))).toBe(true)}
  expect(existsSync(join(publicDir,'fitness/cartoon/default-exercise.webp'))).toBe(true)
 })
 it('旧 PNG 路径全部解析到相同的已发布插画',()=>{
  for(const folder of ['cartoon','decor'])for(const file of readdirSync(join(publicDir,'fitness',folder)).filter(f=>f.endsWith('.webp'))){
   const path='fitness/'+folder+'/'+file
   expect(artworkPath(path.replace('.webp','.png'))).toBe(path)
  }
 })
 it('不改写用户自定义图片、外部地址或未知文件',()=>{
  for(const path of ['data:image/png;base64,abc','custom/photo.png','https://example.com/photo.png','fitness/cartoon/custom.png'])expect(artworkPath(path)).toBe(path)
 })
})
