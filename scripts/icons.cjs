const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')
const size = 256
const bytes = Buffer.alloc((size * 4 + 1) * size)
function rounded(x,y,left,top,width,height,r) { const dx=Math.max(left+r-x,0,x-(left+width-r)); const dy=Math.max(top+r-y,0,y-(top+height-r)); return x>=left&&x<left+width&&y>=top&&y<top+height&&dx*dx+dy*dy<=r*r }
for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
  const p=y*(size*4+1)+1+x*4
  let color=[0,0,0,0]
  if(rounded(x,y,3,3,250,250,58)) color=[30,105+Math.round(y/20),99,255]
  for(const [left,top] of [[60,60],[139,60],[60,139],[139,139]]) if(rounded(x,y,left,top,57,57,13)) color=left===139&&top===139?[239,186,123,255]:[255,255,247,255]
  color.forEach((v,i)=>bytes[p+i]=v)
}
function crc32(buffer) { let crc=0xffffffff; for(const byte of buffer){crc^=byte;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}return (crc^0xffffffff)>>>0 }
function chunk(type,data) { const name=Buffer.from(type);const output=Buffer.alloc(data.length+12);output.writeUInt32BE(data.length);name.copy(output,4);data.copy(output,8);output.writeUInt32BE(crc32(Buffer.concat([name,data])),data.length+8);return output }
const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=6
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(bytes)),chunk('IEND',Buffer.alloc(0))])
const ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(png.length,14);ico.writeUInt32LE(22,18)
const directory=path.join(__dirname,'../resources');fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'icon.png'),png);fs.writeFileSync(path.join(directory,'icon.ico'),Buffer.concat([ico,png]))
