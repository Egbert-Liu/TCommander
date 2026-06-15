# TCommander EXE 白屏问题诊断报告

## 问题描述
用户反馈安装打包后的 `TCommander Setup 0.1.x.exe` 后，启动应用显示**白屏**，无任何内容显示。

---

## 问题根因分析

### 根本原因：前端资源未被打包进 exe

**配置缺陷位置**：[package.json](file:///d:/vibe_code/cli_manager/package.json#L52-L55)

**原始配置**（有缺陷）：
```json
"files": [
  "out/**/*",    // 仅包含主进程和 preload
  "package.json"
]
```

**缺少关键配置**：`dist/**/*`（Vite 构建的前端渲染资源）

### 路径解析链路分析

主进程加载逻辑 [src/main/index.ts#L41-L42](file:///d:/vibe_code/cli_manager/src/main/index.ts#L41-L42)：
```typescript
} else {
  mainWindow.loadFile(path.join(__dirname, '../index.html'))
}
```

- `__dirname` 在打包后指向 `app.asar/out/main/`
- 期望路径：`app.asar/index.html`
- **实际情况**：`dist/index.html` 未被打包进入 `app.asar` → 加载失败 → 白屏

### 资源文件清单对比

| 文件 | 本地开发环境 | 打包后 exe 内部 |
|------|-------------|----------------|
| `out/main/index.js` | ✅ | ✅ (已配置) |
| `out/preload/index.js` | ✅ | ✅ (已配置) |
| `dist/index.html` | ✅ | ❌ (缺失) |
| `dist/assets/*.js` | ✅ | ❌ (缺失) |
| `dist/assets/*.css` | ✅ | ❌ (缺失) |

---

## 修复方案

### 修复内容

**修改位置**：[package.json](file:///d:/vibe_code/cli_manager/package.json)

**修复后配置**：
```json
"files": [
  "out/**/*",
  "dist/**/*",    // 添加此行：包含前端渲染资源
  "package.json"
]
```

**原理**：让 electron-builder 将 `dist/` 目录（含 `index.html`、JS、CSS）打包进 `app.asar`

### 修复状态

✅ **已完成修复**：package.json 配置已更新

---

## 当前构建状态

### 构建障碍

当前遇到 **文件锁定问题**：`release/win-unpacked/resources/app.asar` 文件被某个进程占用，导致无法重新打包。

**可能原因**：
1. 之前的 Electron 构建进程未完全退出
2. 防病毒软件扫描锁定
3. 系统文件句柄泄漏

**建议解决方案**：
1. 重启开发环境（推荐）
2. 手动删除 `release` 目录后重新构建
3. 使用任务管理器结束所有 electron/node 进程

### 构建验证命令

```powershell
# 1. 结束所有相关进程
Get-Process -Name electron* | Stop-Process -Force
Get-Process -Name node | Stop-Process -Force

# 2. 删除旧构建产物
Remove-Item release -Recurse -Force

# 3. 重新构建
npm run dist:win
```

---

## 排障建议

### 白屏问题通用排障流程

```
┌─────────────────────────────────────────────────────────────┐
│                    白屏问题排障流程                         │
├─────────────────────────────────────────────────────────────┤
│  1. 检查 console 错误                                     │
│     - 打开 DevTools: Ctrl+Shift+I                         │
│     - 查看 Console 面板报错                                │
│                                                           │
│  2. 检查资源加载                                           │
│     - 打开 Network 面板                                    │
│     - 确认 index.html / JS / CSS 是否成功加载              │
│                                                           │
│  3. 检查路径配置                                           │
│     - 确认 package.json files 包含 dist/**/*              │
│     - 确认主进程 loadFile 路径正确                         │
│                                                           │
│  4. 验证 asar 内容                                         │
│     - 检查 app.asar 是否包含 dist/ 目录                    │
└─────────────────────────────────────────────────────────────┘
```

### 开发环境验证

在开发模式下运行验证修复是否有效：

```powershell
# 开发模式运行（使用 Vite dev server）
npm run dev

# 确认页面正常显示后再打包
npm run dist:win
```

---

## 总结

| 项目 | 状态 | 说明 |
|------|------|------|
| 问题根因 | ✅ 已定位 | electron-builder files 配置缺失 `dist/**/*` |
| 代码修复 | ✅ 已完成 | package.json 已更新 |
| 完整构建 | ⚠️ 待解决 | 文件锁定问题需重启环境 |
| 预期效果 | ✅ 明确 | 修复后 exe 应能正常加载前端页面 |

---

**最后更新**：2026-06-15
