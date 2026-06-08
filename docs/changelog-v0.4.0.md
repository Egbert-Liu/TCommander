# CLI Manager v0.4.0 演进文档

## 一、概述

本版本集中解决了终端会话管理的核心体验问题，包括：
- 卡片与全屏终端的实时同步
- 状态智能检测与告警
- 窗口关闭时的资源清理
- 快照恢复的完整性

---

## 二、核心架构重构

### 2.1 全局 History 管理器

**问题**：SessionCard 挂载 IPC 监听器，但进入全屏时卡片卸载，导致输出丢失。

**解决方案**：将全局 listener 移至 `App.tsx`（永不卸载），采用 debounce 批量处理模式。

**文件变更**：[src/renderer/src/App.tsx](file:///d:/vibe_code/cli_manager/src/renderer/src/App.tsx)

```typescript
// 核心设计：80ms → 30ms debounce
batchTimerRef.current[sessionId] = setTimeout(() => {
  flushSession(sessionId)
}, 30)
```

**数据流**：
```
PTY Output → batchQueue → debounce(30ms) → flushSession
                                              ├── history[] 更新
                                              ├── previewText 预计算
                                              └── status 智能检测
```

### 2.2 虚拟光标引擎

**问题**：`\r\n` 序列处理不当导致命令行错乱（进度条覆盖变成多行）。

**解决方案**：字符级虚拟光标模拟终端行为。

**文件变更**：[src/renderer/src/utils/statusDetector.ts](file:///d:/vibe_code/cli_manager/src/renderer/src/utils/statusDetector.ts)

```typescript
// cleanTerminalOutput 核心逻辑
while (i < withoutAnsi.length) {
  if (ch === '\r') { cursorCol = 0 }     // 回到行首（覆盖模式）
  else if (ch === '\n') { ... }          // 换行（提交当前行）
  else { 在 cursorCol 位置写入字符 }       // 支持行内覆盖
}
```

**效果**：`"Loading...\rDone!\n"` 正确输出为 `Done!` 而非两行。

---

## 三、功能修复清单

### 3.1 会话状态智能检测

| 状态 | 触发条件 | 优先级 | 视觉提示 |
|------|---------|--------|---------|
| `error` | 输出包含 error/Error/ERROR | 0（最高） | 红色脉冲边框 |
| `needs-confirm` | 包含确认模式（`❯ 1. Yes`、`[y/n]`、`Do you want to?`） | 1 | 黄色脉冲边框 |
| `needs-input` | 以 `?` 或 `:` 结尾的行 | 2 | 蓝色脉冲边框 |
| `running` | 输出中无提示符 | 3 | 无特效 |
| `idle` | 检测到 `$`、`>`、`#` 提示符 | 4（最低） | 无特效 |

**文件变更**：
- [src/renderer/src/utils/statusDetector.ts](file:///d:/vibe_code/cli_manager/src/renderer/src/utils/statusDetector.ts) — 检测逻辑
- [src/renderer/src/App.tsx](file:///d:/vibe_code/cli_manager/src/renderer/src/App.tsx) — 状态优先排序

### 3.2 卡片优先级自动排序

**问题**：需要人工查找告警状态的会话。

**解决方案**：按状态优先级自动排序，告警卡片置顶。

**排序规则**：`error(0) > needs-confirm(1) > needs-input(2) > running(3) > idle(4)`

### 3.3 窗口关闭资源清理

**问题**：关闭应用时出现 `TypeError: Object has been destroyed`。

**解决方案**：三层防御机制。

**第一层** — Session 级别：
- `destroyed` 标志位
- 所有回调入口检查 `destroyed || disposed`
- 操作 PTY 前先检查状态

**第二层** — 窗口级别：
- `isWindowValid()` 三重检查
- IPC send 包裹 try-catch

**第三层** — 退出时序：
```
before-quit → ptyManager.dispose()
                ├── disposed = true
                ├── outputListeners = []  ← 清空回调，阻止后续事件
                ├── exitListeners = []
                └── kill 所有 PTY
```

**文件变更**：
- [src/main/pty.ts](file:///d:/vibe_code/cli_manager/src/main/pty.ts)
- [src/main/index.ts](file:///d:/vibe_code/cli_manager/src/main/index.ts)

### 3.4 快照恢复完整性

**问题**：快照恢复只恢复命令行类型，丢失工作目录和初始命令。

**解决方案**：
1. 快照保存时包含 `cwd` 和 `initialCommand`
2. 恢复时传递完整配置给 PTY

**文件变更**：
- [src/renderer/src/components/Toolbar.tsx](file:///d:/vibe_code/cli_manager/src/renderer/src/components/Toolbar.tsx) — 快照保存
- [src/renderer/src/components/SnapshotsDialog.tsx](file:///d:/vibe_code/cli_manager/src/renderer/src/components/SnapshotsDialog.tsx) — 快照恢复

### 3.5 PTY 初始命令优化

**问题**：首次命令执行慢（前端 setTimeout 500ms）。

**解决方案**：后端智能发送，首次 shell 输出到达后立即发送，2秒超时兜底。

**文件变更**：[src/main/pty.ts](file:///d:/vibe_code/cli_manager/src/main/pty.ts)

### 3.6 卡片预览性能优化

**问题**：每个卡片独立计算 `cleanTerminalOutput`，N 个卡片 N 倍开销。

**解决方案**：`previewText` 预计算模式。

```
全局 listener 计算一次 → session.previewText → 卡片直接读取
```

**文件变更**：
- [src/renderer/src/types.ts](file:///d:/vibe_code/cli_manager/src/renderer/src/types.ts) — 新增 `previewText` 字段
- [src/renderer/src/components/SessionCard.tsx](file:///d:/vibe_code/cli_manager/src/renderer/src/components/SessionCard.tsx) — 只读模式

---

## 四、视觉特效增强

### 4.1 状态脉冲动画

**CSS 动画定义**：[src/renderer/src/index.css](file:///d:/vibe_code/cli_manager/src/renderer/src/index.css)

| 状态 | 动画名称 | 颜色 | 周期 |
|------|---------|------|------|
| error | `pulse-error` | 红色 #f87171 | 2s |
| needs-confirm | `pulse-confirm` | 黄色 #fbbf24 | 2s |
| needs-input | `pulse-input` | 蓝色 #38bdf8 | 2s |

**交互优化**：鼠标悬停时暂停动画（`animationPlayState: paused`），避免干扰操作。

### 4.2 状态标签增强

- 告警状态标签加大加粗（9px→10px, weight 400→600）
- 增加同色描边提升可见性

---

## 五、数据持久化

### 5.1 自动持久化机制

**问题**：分组/预设配置未自动保存。

**解决方案**：Store 层面所有 CRUD 操作自动调用 `storageSet`。

**文件变更**：[src/renderer/src/store/index.ts](file:///d:/vibe_code/cli_manager/src/renderer/src/store/index.ts)

### 5.2 启动时加载

```typescript
useEffect(() => {
  const presets = storage.get('presets') || []
  const groups = storage.get('groups') || []
  const snapshots = storage.get('snapshots') || []
  const darkMode = storage.get('darkMode') || false
  
  store.setPresets(presets)
  store.setGroups(groups)
  store.setSnapshots(snapshots)
  store.setDarkMode(darkMode)
}, [])
```

---

## 六、文件变更清单

| 文件 | 变更类型 | 核心改动 |
|------|---------|---------|
| `src/renderer/src/App.tsx` | 重构 | 全局 listener + debounce + 状态排序 |
| `src/renderer/src/types.ts` | 新增字段 | `previewText: string` |
| `src/renderer/src/store/index.ts` | 增强 | 自动持久化 + 加载逻辑 |
| `src/renderer/src/utils/statusDetector.ts` | 重构 | 虚拟光标引擎 + 状态检测 |
| `src/renderer/src/components/SessionCard.tsx` | 优化 | 只读模式 + 脉冲动画 |
| `src/renderer/src/components/SnapshotsDialog.tsx` | 新增 | 快照恢复功能 |
| `src/renderer/src/index.css` | 新增 | 状态脉冲动画定义 |
| `src/main/pty.ts` | 重构 | 三层防御清理机制 |
| `src/main/index.ts` | 增强 | 窗口销毁检查 + try-catch |

---

## 七、关键技术点总结

### 7.1 IPC 事件订阅模式

采用回调数组 + 取消订阅函数，避免 `removeAllListeners` 的交叉干扰问题。

```typescript
// preload/index.ts
onSessionOutput: (callback) => {
  outputCallbacks.push(callback)
  return () => { outputCallbacks = outputCallbacks.filter(cb => cb !== callback) }
}
```

### 7.2 Zustand 状态管理规范

- 使用 `useAppStore((s) => s.xxx)` selector 模式
- 计算值用 `useMemo` 而非 Zustand getters
- 避免直接修改 state，使用 `updateSession` 等 action

### 7.3 性能优化策略

| 优化点 | 原方案 | 优化后 | 收益 |
|--------|-------|--------|------|
| 输出更新频率 | 每字符一次 | 30ms debounce | 减少 90%+ 渲染次数 |
| preview 计算 | 每卡片独立计算 | 全局预计算 | O(N)→O(1) |
| 状态检测 | 同步检测 | debounce 批次检测 | 减少重复计算 |

---

## 八、待办事项

| 优先级 | 事项 | 说明 |
|--------|------|------|
| 高 | 多窗口支持 | 当前只支持单窗口 |
| 中 | 快捷键支持 | Ctrl+T 新建、Ctrl+W 关闭等 |
| 低 | 主题定制 | 支持自定义终端主题 |
