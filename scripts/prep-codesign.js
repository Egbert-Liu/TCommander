// 把 winCodeSign 工具预置到项目内可写的缓存目录，绕过 AppData 沙箱限制 + 符号链接权限问题
// app-builder 查找结构: $CACHE/winCodeSign/<hash>/，其中 <hash> 来自下载 URL
const fs = require('fs')
const path = require('path')

const appDataCache = path.join(process.env.LOCALAPPDATA, 'electron-builder', 'Cache', 'winCodeSign')
const projectCache = path.join(__dirname, '..', '.ebcache', 'winCodeSign')

function copyDir(s, d) {
  fs.mkdirSync(d, { recursive: true })
  for (const entry of fs.readdirSync(s, { withFileTypes: true })) {
    const sp = path.join(s, entry.name)
    const dp = path.join(d, entry.name)
    if (entry.isDirectory()) copyDir(sp, dp)
    else if (entry.isSymbolicLink()) {
      try {
        const target = fs.readlinkSync(sp)
        fs.copyFileSync(path.resolve(path.dirname(sp), target), dp)
      } catch {
        // 跳过无法解析的符号链接（macOS dylib Windows 打包用不到）
      }
    } else fs.copyFileSync(sp, dp)
  }
}

// 扫描 AppData 缓存，找到已完整解压的 winCodeSign 目录（跳过临时目录）
if (!fs.existsSync(appDataCache)) {
  console.error('AppData winCodeSign 缓存不存在:', appDataCache)
  process.exit(1)
}

const candidates = fs.readdirSync(appDataCache, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((name) => /^\d+$/.test(name)) // 仅纯数字哈希目录

let srcDir = null
for (const name of candidates) {
  const dir = path.join(appDataCache, name)
  // 完整解压的标志：存在 rcedit-x64.exe
  if (fs.existsSync(path.join(dir, 'rcedit-x64.exe')) ||
      fs.existsSync(path.join(dir, 'windows-10', 'x64', 'signtool.exe'))) {
    srcDir = dir
    console.log('找到完整解压目录:', dir)
    break
  }
}

if (!srcDir) {
  console.error('未找到完整解压的 winCodeSign 目录。候选:', candidates)
  console.error('请先在有管理员权限的环境运行一次让 electron-builder 下载，或手动解压 winCodeSign-2.6.0.7z')
  process.exit(1)
}

const hashName = path.basename(srcDir)
const dstRoot = path.join(projectCache, hashName)

if (fs.existsSync(projectCache)) fs.rmSync(projectCache, { recursive: true, force: true })
copyDir(srcDir, dstRoot)

console.log('已预置项目缓存:', dstRoot)
console.log('rcedit-x64.exe:', fs.existsSync(path.join(dstRoot, 'rcedit-x64.exe')))
console.log('signtool.exe:', fs.existsSync(path.join(dstRoot, 'windows-10', 'x64', 'signtool.exe')) || fs.existsSync(path.join(dstRoot, 'windows-10', 'x86', 'signtool.exe')))
