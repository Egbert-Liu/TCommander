# TCommander 终端体验优化方案

## 一、现状问题分析

### 1. 卡片预览渲染 (SessionCard.tsx)

**当前实现：**
- 使用 `cleanTerminalOutputKeepColor` 函数（约 250 行代码）在 JavaScript 中模拟 2D 终端屏幕缓冲
- 通过 `ansiToHtml` 将 ANSI 转义序列转换为 HTML `<span>` 标签
- 使用 `dangerouslySetInnerHTML` 注入到 `<pre>` 标签中

**性能瓶颈：**
1. **全量重算**：每次 PTY 输出都触发 `cleanTerminalOutputKeepColor` 对尾部 16KB 数据重新计算
2. **DOM 重建**：每次 `previewText` 变化 → `split` → `slice` → `ansiToHtml` → `dangerouslySetInnerHTML` → 浏览器重新解析 HTML → 重新构建 DOM
3. **无虚拟滚动**：所有预览行都渲染为 DOM 节点
4. **无增量更新**：即使只新增一行，整个预览区也完全重绘
5. **2D 屏幕缓冲模拟**：虽然功能正确，但每次 flush 都对尾部 16KB 数据全量重算

**交互体验问题：**
1. 预览区不可交互：只能看，不能选中复制（虽然 `pointerEvents` 已开放，但 `overflowY:hidden` 导致无法纵向滚动查看历史）
2. 双击进入全屏过于隐蔽：用户难以发现
3. 卡片预览与全屏终端视觉割裂：预览是 HTML，全屏是 xterm.js，字体渲染、行高、间距不完全一致
4. 没有光标闪烁、没有输入回显：预览区是"死的"，不像真实终端

**数据流问题：**
1. 每次 PTY 输出 → rAF 批处理 → `cleanTerminalOutputKeepColor(16KB)` → `updateSession(previewText)` → React re-render → `ansiToHtml` → DOM，链路长
2. `previewText` 存在 Zustand store 中，每次更新触发所有订阅者重渲染（虽然 SessionCard 用了 memo，但 `previewText` 变化频繁）
3. `history` 数组最大 2MB/2000 行，每次 flush 都 join + 截取 + 重算

### 2. 全屏终端 (FullscreenTerminal.tsx + xterm.js)

**渲染问题：**
1. 使用 DOM 渲染器（默认），未启用 WebGL/Canvas 加速
2. 大量输出时（如 `cat` 大文件、编译日志）可能出现卡顿
3. `scrollback=10000` 行，内存占用可观

**交互问题：**
1. 每次切换会话都要销毁重建 Terminal 实例（`useEffect deps=[activeSessionId]`），导致切换时有明显闪烁和延迟
2. 没有分屏能力：一次只能看一个终端
3. 没有命令块（block）概念：无法像 Warp 那样按命令/输出分块
4. 没有搜索功能（Ctrl+F 被全局快捷键占用为全屏）

**回放问题：**
1. 切换会话时从 `history` 数组回放全部历史（最多 2MB），即使有 `selectReplayContent` 截断，首次 `write` 仍可能很大
2. 回放与实时输出的衔接依赖"先订阅再回放"的顺序保证，但在极端情况下（回放很慢）可能出现短暂的内容跳动

### 3. 状态检测与预览清洗 (statusDetector.ts)

**问题：**
1. `cleanTerminalOutputKeepColor` 是一个约 250 行的 2D 屏幕模拟器，虽然功能正确，但本质是在 JS 里重新实现了一个简化版终端模拟器，与 xterm.js 的功能有大量重叠，维护成本高
2. 每次 flush 都从头重算（虽然有 `tailLines` 截取 16KB）
3. 没有利用 xterm.js 的 buffer API 来获取已渲染的屏幕内容
4. 状态检测（`detectStatusWithRules`）对每次输出都跑全部正则规则

---

## 二、业界更优方案调研

### 1. 渲染引擎层面

**xterm.js WebGL 渲染器 (@xterm/addon-webgl)**
- 使用 GPU 加速字符渲染，性能提升 5-10 倍
- 通过纹理图集(Texture Atlas)缓存字符位图
- 适合大量输出场景（编译日志、`cat` 大文件等）
- 当前 TCommander 未使用，是最直接的性能优化点

**xterm.js Canvas 渲染器 (@xterm/addon-canvas)**
- 2D Canvas 渲染，性能介于 DOM 和 WebGL 之间
- 兼容性更好（WebGL 不可用时的降级方案）

**卡片预览用微型 xterm 实例**
- 在每张卡片中嵌入一个只读的微型 xterm Terminal
- 直接复用 xterm.js 的 ANSI 解析和渲染能力
- 消除 `ansiToHtml` + `dangerouslySetInnerHTML` 的开销
- 视觉与全屏终端 100% 一致（同一渲染引擎）
- 参考：Tabby 终端的多会话预览就是用小 xterm 实例

### 2. 交互体验层面（参考 Warp / Tabby / Wave）

**Warp 的 Block 模型**
- 每次命令+输出组成一个"块"(Block)
- 块可独立折叠/展开/复制/搜索
- 命令输入区与输出区视觉分离
- 支持 AI 辅助（自然语言→命令）
- 可借鉴：在卡片预览中按命令分块显示

**Tabby 的多会话管理**
- 分屏（水平/垂直分割）
- 会话分组 + 标签页
- 内置 SSH/SFTP 管理
- 插件系统
- 可借鉴：全屏模式下支持分屏查看多个终端

**Wave Terminal 的行内渲染**
- 命令输出支持 Markdown/HTML 富文本渲染
- 图片、表格等直接在终端中渲染
- 可借鉴：卡片预览中对特定输出做智能渲染

**通用现代终端 UX**
- 命令搜索（Ctrl+R 历史搜索）
- 智能自动补全
- 输出高亮/过滤
- 会话间拖拽传输
- 缩略图实时预览（而非进入全屏才能交互）

### 3. 数据流层面

**增量渲染**
- 不再每次全量重算 `previewText`
- 利用 xterm.js buffer API 直接读取屏幕内容
- 只处理新增量（delta），不重算历史

**离屏渲染 + 节流**
- 卡片预览不需要每帧都更新
- 可以用 `requestIdleCallback` 或固定 100ms 节流
- 不可见的卡片（滚动到视口外）暂停更新

**Web Worker**
- 将 `cleanTerminalOutputKeepColor` 等 CPU 密集计算移到 Worker
- 避免阻塞渲染线程
- 适合大量输出的场景

---

## 三、优化方案

### 方案 A：卡片预览改用微型 xterm 实例（推荐，效果最大）

**核心思路：**
每张卡片的预览区不再用 `<pre dangerouslySetInnerHTML>`，而是嵌入一个只读的微型 xterm Terminal 实例。

**实现要点：**
1. SessionCard 预览区改为 `<div ref={termRef}>` + `new Terminal({ rows: previewLineCount, cols: 120, disableStdin: true, cursorBlink: false, fontSize: 11, scrollback: 0 })`
2. 数据流：PTY 输出 → 主进程 ring buffer → 卡片 xterm.write()，不再需要 `cleanTerminalOutputKeepColor` / `ansiToHtml` / `previewText`
3. 用 FitAddon 或固定 cols/rows 让微型终端适配卡片尺寸
4. 主题切换时同步更新所有卡片终端的 theme 选项

**优势：**
- 视觉与全屏终端 100% 一致（同一渲染引擎）
- 彻底消除 `ansiToHtml` + `dangerouslySetInnerHTML` 的性能开销
- 不再需要维护 250 行的 2D 屏幕模拟器
- 天然支持所有 ANSI 序列（包括 256 色、真彩、TUI 程序）
- 可以实现"光标闪烁"等终端效果，让预览更生动

**风险：**
- N 张卡片 = N 个 xterm 实例，内存开销增加
- 需要评估 20+ 卡片同时渲染时的性能
- 可通过"可见才渲染"(IntersectionObserver) 缓解

### 方案 B：全屏终端启用 WebGL 渲染

**核心思路：**
在 FullscreenTerminal 中加载 `@xterm/addon-webgl`

**实现要点：**
1. `npm install @xterm/addon-webgl`
2. `const { WebglAddon } = await import('@xterm/addon-webgl')`
3. `terminal.loadAddon(new WebglAddon())`
4. 处理 WebGL 上下文丢失（`webgladdon.onContextLoss`）

**优势：**
- 大量输出时性能提升 5-10 倍
- 字符渲染更平滑（GPU 抗锯齿）
- 改动极小（加 3 行代码）

**风险：**
- Electron 29 的 Chromium 内核对 WebGL 支持良好，风险低
- 少数虚拟机/远程桌面环境可能不支持 WebGL

### 方案 C：会话切换不再销毁重建 Terminal

**核心思路：**
预创建 Terminal 实例池，切换会话时只显示/隐藏，不销毁/重建

**实现要点：**
1. 维护 `Map<sessionId, Terminal>`，每个会话首次进入全屏时创建
2. 切换时：隐藏旧终端 DOM，显示新终端 DOM
3. 后台会话继续接收数据（通过 `onSessionOutput` 写入对应 Terminal）
4. 用 IntersectionObserver 或 visibility 控制不可见终端的更新频率

**优势：**
- 消除切换时的闪烁和延迟
- 回放只需做一次（首次创建时），后续切换是即时的
- 更接近真实多标签终端的体验

**风险：**
- 内存占用增加（每个会话一个 Terminal 实例 + scrollback）
- 需要管理 Terminal 生命周期（会话关闭时销毁）

### 方案 D：全屏终端支持分屏

**核心思路：**
在全屏模式下支持水平/垂直分割，同时查看多个终端

**实现要点：**
1. 新增 `splitLayout` 状态：`'single' | 'horizontal' | 'vertical'`
2. 分屏区域各渲染一个独立的 xterm Terminal
3. 支持拖拽调整分割比例
4. 每个分屏独立接收 PTY 输出

**优势：**
- 多任务监控效率大幅提升
- 参考 Tabby / tmux 的分屏体验

### 方案 E：数据流优化

**核心思路：**
减少不必要的重算和重渲染

**实现要点：**
1. 卡片预览更新节流：固定 200ms 间隔，不跟随每次 PTY 输出
2. 不可见卡片暂停更新：IntersectionObserver 检测可见性
3. 将 `cleanTerminalOutputKeepColor` 移入 Web Worker
4. 使用 Zustand 的 `subscribeWithSelector` 精确订阅（只订阅 `previewText` 变化，不触发其他字段的 re-render）

---

## 四、推荐实施优先级

**第一优先级（投入小、效果大）：**
1. **方案 B**：全屏终端启用 WebGL 渲染（3 行代码，性能提升显著）
2. **方案 E 的部分优化**：预览更新节流 + 不可见暂停

**第二优先级（投入中等、效果显著）：**
3. **方案 A**：卡片预览改用微型 xterm 实例（体验提升最大，但改动也最大）
4. **方案 C**：会话切换不销毁 Terminal

**第三优先级（锦上添花）：**
5. **方案 D**：全屏分屏
6. 命令搜索、Block 模型等 Warp 式功能

---

## 五、技术细节补充

### 5.1 微型 xterm 实例的内存评估

假设每张卡片：
- `rows=10, cols=120, fontSize=11, scrollback=0`
- 每个字符约占 2 字节（UTF-16），10×120=1200 字符 ≈ 2.4KB
- xterm 实例本身开销约 50-100KB（包括 DOM 节点、事件监听器等）

20 张卡片同时渲染：
- 总内存约 20 × 100KB = 2MB
- 对于 Electron 应用来说完全可以接受

### 5.2 WebGL 渲染器的兼容性

Electron 29 基于 Chromium 122，WebGL 2.0 支持良好：
- Windows：支持 OpenGL 4.6 / DirectX 11
- macOS：支持 OpenGL 4.1 / Metal
- Linux：支持 OpenGL 4.6

仅在以下情况可能降级：
- 虚拟机未开启 3D 加速
- 远程桌面（RDP/VNC）
- 极老旧的显卡（2010 年前）

建议实现降级策略：
```typescript
try {
  const webglAddon = new WebglAddon()
  webglAddon.onContextLoss(() => {
    webglAddon.dispose()
    // 降级到 DOM 渲染器
  })
  terminal.loadAddon(webglAddon)
} catch (e) {
  // WebGL 不可用，继续使用 DOM 渲染器
  console.warn('WebGL addon failed to load, falling back to DOM renderer')
}
```

### 5.3 会话切换优化的实现细节

当前问题代码（FullscreenTerminal.tsx 第 101-273 行）：
```typescript
useEffect(() => {
  // 每次 activeSessionId 变化都执行
  const initTerminal = async () => {
    // 创建新 Terminal 实例
    // 回放历史
    // 订阅实时输出
  }
  initTerminal()
  
  return () => {
    // 销毁 Terminal 实例
    terminalRef.current.dispose()
  }
}, [activeSessionId])
```

优化后的代码结构：
```typescript
// 维护 Terminal 实例池
const terminalPool = useRef<Map<string, Terminal>>(new Map())

// 获取或创建 Terminal
const getOrCreateTerminal = (sessionId: string) => {
  if (!terminalPool.current.has(sessionId)) {
    const term = new Terminal({ ... })
    terminalPool.current.set(sessionId, term)
    // 首次创建时回放历史
    replayHistory(term, sessionId)
  }
  return terminalPool.current.get(sessionId)!
}

// 切换会话时只显示/隐藏
useEffect(() => {
  if (activeSessionId) {
    const term = getOrCreateTerminal(activeSessionId)
    term.open(termContainerRef.current)
    term.focus()
  }
}, [activeSessionId])

// 会话关闭时清理
const handleSessionClose = (sessionId: string) => {
  const term = terminalPool.current.get(sessionId)
  if (term) {
    term.dispose()
    terminalPool.current.delete(sessionId)
  }
}
```

### 5.4 数据流优化的具体实现

**预览更新节流：**
```typescript
// App.tsx 中的 handleOutput
const throttledUpdatePreview = useMemo(
  () => throttle((sessionId: string) => {
    const session = useAppStore.getState().sessions.find(s => s.id === sessionId)
    if (!session) return
    
    const cleanText = cleanTerminalOutputKeepColor(session.history.join(''))
    useAppStore.getState().updateSession(sessionId, { previewText: cleanText })
  }, 200),
  []
)

const handleOutput = (sessionId: string, data: string) => {
  // 立即更新 history（用于回放）
  // 但 previewText 节流更新
  throttledUpdatePreview(sessionId)
}
```

**不可见卡片暂停更新：**
```typescript
// SessionCard.tsx
const [isVisible, setIsVisible] = useState(false)
const cardRef = useRef<HTMLDivElement>(null)

useEffect(() => {
  const observer = new IntersectionObserver(
    ([entry]) => setIsVisible(entry.isIntersecting),
    { threshold: 0.1 }
  )
  if (cardRef.current) observer.observe(cardRef.current)
  return () => observer.disconnect()
}, [])

// 只有可见时才订阅 previewText 更新
const previewText = isVisible 
  ? useAppStore(s => s.sessions.find(s => s.id === session.id)?.previewText)
  : null
```

---

## 六、总结

TCommander 当前的终端体验存在明显的性能和交互问题，主要集中在：
1. 卡片预览使用低效的 HTML 渲染方案
2. 全屏终端未启用 WebGL 加速
3. 会话切换时销毁重建 Terminal 实例
4. 数据流链路长，无节流优化

通过实施上述优化方案（尤其是方案 A 和方案 B），可以显著提升：
- **性能**：渲染速度提升 5-10 倍，内存占用更合理
- **视觉一致性**：卡片预览与全屏终端使用同一渲染引擎
- **交互流畅度**：会话切换无延迟，大量输出不卡顿
- **用户体验**：更接近现代终端（Warp/Tabby）的交互模式

建议按优先级逐步实施，先做投入小效果大的优化（方案 B + 方案 E 部分），再逐步推进大型重构（方案 A + 方案 C）。

---

## 七、AEC 实现记录

> 开发分支：`feature/terminal-optimization-aec`
> 实施日期：2026-06-23

### 7.1 方案 E：数据流优化

**修改文件：** `src/renderer/src/App.tsx`

**实现内容：**
- `previewText` 更新从「每次 flush 立即计算」改为「200ms 节流延迟计算」
- `history` 和 `status` 仍立即更新，保证状态检测实时性
- `cleanTerminalOutputKeepColor` 只在节流定时器触发时执行，大幅减少 CPU 密集计算频率

**关键代码：**
```typescript
// App.tsx - flushSession 函数
// === 方案 E：previewText 延迟计算（200ms 节流）===
if (previewThrottleTimers.current[sessionId]) {
  clearTimeout(previewThrottleTimers.current[sessionId])
}
previewThrottleTimers.current[sessionId] = setTimeout(() => {
  delete previewThrottleTimers.current[sessionId]
  const s = useAppStore.getState().sessions.find(s => s.id === sessionId)
  if (!s) return
  const raw = s.history.join('')
  const tail = tailLines(raw, 16 * 1024)
  const cleaned = cleanTerminalOutputKeepColor(tail)
  useAppStore.getState().updateSession(sessionId, { previewText: cleaned })
}, 200)
```

### 7.2 方案 C：Terminal 实例池

**修改文件：** `src/renderer/src/components/FullscreenTerminal.tsx`

**实现内容：**
- 用 `terminalPoolRef`（`Map<sessionId, entry>`）管理所有全屏 Terminal 实例
- 切换会话时：隐藏所有终端 DOM → 显示目标终端 DOM，不销毁/重建
- 每个 Terminal 实例首次创建时回放历史，后续切换直接显示（即时切换）
- 每个实例独立订阅 `onSessionOutput`，后台会话持续接收数据
- 会话关闭时从池中移除并 dispose

**关键代码：**
```typescript
// FullscreenTerminal.tsx
const terminalPoolRef = useRef<Map<string, {
  terminal: any
  fitAddon: any
  container: HTMLDivElement
  unsubOutput: (() => void) | null
  replayed: boolean
}>>(new Map())

const getOrCreateTerminal = useCallback(async (sessionId: string) => {
  const pool = terminalPoolRef.current
  if (pool.has(sessionId)) return pool.get(sessionId)!
  // 首次创建：创建 Terminal + 订阅输出 + 存储到池
  // ...
}, [terminalThemeId])

// 切换时：隐藏所有 → 显示目标 → fit → focus
```

### 7.3 方案 A：卡片预览改用微型 xterm 实例

**修改文件：**
- `src/renderer/src/components/SessionCard.tsx`
- `src/renderer/src/App.tsx`

**实现内容：**

**SessionCard.tsx 改动：**
- 组件改为 `forwardRef` 包装，暴露 `writePreview(data: string)` 方法
- 预览区从 `<pre dangerouslySetInnerHTML>` 改为 `<div ref>` + 微型 xterm Terminal
- xterm 配置：`cols:120, rows:previewLineCount, disableStdin:true, scrollback:0, fontSize:11`
- 移除 ANSI-to-HTML 转换逻辑，ANSI 转义序列由 xterm.js 原生渲染
- 主题变化时同步更新终端 theme 选项

**App.tsx 改动：**
- 新增 `sessionCardRefs`（`Map<sessionId, SessionCardHandle>`）集中管理所有卡片 ref
- 新增 `registerSessionCard` 回调用于注册/注销卡片实例
- `flushSession` 中通过 ref 直接调用 `cardHandle.writePreview(chunk)`，绕过 React 状态更新
- `previewText` 节流更新保留，作为调试/备份用途

**关键代码：**
```typescript
// App.tsx
const sessionCardRefs = useRef<Map<string, SessionCardHandle>>(new Map())

// flushSession 中：
const cardHandle = sessionCardRefs.current.get(sessionId)
if (cardHandle) {
  chunks.forEach(chunk => cardHandle.writePreview(chunk))
}

// SessionCard.tsx
function SessionCardImpl(props: SessionCardProps, ref: React.ForwardedRef<SessionCardHandle>) {
  const previewTermRef = useRef<any>(null)
  
  useImperativeHandle(ref, () => ({
    writePreview: (data: string) => {
      if (previewTermRef.current) previewTermRef.current.write(data)
    }
  }))
  
  // 初始化微型 xterm
  useEffect(() => {
    const { Terminal } = await import('@xterm/xterm')
    const term = new Terminal({
      cols: 120, rows: previewLineCount,
      cursorBlink: false, disableStdin: true,
      fontSize: 11, scrollback: 0, convertEol: true,
      theme: terminalTheme.colors,
    })
    term.open(previewContainerRef.current)
    previewTermRef.current = term
  }, [session.id])
}

const SessionCard = memo(forwardRef(SessionCardImpl))
```

### 7.4 性能收益总结

| 优化项 | 优化前 | 优化后 |
|--------|--------|--------|
| 卡片预览渲染 | ANSI→HTML→dangerouslySetInnerHTML→DOM重建 | xterm.js 增量写入，无 DOM 重建 |
| previewText 更新频率 | 每次 flush 都计算 | 200ms 节流 |
| 全屏切换 | 销毁+重建 Terminal+回放历史 | 显示/隐藏 DOM，即时切换 |
| 数据流链路 | PTY→flush→clean→updateSession→re-render→ansiToHtml→DOM | PTY→flush→ref.write()（绕过 React） |
| 视觉一致性 | 卡片(HTML) vs 全屏(xterm) 不一致 | 卡片和全屏均使用 xterm.js，100% 一致 |

### 7.5 待完成项

- [ ] IntersectionObserver：不可见卡片暂停 xterm 写入（进一步降低内存/CPU）
- [ ] 内存基准测试：20+ 卡片同时渲染时的内存占用评估
- [ ] 方案 B（WebGL 渲染器）尚未实施
