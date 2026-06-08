# CLI Manager 开发演进日志

## v0.3.0 - 2026-06-06

### 问题修复

#### 1. 侧边栏折叠图标居中 + Tooltip 稳定性

**问题现象**：折叠后图标偏右，Tooltip 时有时无

**根因分析**：
- Ant Design 的 `Menu` 组件在 `inlineCollapsed` 模式下，内部会添加 padding-left，导致图标无法精确居中
- Tooltip 包在 Menu 的 `icon` prop 内部时，与 Ant Design 自带的 collapsed tooltip 冲突，导致时有时无

**解决方案**：
- 完全弃用 Ant Design `Menu` 组件，改用自定义按钮渲染
- 折叠态：每个菜单项用 `<button>` + `<Tooltip>` 包裹，`justify-center` 确保居中
- 展开态：正常显示文本，支持双击编辑分组名称
- 文件：`src/renderer/src/components/Sidebar.tsx`（完全重写）

---

#### 2. 预设持久化（重启不丢失）

**问题现象**：重启应用后预设和分组数据丢失

**根因分析**：
- 应用启动时只初始化了空数组，没有从 `electron-store` 读取已保存的数据
- 没有在数据变更时自动持久化

**解决方案**：
- `App.tsx` 新增 `loadPersistedData` effect，启动时从 `electron-store` 加载 `presets`、`groups`、`snapshots`、`darkMode`
- Store 新增 `setPresets`、`setGroups`、`setSnapshots`、`setDarkMode` 方法
- `toggleDarkMode` 中同步写入 `electron-store`
- 文件：`src/renderer/src/App.tsx`、`src/renderer/src/store/index.ts`

---

#### 3. 全屏终端内容重复 + 样式混乱

**问题现象**：进入全屏后终端内容重复显示，布局混乱

**根因分析（深度分析）**：
1. **IPC 事件监听器冲突**：`SessionCard` 和 `FullscreenTerminal` 都调用 `window.electronAPI.onSessionOutput`，但 `removeAllListeners` 会清除所有组件的监听器，导致互相干扰
2. **FitAddon 时序问题**：`fit()` 在 DOM 未完成渲染时调用，导致终端尺寸计算错误
3. **@xterm/addon-clipboard 兼容性问题**：该插件在某些环境下可能加载失败

**解决方案**：
- **彻底重构 IPC 订阅模型**（`src/preload/index.ts`）：
  - 改为回调数组模式（`outputCallbacks` / `exitCallbacks`）
  - `onSessionOutput` / `onSessionExit` 返回取消订阅函数 `() => void`
  - 不再有 `removeAllListeners`，每个组件独立管理自己的监听器
- **类型声明更新**（`src/renderer/src/vite-env.d.ts`）：移除 `removeAllListeners`，返回类型改为 `() => void`
- **FitAddon 时序修复**：使用 `requestAnimationFrame` 确保 DOM 渲染后再调用 `fit()`
- **移除 ClipboardAddon**：改用原生 `contextmenu` 事件 + `navigator.clipboard` API
- **全屏终端样式优化**：GitHub 风格 16 色 ANSI 主题，`scrollback: 10000`，`lineHeight: 1.25`
- 文件：`src/preload/index.ts`、`src/renderer/src/components/FullscreenTerminal.tsx`、`src/renderer/src/components/SessionCard.tsx`

---

#### 4. 预设管理弹窗溢出

**问题现象**：预设管理表格操作列溢出，编辑/删除按钮显示不完整

**解决方案**：
- 操作列宽度从 120px 缩小为 72px
- 移除按钮文字（"编辑"/"删除"），只保留图标
- 文件：`src/renderer/src/components/PresetsDialog.tsx`

---

#### 5. 快照保存 + 恢复功能

**问题现象**：保存快照无反馈，缺少恢复入口

**解决方案**：
- 保存快照后添加 `message.success('快照已保存')` 反馈
- 设置菜单新增"从快照恢复"选项
- 新建 `SnapshotsDialog` 组件：
  - 列表显示所有已保存快照（名称、会话数、分组数）
  - "恢复"按钮：恢复分组 + 为每个会话创建新的 PTY 进程
  - "删除"按钮：删除快照并持久化
- 文件：`src/renderer/src/components/SnapshotsDialog.tsx`（新建）、`src/renderer/src/components/Toolbar.tsx`、`src/renderer/src/App.tsx`

---

### 状态检测逻辑说明

#### 检测流程

```
终端输出 → stripAnsi 清理 → 取最后 4 行 → 按优先级检测
```

#### 优先级（从高到低）

| 优先级 | 状态 | 检测规则 |
|--------|------|----------|
| 1 | `error` | 输出中包含 `error`/`Error`/`ERROR` |
| 2 | `needs-confirm` | 最后 4 行匹配确认模式（见下表） |
| 3 | `needs-input` | 最后一行以 `?` 或 `:` 结尾 |
| 4 | `idle` | 输出中包含 `$`、`>` 或 `#` 提示符 |
| 5 | `running` | 默认状态 |

#### 确认模式（needs-confirm）检测规则

| # | 模式 | 正则表达式 | 示例 |
|---|------|-----------|------|
| 1 | 基本 Y/N 选项 | `/\[y\/n\]/i`、`/\(y\/n\)/i` | `[Y/n]`、`(y/N)` |
| 2 | Yes/No 选项 | `/\[yes\/no\]/i`、`/\(yes\/no\)/i` | `[yes/no]` |
| 3 | 多选项 | `/\(y\/n\/[a-z]\)/i` | `(Y/n/N)` |
| 4 | Yes/No 文本选项 | `/\byes\b.*\b(no|exit)\b/i` | `Yes, I trust this folder. / No, exit` |
| 5 | 疑问句式 | `/do you want to/i`、`/are you sure/i`、`/would you like/i` | `Do you want to continue?` |
| 6 | confirm + 选项组合 | `confirm` + `[y/n]` 同时出现 | `Please confirm [Y/n]` |
| 7 | Press Y/N | `/press\s+[yYnN]\s+to/i` | `Press Y to continue` |
| 8 | trust folder | `/\btrust\b.*\bfolder\b/i` | `Do you trust the authors of this folder?` |
| 9 | accept/reject | `/\b(accept|reject)\b/i` | `accept or reject` |
| 10 | 问号 + 选项 | `/\?\s*\[y\/n\]/i` 等 | `Continue? [Y/n]` |

#### 已知限制

1. **error 检测过于宽泛**：输出中任何位置的 `error` 都会触发，可能误判（如包含 `error` 的文件路径）
2. **idle 检测不够精确**：`$`/`>`/`#` 可能出现在非提示符上下文中
3. **needs-input 检测较粗糙**：仅检查最后一行是否以 `?` 或 `:` 结尾
4. **多语言支持不足**：当前仅支持英文提示的检测

#### 未来优化方向

- 增加 error 检测的上下文判断（仅检查最后几行）
- 支持中文提示检测（"确认"、"是否" 等）
- 添加自定义规则配置
- 使用正则权重评分而非单一匹配

---

### 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/renderer/src/components/Sidebar.tsx` | 重写 | 弃用 Menu，自定义按钮+Tooltip |
| `src/renderer/src/components/FullscreenTerminal.tsx` | 重写 | 修复重复、优化样式、右键复制 |
| `src/renderer/src/components/SessionCard.tsx` | 修改 | 取消订阅模式 |
| `src/renderer/src/components/Toolbar.tsx` | 修改 | 新增快照恢复入口、模式切换 |
| `src/renderer/src/components/PresetsDialog.tsx` | 修改 | 操作列只保留图标 |
| `src/renderer/src/components/SnapshotsDialog.tsx` | 新建 | 快照恢复对话框 |
| `src/renderer/src/App.tsx` | 修改 | 持久化加载、SnapshotsDialog |
| `src/renderer/src/store/index.ts` | 修改 | 新增 setter 方法 |
| `src/renderer/src/vite-env.d.ts` | 修改 | IPC 类型声明更新 |
| `src/preload/index.ts` | 重写 | 回调数组模式替代 removeAllListeners |
