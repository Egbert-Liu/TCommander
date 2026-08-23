/**
 * 终端实例池（TerminalPool）
 *
 * 核心设计：一会话一 xterm 实例 + DOM 转移
 *
 * - 每个会话创建时对应一个 xterm Terminal 实例，挂在独立的 containerDiv 上
 * - 卡片和全屏共用同一实例，通过 appendChild 转移 DOM（不 dispose 不重建）
 * - 统一订阅一次 onSessionOutput，按 sessionId 实时分发 write 到对应实例
 * - 不可见时 detach（containerDiv.remove），buffer 保留内容但不渲染（CPU ≈ 0）
 * - 重新可见时 reattach + refresh，内容已是最新（buffer 持续接收 write）
 *
 * 这样解决了之前实例池的问题：
 * - 内容展示延迟 → PTY 输出直接 write 到 xterm（0 延迟）
 * - 卡片变窄 → 由 CSS Grid minmax(500px,1fr) 保证
 * - 渲染慢 → 不可见时 detach 省 CPU
 */
import type { Terminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'
import type { TerminalTheme } from './terminalThemes'

export type AttachMode = 'card' | 'fullscreen'

interface TerminalInstance {
  terminal: Terminal
  fitAddon: FitAddon
  /** 终端 DOM 根容器（独立于 React 树，由池管理生命周期） */
  containerDiv: HTMLDivElement
  /** 当前挂载模式 */
  attachedTo: AttachMode | null
  /** onData 取消订阅 */
  unsubData: (() => void) | null
  /** 最后一次 resize 的 cols/rows，用于防抖 */
  lastCols: number
  lastRows: number
  /** terminal.open() 是否已调用（只能调用一次，延迟到首次 attach 时执行） */
  opened: boolean
}

class TerminalPoolImpl {
  private instances: Map<string, TerminalInstance> = new Map()
  /** 实例异步创建期间的输出缓存：create() 完成后一次性 flush 到 xterm */
  private pendingData: Map<string, string[]> = new Map()
  /** pendingData 的累计字符数（增量维护，超限判断 O(1)，免每次全量累加） */
  private pendingBytes: Map<string, number> = new Map()
  /** 已 destroy 的 sessionId 集合：防止异步 create 完成后残留实例 */
  private destroyed: Set<string> = new Set()
  /** pending attach：实例异步创建期间的挂载请求，create() 完成后自动执行 */
  private pendingAttaches: Map<string, { parent: HTMLElement; mode: AttachMode }> = new Map()
  private unsubOutput: (() => void) | null = null
  private unsubExit: (() => void) | null = null
  private initialized = false

  // 卡片模式字体小，全屏模式字体大（全屏字号用户可调，卡片按比例跟随）
  private userFontSize = 13
  private userFontFamily = "'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace"
  /** 卡片字号 = 全屏字号 - 3（下限 8），保持卡片预览紧凑 */
  private cardFontSize(): number {
    return Math.max(8, this.userFontSize - 3)
  }
  private static SCROLLBACK = 10000
  /** pendingData 单会话字节上限：防止异步 create 期间 OOM */
  private static PENDING_BYTE_LIMIT = 256 * 1024

  /**
   * 初始化：订阅 PTY 输出和退出事件
   * 只调用一次（App.tsx 初始化时）
   */
  init(): void {
    if (this.initialized) return
    this.initialized = true

    // 统一订阅 PTY 输出：按 sessionId 分发到对应实例
    this.unsubOutput = window.electronAPI.onSessionOutput((sessionId, data) => {
      const instance = this.instances.get(sessionId)
      if (instance) {
        instance.terminal.write(data)
      } else if (!this.destroyed.has(sessionId)) {
        // 实例尚未创建（异步 create() 进行中），先缓存，create() 完成后 flush
        // 累计字符数增量维护，超限时从头丢弃旧块（O(1) 判断，免全量累加）
        const buf = this.pendingData.get(sessionId)
        if (buf) {
          buf.push(data)
          let bytes = (this.pendingBytes.get(sessionId) ?? 0) + data.length
          while (buf.length > 1 && bytes > TerminalPoolImpl.PENDING_BYTE_LIMIT) {
            bytes -= buf.shift()!.length
          }
          this.pendingBytes.set(sessionId, bytes)
        } else {
          this.pendingData.set(sessionId, [data])
          this.pendingBytes.set(sessionId, data.length)
        }
      }
    })

    // 统一订阅 PTY 退出（实例保留，由 App.tsx 处理状态）
    this.unsubExit = window.electronAPI.onSessionExit((sessionId) => {
      // 实例不销毁，保留 buffer 内容供查看
      void sessionId
    })
  }

  /**
   * 设置当前主题（创建新实例和热更新时使用）
   */
  setTheme(theme: TerminalTheme): void {
    // 批量热更新所有实例
    this.instances.forEach((instance) => {
      try {
        instance.terminal.options.theme = theme.colors
        // 仅对已 open 的实例 refresh（未 open 时无 DOM，refresh 无意义）
        if (instance.opened) {
          const end = instance.terminal.buffer.active.length - 1
          instance.terminal.refresh(0, Math.max(0, end))
        }
      } catch (e) {
        // 实例可能已被销毁，忽略
      }
    })
  }

  /**
   * 用户调节全屏字号：更新用户值并热更新所有实例。
   * 卡片实例按比例（-3）跟随；已挂载的实例更新 options 后重新 fit + 同步 PTY 尺寸。
   * detach 状态的实例只在 options 上更新，下次 attach 时自然生效。
   */
  setFontSize(size: number): void {
    this.userFontSize = size
    this.instances.forEach((instance, sessionId) => {
      try {
        const target = instance.attachedTo === 'card' ? this.cardFontSize() : this.userFontSize
        instance.terminal.options.fontSize = target
        // 已 open 且已挂载：立即 fit 让 cols/rows 适配新字号
        if (instance.opened && instance.attachedTo) {
          instance.fitAddon.fit()
          this.syncResize(sessionId)
        }
      } catch {
        // 实例可能已被销毁，忽略
      }
    })
  }

  /**
   * 用户切换终端字体族：热更新所有实例并重新 fit
   */
  setFontFamily(family: string): void {
    this.userFontFamily = family
    this.instances.forEach((instance, sessionId) => {
      try {
        instance.terminal.options.fontFamily = family
        if (instance.opened && instance.attachedTo) {
          instance.fitAddon.fit()
          this.syncResize(sessionId)
        }
      } catch {
        // 实例可能已被销毁，忽略
      }
    })
  }

  /**
   * 创建终端实例（会话创建时调用）
   *
   * 注意：此处只创建 Terminal 对象，不调用 terminal.open()。
   * open() 延迟到首次 attach() 时执行——确保容器已在文档中（offsetHeight > 0），
   * 否则 xterm Viewport 初始化时 _lastRecordedViewportHeight = 0，滚动区域计算异常，
   * 表现为无法向上滚动 / 看不到历史记录。
   */
  async create(sessionId: string, theme: TerminalTheme): Promise<void> {
    if (this.instances.has(sessionId)) return
    // 标记为未销毁，允许 pendingData 缓存
    this.destroyed.delete(sessionId)

    // 动态导入 xterm（与 FullscreenTerminal 一致，避免打包进主 chunk）
    const { Terminal } = await import('@xterm/xterm')
    const { FitAddon } = await import('@xterm/addon-fit')

    // await 期间可能已被 destroy：跳过实例创建，清理已缓存的 pendingData
    if (this.destroyed.has(sessionId)) {
      this.pendingData.delete(sessionId)
      this.pendingBytes.delete(sessionId)
      return
    }

    const containerDiv = document.createElement('div')
    containerDiv.style.width = '100%'
    containerDiv.style.height = '100%'

    const terminal = new Terminal({
      cols: 80,
      rows: 10,
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: this.cardFontSize(),
      fontFamily: this.userFontFamily,
      lineHeight: 1.25,
      scrollback: TerminalPoolImpl.SCROLLBACK,
      convertEol: true,
      theme: theme.colors,
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)

    // alt buffer 滚轮限幅：xterm 默认把一次 wheel 的 deltaY 全量换算成方向键
    // 一次性发出（源码中 for 循环拼接 N 个 ESC[A/B 后一次 triggerDataEvent），
    // 触摸板 / 高分辨率滚轮的单帧大 delta 会一次发出几十上百个 ArrowUp，
    // Claude Code / Codex 等 TUI 直接连跳到对话历史最前面，而非局部滚动。
    // 这里把单次 wheel 事件的滚动量限幅为最多 3 行：
    // - normal buffer → 返回 true，走 xterm 原生 viewport 滚动（体验不变）；
    // - 应用开启鼠标滚轮上报（SGR mouse mode）时 xterm 不调用本 handler，
    //   由应用自己消费滚轮事件，互不干扰。
    terminal.attachCustomWheelEventHandler((ev: WheelEvent): boolean => {
      if (terminal.buffer.active.type !== 'alternate') return true
      if (ev.deltaY === 0 || ev.shiftKey) return true

      const abs = Math.abs(ev.deltaY)
      // PIXEL：行高未知，按 delta 分档 1-3 行；LINE/PAGE：deltaY 即行数/页数，直接 clamp
      const lines = ev.deltaMode === WheelEvent.DOM_DELTA_PIXEL
        ? (abs < 60 ? 1 : abs < 160 ? 2 : 3)
        : Math.min(3, Math.max(1, Math.round(abs)))

      // 方向键前缀跟随 DECCKM（application cursor keys，vim 等期望 ESC O A）；
      // 内部字段读取失败时兜底 CSI 序列（大多数 TUI 两种都认）
      const appCursor = !!(terminal as any)._core?.coreService?.decPrivateModes?.applicationCursorKeys
      const seq = `${appCursor ? '\x1bO' : '\x1b['}${ev.deltaY < 0 ? 'A' : 'B'}`
      void window.electronAPI.sendInput(sessionId, seq.repeat(lines))
      return false
    })

    // 不在此处调用 terminal.open(containerDiv) —— 延迟到首次 attach()

    const instance: TerminalInstance = {
      terminal,
      fitAddon,
      containerDiv,
      attachedTo: null,
      unsubData: null, // onData 也延迟到 open 后注册
      lastCols: 0,
      lastRows: 0,
      opened: false,
    }

    this.instances.set(sessionId, instance)

    // 注意：pendingData 不在此处 flush —— 必须等 terminal.open() 之后才能 write
    // open() 在首次 attach() 中调用，flush 也在那里执行

    // 执行 pending attach：实例创建完成前已收到的挂载请求
    const pendingAttach = this.pendingAttaches.get(sessionId)
    if (pendingAttach) {
      this.pendingAttaches.delete(sessionId)
      this.attach(sessionId, pendingAttach.parent, pendingAttach.mode)
    }
  }

  /**
   * 销毁终端实例（会话删除时调用）
   */
  destroy(sessionId: string): void {
    // 标记为已销毁：防止异步 create() 完成后残留实例
    this.destroyed.add(sessionId)

    const instance = this.instances.get(sessionId)
    if (!instance) {
      // 实例可能还在异步创建中，清理 pending 缓存
      this.pendingData.delete(sessionId)
      this.pendingBytes.delete(sessionId)
      return
    }

    // 从 DOM 移除
    if (instance.containerDiv.parentNode) {
      instance.containerDiv.parentNode.removeChild(instance.containerDiv)
    }
    // 取消 onData 订阅
    instance.unsubData?.()
    // 销毁 xterm
    instance.terminal.dispose()

    this.instances.delete(sessionId)
    this.pendingData.delete(sessionId)
    this.pendingBytes.delete(sessionId)
    this.pendingAttaches.delete(sessionId)
  }

  /**
   * 挂载到指定父节点（卡片或全屏）
   * 使用 appendChild 实现 DOM 转移：浏览器自动从旧 parent 移除
   * 若实例尚在异步创建中，记录为 pending attach，create() 完成后自动执行
   *
   * 首次 attach 时调用 terminal.open(containerDiv) —— 此时 containerDiv 已在文档中，
   * xterm Viewport 能正确读取 offsetHeight，滚动区域初始化正常。
   */
  attach(sessionId: string, parent: HTMLElement, mode: AttachMode): void {
    const instance = this.instances.get(sessionId)
    if (!instance) {
      // 实例还在异步创建中，记录 pending attach
      if (!this.destroyed.has(sessionId)) {
        this.pendingAttaches.set(sessionId, { parent, mode })
      }
      return
    }

    // 设置字体大小（卡片 vs 全屏：全屏用用户设置值，卡片按比例缩小）
    const targetFontSize = mode === 'card'
      ? this.cardFontSize()
      : this.userFontSize

    const fontSizeChanged = instance.terminal.options.fontSize !== targetFontSize

    // 首次 attach：必须等容器 layout 完成后再调用 terminal.open()
    // 否则 xterm 根据 offsetHeight=0（或很小）初始化 viewport，只显示 2-3 行
    if (!instance.opened) {
      // 先设置正确字体，确保首次渲染就一致
      instance.terminal.options.fontSize = targetFontSize
      // 先把容器挂到 parent（进入文档流），但暂不 open
      parent.appendChild(instance.containerDiv)
      instance.attachedTo = mode

      // 等待浏览器完成 layout 后再 open + fit
      // 双 rAF 确保在 paint 之后执行，此时 offsetHeight 已是最终值
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const inst = this.instances.get(sessionId)
          if (!inst || inst.opened || inst.attachedTo !== mode) return

          try {
            // 此时容器已有正确尺寸，open() 能正确计算 rows/cols
            inst.terminal.open(inst.containerDiv)
            inst.opened = true

            // 注册 onData（必须在 open 后）
            const dataHandler = inst.terminal.onData((data) => {
              window.electronAPI.sendInput(sessionId, data)
            })
            inst.unsubData = () => dataHandler.dispose()

            // flush 异步创建期间缓存的输出
            const pending = this.pendingData.get(sessionId)
            if (pending && pending.length > 0) {
              pending.forEach(chunk => inst.terminal.write(chunk))
            }
            this.pendingData.delete(sessionId)
            this.pendingBytes.delete(sessionId)

            // fit 确保 cols/rows 与容器匹配
            inst.fitAddon.fit()
            this.syncResize(sessionId)

            // 刷新 buffer + 滚动到底部
            const end = inst.terminal.buffer.active.length - 1
            inst.terminal.refresh(0, Math.max(0, end))
            inst.terminal.scrollToBottom()
          } catch (e) {
            console.error('[terminalPool] terminal.open failed:', e)
          }
        })
      })
      return
    }

    // 后续 attach（已 open）：DOM 转移
    if (fontSizeChanged) {
      instance.terminal.options.fontSize = targetFontSize
    }

    // 重置可能残留的 clip 裁剪样式（MD 全屏模式会给容器加 clip-path）：
    // cssText 赋值会整体替换内联样式（含 clipPath）。放在去重检查之前——
    // clip 模式下 parentNode/mode 均未变，若放在去重检查之后，早退路径会跳过重置
    instance.containerDiv.style.cssText = 'width: 100%; height: 100%'

    // 去重：已在同一父节点且字体未变则跳过（避免不必要的 DOM 操作）
    if (instance.containerDiv.parentNode === parent && !fontSizeChanged && instance.attachedTo === mode) {
      return
    }

    // DOM 转移：appendChild 自动从旧 parent 移除
    parent.appendChild(instance.containerDiv)
    instance.attachedTo = mode

    // 适配新尺寸（字体变化或父节点变化都需要重新 fit）
    requestAnimationFrame(() => {
      // rAF 执行时实例可能已被 destroy/detach，重新检查
      const inst = this.instances.get(sessionId)
      if (!inst || inst.attachedTo !== mode) return
      try {
        inst.fitAddon.fit()
        this.syncResize(sessionId)
        // DOM 转移后显式刷新，触发 xterm 重新计算滚动区域
        const end = inst.terminal.buffer.active.length - 1
        inst.terminal.refresh(0, Math.max(0, end))
        // 确保挂载后视图对齐到缓冲区底部
        inst.terminal.scrollToBottom()
      } catch (e) {
        // 容器可能还未布局完成，忽略
      }
    })
  }

  /**
   * 从当前父节点卸载（不销毁实例，buffer 保留）
   */
  detach(sessionId: string): void {
    const instance = this.instances.get(sessionId)
    if (!instance) return

    if (instance.containerDiv.parentNode) {
      instance.containerDiv.parentNode.removeChild(instance.containerDiv)
    }
    instance.attachedTo = null
  }

  /**
   * MD 全屏 clip 输入模式：仅用 clip-path 露出 xterm 底部输入区，不改变容器尺寸
   *
   * 背景（对照业界实现，Wave 的 term/vdom 双模式思路）：全屏 Markdown 模式下
   * xterm 被 MD 渲染层盖住，键盘回显不可见。旧方案（strip）把容器收缩为 96px
   * 条再 fit —— cols/rows 变化触发 PTY resize → Claude Code 等 TUI 收到
   * SIGWINCH 全屏重绘，输出更乱且滚动状态易异常。
   *
   * clip 方案：容器保持全尺寸（不 fit、不 resize、无 SIGWINCH），仅
   * clip-path 裁掉上部，视觉上只露底部 heightPx 区域（Claude Code 输入框
   * 位于屏幕底部，回显恰好落在露出区域）。MD 渲染层 bottom 避让同一高度。
   *
   * 仅对当前挂载在全屏（attachedTo === 'fullscreen'）的实例生效；
   * 实例不存在 / 已切走 / 已 detach 时安全 no-op。
   */
  setClipMode(sessionId: string, enabled: boolean, heightPx: number = 150): void {
    const instance = this.instances.get(sessionId)
    if (!instance || instance.attachedTo !== 'fullscreen') return

    if (enabled) {
      instance.containerDiv.style.clipPath = `inset(calc(100% - ${heightPx}px) 0 0 0)`
    } else {
      instance.containerDiv.style.clipPath = ''
    }
  }

  /**
   * 同步 PTY 尺寸到 xterm 当前 cols/rows（带防抖）
   * 仅在实例已挂载时同步：detach 后不应向 PTY 发送 resize
   */
  private syncResize(sessionId: string): void {
    const instance = this.instances.get(sessionId)
    if (!instance || !instance.attachedTo) return

    const cols = instance.terminal.cols
    const rows = instance.terminal.rows
    if (cols === instance.lastCols && rows === instance.lastRows) return

    instance.lastCols = cols
    instance.lastRows = rows
    window.electronAPI.resizeSession(sessionId, cols, rows)
  }

  /**
   * 手动触发 fit + resize（窗口大小变化时调用）
   */
  fit(sessionId: string): void {
    const instance = this.instances.get(sessionId)
    if (!instance || !instance.attachedTo) return

    try {
      instance.fitAddon.fit()
      this.syncResize(sessionId)
    } catch (e) {
      // 忽略
    }
  }

  /**
   * 获取实例（用于读取 buffer、注册快捷键等）
   */
  get(sessionId: string): TerminalInstance | undefined {
    return this.instances.get(sessionId)
  }

  /**
   * 获取 xterm Terminal 实例
   */
  getTerminal(sessionId: string): Terminal | undefined {
    return this.instances.get(sessionId)?.terminal
  }

  /**
   * 读取尾部 N 行纯文本（用于状态检测或 Tooltip 预览）
   * 注意：getLine 返回对象在下次 write 后可能失效，需同步消费
   */
  readTailLines(sessionId: string, lineCount: number = 8): string {
    const instance = this.instances.get(sessionId)
    if (!instance) return ''

    const buffer = instance.terminal.buffer.active
    const total = buffer.length
    const start = Math.max(0, total - lineCount)
    const lines: string[] = []
    for (let y = start; y < total; y++) {
      const line = buffer.getLine(y)
      if (line) lines.push(line.translateToString(true))
    }
    return lines.join('\n')
  }

  /**
   * 滚动到底部
   */
  scrollToBottom(sessionId: string): void {
    const instance = this.instances.get(sessionId)
    if (!instance) return
    instance.terminal.scrollToBottom()
  }

  /**
   * 清理所有实例 + 取消订阅（应用退出时调用）
   */
  dispose(): void {
    this.unsubOutput?.()
    this.unsubExit?.()
    this.unsubOutput = null
    this.unsubExit = null

    this.instances.forEach((instance) => {
      if (instance.containerDiv.parentNode) {
        instance.containerDiv.parentNode.removeChild(instance.containerDiv)
      }
      instance.unsubData?.()
      instance.terminal.dispose()
    })
    this.instances.clear()
    this.pendingData.clear()
    this.pendingBytes.clear()
    this.pendingAttaches.clear()
    this.destroyed.clear()
    this.initialized = false
  }
}

// 导出单例
export const terminalPool = new TerminalPoolImpl()
