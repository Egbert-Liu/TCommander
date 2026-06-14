// 纯 Node 生成 TCommander 图标 (256x256 ICO)，无原生依赖
// 流程：4x 超采样绘制 -> 降采样 -> PNG 编码(zlib) -> ICO 包装
const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

const SIZE = 256
const SS = 4 // 超采样倍数
const H = SIZE * SS // 高分辨率画布

// RGBA 缓冲区
const buf = Buffer.alloc(H * H * 4)

function lerp(a, b, t) { return a + (b - a) * t }
function blend(dst, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= H || y >= H) return
  const i = (y * H + x) * 4
  const ia = 1 - a
  dst[i] = r * a + dst[i] * ia
  dst[i + 1] = g * a + dst[i + 1] * ia
  dst[i + 2] = b * a + dst[i + 2] * ia
  dst[i + 3] = Math.min(255, a * 255 + dst[i + 3] * ia)
}

// 圆角矩形覆盖判定
function inRoundRect(px, py, x0, y0, x1, y1, r) {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false
  const rx = x1 - r, by = y1 - r
  if (px > rx && py > by) { const dx = px - rx, dy = py - by; return dx * dx + dy * dy <= r * r }
  if (px < x0 + r && py > by) { const dx = (x0 + r) - px, dy = py - by; return dx * dx + dy * dy <= r * r }
  if (px > rx && py < y0 + r) { const dx = px - rx, dy = (y0 + r) - py; return dx * dx + dy * dy <= r * r }
  if (px < x0 + r && py < y0 + r) { const dx = (x0 + r) - px, dy = (y0 + r) - py; return dx * dx + dy * dy <= r * r }
  return true
}

const s = H / 64 // 缩放系数（设计基于 64 坐标系）

// 背景渐变
for (let y = 0; y < H; y++) {
  const t = y / H
  const r = lerp(0x1e, 0x0f, t), g = lerp(0x29, 0x17, t), b = lerp(0x3b, 0x2a, t)
  for (let x = 0; x < H; x++) {
    if (inRoundRect(x, y, 4 * s, 4 * s, 60 * s, 60 * s, 14 * s)) {
      const i = (y * H + x) * 4
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255
    }
  }
}

// 渐变描边
for (let y = 0; y < H; y++) {
  const t = (x => x)(y / H)
  const cr = lerp(0x38, 0x81, t), cg = lerp(0xbd, 0x8c, t), cb = lerp(0xf8, 0xf8, t)
  for (let x = 0; x < H; x++) {
    if (inRoundRect(x, y, 4 * s, 4 * s, 60 * s, 60 * s, 14 * s) &&
        !inRoundRect(x, y, 5.25 * s, 5.25 * s, 58.75 * s, 58.75 * s, 12.75 * s)) {
      const i = (y * H + x) * 4
      buf[i] = cr; buf[i + 1] = cg; buf[i + 2] = cb; buf[i + 3] = 255
    }
  }
}

// 三个终端窗口圆点
function disc(cx, cy, rad, r, g, b) {
  const r2 = rad * rad
  for (let y = Math.floor(cy - rad); y <= cy + rad; y++)
    for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
      const dx = x - cx, dy = y - cy
      if (dx * dx + dy * dy <= r2) blend(buf, x, y, r, g, b, 1)
    }
}
disc(14 * s, 13 * s, 1.8 * s, 0xf8, 0x71, 0x71)
disc(21 * s, 13 * s, 1.8 * s, 0xfb, 0xbf, 0x24)
disc(28 * s, 13 * s, 1.8 * s, 0x34, 0xd3, 0x99)

// 命令提示符 > （两段线，带渐变）
function lineSeg(x0, y0, x1, y1, thick, gradT) {
  const cr = lerp(0x38, 0x81, gradT), cg = lerp(0xbd, 0x8c, gradT), cb = lerp(0xf8, 0xf8, gradT)
  const len = Math.hypot(x1 - x0, y1 - y0)
  const steps = Math.ceil(len)
  for (let i = 0; i <= steps; i++) {
    const px = lerp(x0, x1, i / steps), py = lerp(y0, y1, i / steps)
    const r2 = thick * thick
    for (let y = Math.floor(py - thick); y <= py + thick; y++)
      for (let x = Math.floor(px - thick); x <= px + thick; x++) {
        const dx = x - px, dy = y - py
        if (dx * dx + dy * dy <= r2) blend(buf, x, y, cr, cg, cb, 1)
      }
  }
}
lineSeg(14 * s, 27 * s, 23 * s, 33 * s, 1.5 * s, 0.1)
lineSeg(23 * s, 33 * s, 14 * s, 39 * s, 1.5 * s, 0.5)

// 光标下划线 _
lineSeg(29 * s, 39 * s, 40 * s, 39 * s, 1.5 * s, 0.9)

// 指挥官星章
function star(cx, cy, outerR, innerR, r, g, b) {
  const pts = []
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + i * Math.PI / 5
    const rad = i % 2 === 0 ? outerR : innerR
    pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad])
  }
  for (let y = Math.floor(cy - outerR); y <= cy + outerR; y++)
    for (let x = Math.floor(cx - outerR); x <= cx + outerR; x++) {
      let inside = false
      for (let i = 0, j = 9; i < 10; j = i++) {
        const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1]
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi)) inside = !inside
      }
      if (inside) blend(buf, x, y, r, g, b, 1)
    }
}
star(50 * s, 17 * s, 7.5 * s, 3 * s, 0x81, 0x8c, 0xf8)

// 降采样
const out = Buffer.alloc(SIZE * SIZE * 4)
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let r = 0, g = 0, b = 0, a = 0
    for (let dy = 0; dy < SS; dy++)
      for (let dx = 0; dx < SS; dx++) {
        const i = ((y * SS + dy) * H + (x * SS + dx)) * 4
        r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; a += buf[i + 3]
      }
    const n = SS * SS, o = (y * SIZE + x) * 4
    out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n
  }
}

// PNG 编码
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const t = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}
const CRC_TABLE = (() => {
  const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c } return t
})()
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }

// 加 filter byte(0) 的扫描行
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE)
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0 // None filter
  out.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4)
}
const idat = zlib.deflateSync(raw, { level: 9 })

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0 // 8bit RGBA

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0)),
])

// ICO 包装（PNG 内嵌）
const dir = Buffer.alloc(16)
dir[0] = SIZE === 256 ? 0 : SIZE
dir[1] = SIZE === 256 ? 0 : SIZE
dir[2] = 0; dir[3] = 0
dir.writeUInt16LE(1, 4)
dir.writeUInt16LE(32, 6)
dir.writeUInt32LE(png.length, 8)
dir.writeUInt32LE(22, 12)

const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4)

const ico = Buffer.concat([header, dir, png])
const outDir = path.join(__dirname, '..', 'build')
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'icon.ico'), ico)
fs.writeFileSync(path.join(outDir, 'icon.png'), png)
console.log('已生成 build/icon.ico + build/icon.png (' + SIZE + 'x' + SIZE + ')')
