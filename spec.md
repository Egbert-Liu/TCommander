# TCommander 卡片终端化改造规格文档

## 1. 背景与目标

### 1.1 用户需求

| # | 需求 | 核心诉求 |
|---|------|---------|
| 1 | 卡片预览改为实时 xterm 终端 | 卡片就是终端，随时可输入；双击进全屏只是样式变化，不重建实例 |
| 2 | 全屏底部终端列表优化 | 支持滚动、排序（参照卡片逻辑）、hover 预览终端内容 |
| 3 | 修复卡片抖动 | 多卡片持续输出时频繁换位 |
| 4 | 样式优化 | 整体视觉提升 |

### 1.2 当前架构关键事实（来自调研）

1. **卡片预览**：用 `previewText` + `ansiToHtml` 渲染 HTML，不是实时终端
2. **全屏终端**：每次切换 `activeSessionId` 都 `dispose()` 旧 xterm + `new Terminal()` 重建 + replay history
3. **终端实例**：不存在实例池，`FullscreenTerminal.tsx` 用单一 `useRef` 持有当前实例
4. **状态检测**：依赖 `session.history`（原始 PTY 流），**不依赖 previewText**，`flushSession` 每 16ms 节流更新
5. **PTY 输出**：主进程 `ptyManager.onOutput` → IPC `session-output` → preload 分发到所有订阅者
6. **卡片抖动根因**：两个持续输出的 `running` 会话，`lastActivityAt` 每 16ms 交替领先导致互相换位。设计文档提出的 `stableActivityAt` 防抖方案**从未落地**

### 1.3 与之前被拒绝方案的区别

项目记忆记录了之前被拒绝的尝试：
- ❌ 卡片用 mini xterm 实例 → 卡片变窄、显示性能差
- ❌ 全屏终端实例池 → 内容展示延迟
- ❌ 200ms 节流 → 渲染慢

**本次方案的关键区别**：

| 之前的问题 | 本次解决方案 |
|-----------|-------------|
| 卡片变窄 | CSS Grid `minmax(500px, 1fr)` 保证最小宽度（已落地） |
| 内容展示延迟 | PTY 输出**直接 write 到 xterm**（0 延迟），不走节流中转；`flushSession` 降频仅用于状态检测 |
| 实例池延迟 | 池统一订阅一次 `onSessionOutput`，**实时分发**到实例 buffer；可见才渲染 |
| 200ms 节流 | 卡片 xterm 无节流（直连 PTY）；状态检测从 16ms 降到 ~100ms（不再阻塞预览） |

---

## 2. 新架构设计

### 2.1 核心思想：一会话一实例 + DOM 转移

```
┌──────────────── TerminalPool (单例) ──────────────────┐
│  Map<sessionId, TerminalInstance>                       │
│  ┌──────────────────────────────────────────────────┐  │
│  │ TerminalInstance {                                 │  │
│  │   terminal: Terminal       (xterm 实例)            │  │
│  │   fitAddon: FitAddon                              │  │
│  │   containerDiv: HTMLDivElement (终端 DOM 根)       │  │
│  │   attachedTo: 'card' | 'fullscreen' | null        │  │
│  │ }                                                  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  统一订阅 onSessionOutput → 按 sessionId 分发 write     │
│  统一订阅 onSessionExit   → 标记状态                    │
│  attach(sessionId, parentDom, mode) → DOM 转移 + fit   │
│  detach(sessionId) → 从当前 parent 移除                 │
└─────────────────────────────────────────────────────────┘
        ↑                           ↑
    卡片可见时 attach            全屏时 attach
    到卡片预览容器               到全屏终端容器
```

**DOM 转移机制**：
- `terminal.open(containerDiv)` 在 `containerDiv` 内创建 `.xterm` 元素
- `parentDom.appendChild(containerDiv)` 将容器挂到目标位置（浏览器自动从旧 parent 移除）
- 转移后调 `fitAddon.fit()` 适配新尺寸 + `resizeSession()` 同步 PTY

### 2.2 数据流（新）

```
PTY 输出 (IPC session-output)
   │
   ├──> TerminalPool.write(sessionId, data)  ← 直接 write 到 xterm buffer（0 延迟）
   │         │
   │         └──> terminal.write(data) → xterm 实时渲染（可见时）
   │
   └──> batchQueueRef → flushSession (节流 ~100ms)
            │
            ├──> session.history (保留，用于状态检测)
            ├──> detectStatusWithRules → session.status
            └──> session.previewText (保留，用于 Tooltip/底部列表预览)
```

**关键变化**：
- 卡片预览不再依赖 `previewText`，而是 xterm 实例直接渲染
- `previewText` 保留但降级为 Tooltip/底部列表的预览数据源
- `flushSession` 频率从 16ms 降到 ~100ms（不再阻塞预览渲染，只做状态检测）
- 用户输入：卡片 xterm `onData` → `sendInput` → PTY（与全屏一致）

### 2.3 可见性优化

N 个 xterm 实例同时渲染会消耗大量 CPU。用 `IntersectionObserver` 管理：

```
卡片可见  → attach(containerDiv) → xterm 渲染
卡片不可见 → detach → xterm buffer 保留内容但不渲染（CPU ≈ 0）
卡片重新可见 → reattach + refresh(0, rows-1) → 恢复显示
```

**不可见时 buffer 仍接收 write**（由池统一分发），所以重新可见时内容是最新的，不需要 replay。

---

## 3. 详细方案

### 3.1 需求1：卡片预览改为实时 xterm 终端

#### 3.1.1 新增 TerminalPool 模块

**文件**：`src/renderer/src/utils/terminalPool.ts`（新建）

```typescript
interface TerminalInstance {
  terminal: Terminal
  fitAddon: FitAddon
  containerDiv: HTMLDivElement
  attachedTo: 'card' | 'fullscreen' | null
  currentParent: HTMLElement | null
}

class TerminalPool {
  private instances: Map<string, TerminalInstance> = new Map()
  private unsubOutput: (() => void) | null = null
  private unsubExit: (() => void) | null = null

  // 初始化：订阅 PTY 输出，按 sessionId 分发
  init(): void

  // 创建实例（会话创建时调用）
  create(sessionId: string, theme: TerminalTheme): void

  // 销毁实例（会话删除时调用）
  destroy(sessionId: string): void

  // 挂载到指定父节点（卡片或全屏）
  attach(sessionId: string, parent: HTMLElement, mode: 'card' | 'fullscreen'): void

  // 从当前父节点卸载
  detach(sessionId: string): void

  // 写入数据（池内部调用，由 onSessionOutput 分发）
  write(sessionId: string, data: string): void

  // 获取实例（用于读取 buffer、resize 等）
  get(sessionId: string): TerminalInstance | undefined

  // 主题热更新
  setTheme(theme: TerminalTheme): void

  // 清理所有实例
  dispose(): void
}
```

**关键实现要点**：
- `init()` 中订阅一次 `onSessionOutput`，回调内按 `sessionId` 查找实例并 `terminal.write(data)`
- `create()` 创建 Terminal（scrollback: 10000, convertEol: true），`containerDiv` 是独立 div 不在 React 树中
- `attach()` 用 `parent.appendChild(instance.containerDiv)` 实现 DOM 转移，然后 `fitAddon.fit()` + `resizeSession()`
- `detach()` 不 dispose 实例，只是 `containerDiv.remove()`（从 DOM 移除），buffer 保留
- 卡片模式 `attach` 时设置小字体（fontSize: 10），全屏模式设置大字体（fontSize: 13）
  - 通过 `terminal.options.fontSize = N` + `terminal.refresh(0, rows-1)` + `fit()` 实现

#### 3.1.2 SessionCard 改造

**文件**：`src/renderer/src/components/SessionCard.tsx`

**移除**：
- `preview` / `previewHtml` useMemo（不再用 ansiToHtml）
- 预览区 `<pre dangerouslySetInnerHTML>` 渲染

**新增**：
- 预览区改为 `<div ref={previewRef}>`，挂载时从 TerminalPool attach xterm 实例
- `useEffect` 中：`pool.attach(session.id, previewRef.current, 'card')`，卸载时 `pool.detach(session.id)`
- 用 `IntersectionObserver` 监测可见性：不可见时 `detach`，可见时 `attach`
- xterm `onData` → `sendInput(session.id, data)`（卡片内直接输入）
- 双击仍触发 `handleFullscreen`（但不再重建实例，只是 DOM 转移到全屏）

**预览区样式**：
- 容器高度按 `previewLineCount` 自适应（与当前一致）
- 字体 10px、行高 1.3
- `overflow: hidden`（xterm 自身管理滚动）
- 背景跟随终端主题

#### 3.1.3 FullscreenTerminal 改造

**文件**：`src/renderer/src/components/FullscreenTerminal.tsx`

**移除**：
- `initTerminal` 中的 `new Terminal()` + `terminal.open()` 逻辑
- `selectReplayContent` 回放逻辑（不再需要，实例已有完整 buffer）
- cleanup 中的 `terminal.dispose()`（不再销毁实例）

**改为**：
- `useEffect([activeSessionId])` 中：`pool.attach(activeSessionId, termRef.current, 'fullscreen')`
- cleanup 中：`pool.detach(activeSessionId)`（实例回到池中，不 dispose）
- PTY 输出由池统一分发，FullscreenTerminal 不再单独 `onSessionOutput` 订阅
- `resizePtyToXterm` 从池获取实例的 cols/rows
- 主题热更新改为 `pool.setTheme(theme)`（批量更新所有实例）

#### 3.1.4 App.tsx 改造

- `useEffect` 初始化时 `pool.init()`
- `flushSession` 降频：`FLUSH_INTERVAL` 从 16ms 改为 100ms（仅用于状态检测，不阻塞预览）
- `flushSession` 仍更新 `previewText`（用于 Tooltip/底部列表预览）和 `session.history`（用于状态检测）
- 进入全屏时不再需要强制 flush（xterm 实例已有实时数据）
- `handleExit` 仍做最终 flush

#### 3.1.5 状态检测兼容

**保留 `session.history` + `flushSession` + `detectStatusWithRules`，零改动状态检测逻辑。**

理由（来自调研）：
- 状态检测依赖 `session.history`（原始 PTY 流），不依赖 `previewText`
- `cleanTerminalOutputKeepColor` 是 2D 屏幕缓冲模拟器，与 xterm 内部模型等价
- 从 xterm buffer 读取纯文本会丢失 ANSI 上下文，且实现复杂
- 保留 history 成本低（每会话最多 512KB），换来状态检测零风险

### 3.2 需求2：全屏底部终端列表优化

**文件**：`src/renderer/src/components/FullscreenTerminal.tsx`（底部列表部分）

#### 3.2.1 排序

当前 `otherSessions` 直接复用 store 原始顺序。改为复用主视图排序逻辑：

```typescript
const otherSessions = useMemo(() => {
  return sessions
    .filter(s => s.id !== activeSessionId)
    .sort((a, b) => {
      // 复用 App.tsx filteredSessions 的排序逻辑
      const aHas = hasStatus(a.status)
      const bHas = hasStatus(b.status)
      if (aHas && bHas) {
        const diff = statusPriority(a.status) - statusPriority(b.status)
        if (diff !== 0) return diff
      }
      if (aHas !== bHas) return aHas ? -1 : 1
      if (a.lastActivityAt !== b.lastActivityAt) return b.lastActivityAt - a.lastActivityAt
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt
      return a.id.localeCompare(b.id)
    })
}, [sessions, activeSessionId])
```

提取排序逻辑为公共函数 `sortSessions(sessions)` 放在 `utils/sessionSort.ts`，App.tsx 和 FullscreenTerminal 共用。

#### 3.2.2 滚动

当前已有横向滚动（`overflowX: 'auto'` + `hide-scrollbar`）。增强：
- 当会话数 > 12 时，横向滚动保持
- 每个胶囊最小宽度 80px，`flexShrink: 0`
- 增加滚动渐变遮罩（左右边缘淡出）

#### 3.2.3 hover 预览

当前 Tooltip 取 `previewText.split('\n').slice(-2)`（仅 2 行）。改进：
- 取尾部 6 行（与卡片 previewLineCount 对齐，但 Tooltip 内更紧凑）
- 用 `ansiToHtml` 渲染带颜色的预览（复用现有逻辑）
- Tooltip 最大宽度 400px，`whiteSpace: pre-wrap`
- 添加状态色边框（左侧 3px 竖条，颜色取 `STATUS_COLORS[status].color`）

#### 3.2.4 样式优化

- 胶囊高度从 24px 增加到 28px
- 字体从 11px 增加到 12px
- 名称截断从 8 字符增加到 12 字符
- 当前激活的会话（已在全屏）在列表中不显示
- 底部增加"共 N 个会话"提示（已有，保留）

### 3.3 需求3：修复卡片抖动

#### 3.3.1 根因

两个 `running` 会话 A 和 B 持续输出：
- t1: A flush → `lastActivityAt_A = t1` → A 排前
- t2 (t1+16ms): B flush → `lastActivityAt_B = t2 > t1` → B 排前
- t3 (t2+16ms): A flush → `lastActivityAt_A = t3 > t2` → A 排前
- ...无限循环，卡片每 16ms 互换位置

#### 3.3.2 方案：引入 stableActivityAt

**`types.ts` 新增字段**：
```typescript
export interface Session {
  // ... 已有字段 ...
  /** 稳定活动时间：仅在状态转换时更新，用于排序防抖 */
  stableActivityAt: number
}
```

**`store/index.ts` 初始化**：
- `addSession` 时 `stableActivityAt = Date.now()`

**`flushSession` 更新逻辑**：
```typescript
// 命中规则（状态变化）：更新 stableActivityAt
if (detectResult.matched && detectResult.status !== session.status) {
  state.updateSession(sessionId, {
    // ...其他字段...
    stableActivityAt: Date.now()
  })
}
// 未命中但之前有状态（状态清除 running）：更新 stableActivityAt
else if (!detectResult.matched && hasStatus(session.status)) {
  state.updateSession(sessionId, {
    // ...其他字段...
    stableActivityAt: Date.now()
  })
}
// 其他情况（持续 running / 持续 idle）：不更新 stableActivityAt
```

**空闲检测定时器**：
```typescript
// running → idle 时更新 stableActivityAt
if (session.status === 'running' && idle) {
  updateSession(id, { status: 'idle', stableActivityAt: Date.now() })
}
```

**排序逻辑改为**：
```typescript
// 无状态组（running/idle）：按 stableActivityAt 倒序（不随输出频繁变化）
if (a.lastActivityAt !== b.lastActivityAt) return b.stableActivityAt - a.stableActivityAt
```

**效果**：
- 两个持续 `running` 的会话：`stableActivityAt` 都不更新，排序位置固定，不再抖动
- 状态转换（running→error, error→running, running→idle）时才重排
- 有状态会话仍按 `statusPriority` 排序，不受影响

#### 3.3.3 提取公共排序函数

**文件**：`src/renderer/src/utils/sessionSort.ts`（新建）

```typescript
export function sortSessions(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => {
    const aHas = hasStatus(a.status)
    const bHas = hasStatus(b.status)
    if (aHas && bHas) {
      const diff = statusPriority(a.status) - statusPriority(b.status)
      if (diff !== 0) return diff
    }
    if (aHas !== bHas) return aHas ? -1 : 1
    // 防抖关键：用 stableActivityAt 代替 lastActivityAt
    if (a.stableActivityAt !== b.stableActivityAt) {
      return b.stableActivityAt - a.stableActivityAt
    }
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt
    return a.id.localeCompare(b.id)
  })
}
```

`App.tsx` 和 `FullscreenTerminal.tsx` 都调用此函数。

### 3.4 需求4：样式优化

#### 3.4.1 卡片样式
- 卡片圆角从 10px 调整为 12px
- 卡片阴影统一（`box-shadow: 0 1px 3px rgba(0,0,0,0.08)`）
- 状态色左边框：有状态时左边 3px 竖条（`border-left: 3px solid statusColor`）
- 预览区与头部、底部的过渡更自然

#### 3.4.2 全屏终端样式
- 顶部栏高度从 44px 调整为 48px
- 底部终端列表高度从 40px 调整为 48px
- 底部列表胶囊样式优化（圆角、间距、hover 效果）

#### 3.4.3 空状态
- 空状态图标和文字间距优化
- 快速创建菜单样式与卡片风格统一

---

## 4. 风险与缓解

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| N 个 xterm 实例内存高 | 中 | scrollback 降到 5000；不可见时 detach（不渲染）；实例上限 30 个 |
| DOM 转移后 xterm 渲染异常 | 中 | 转移后调 `fit()` + `refresh(0, rows-1)`；若失败回退到 dispose+recreate |
| 卡片 xterm 与全屏 xterm 字体/尺寸差异导致 PTY resize 频繁 | 低 | 切换模式时才 resize，切换后 150ms 防抖 |
| 状态检测延迟（100ms 节流） | 低 | 状态检测不阻塞预览；用户感知延迟 < 100ms 可接受 |
| IntersectionObserver 兼容性 | 极低 | Electron 29 内置 Chromium 122，完全支持 |
| 首次加载 N 个实例慢 | 中 | 实例懒创建：会话创建时才创建实例，非一次性创建全部 |

---

## 5. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/renderer/src/utils/terminalPool.ts` | 新建 | 终端实例池 |
| `src/renderer/src/utils/sessionSort.ts` | 新建 | 公共排序函数（含 stableActivityAt 防抖） |
| `src/renderer/src/components/SessionCard.tsx` | 修改 | 预览区改为 xterm 实例挂载 |
| `src/renderer/src/components/FullscreenTerminal.tsx` | 修改 | 从池获取实例；底部列表排序+样式+hover预览 |
| `src/renderer/src/App.tsx` | 修改 | 初始化池；flushSession 降频；排序改用 sessionSort |
| `src/renderer/src/store/index.ts` | 修改 | Session 增加 stableActivityAt |
| `src/renderer/src/types.ts` | 修改 | Session 接口增加 stableActivityAt |
| `src/renderer/src/utils/sessionActions.ts` | 修改 | 创建会话时初始化 stableActivityAt + 通知池创建实例 |

---

## 6. 验证计划

1. 创建 5 个会话，持续输出，观察卡片不抖动
2. 卡片内直接输入命令，验证可交互
3. 双击卡片进入全屏，验证无闪烁、内容连续
4. 全屏底部列表排序正确、hover 预览显示
5. Ctrl+Alt+左右切换终端，验证快速切换无闪烁
6. 退出全屏，验证卡片恢复显示
7. 删除会话，验证实例正确销毁
8. 20 个会话压力测试，验证内存和 CPU 可控
