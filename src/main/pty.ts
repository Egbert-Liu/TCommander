import type { SessionConfig, TerminalBackend, SshAuthBridge } from './types'
import { LocalPtyBackend } from './backends/localPty'
import { SshBackend } from './backends/sshBackend'

interface PtySession {
  id: string
  backend: TerminalBackend
  config: SessionConfig
  destroyed: boolean
  /**
   * 主进程侧 ring buffer：分块保留最近一段原始输出（按 UTF-16 code unit 计数）。
   * 按块追加 + 惰性丢弃头部整块，避免 buffer 满后每个 chunk 触发一次
   * 256KB 级字符串拼接/拷贝；仅在 getRecentOutput 读取时才 join。
   * 用作「最近 N 字节历史」快照，避免在主进程堆无限增长；
   * 真正的卡片状态/预览缓存由渲染进程侧的双级缓存管理。
   *
   * 上限 256 KB ≈ 13 万中文字 ≈ 25 万 ASCII；普通终端滚动缓冲远超这个值，
   * 保留这么多够状态检测和快速回放用。
   */
  ringChunks: string[]
  ringTotal: number
  /** ring buffer 容量上限（字符数） */
  ringBufMax: number
}

/** 单会话主进程 ring buffer 上限：256 KB */
const MAIN_RING_BUFFER_MAX = 256 * 1024

export function createPtyManager() {
  const sessions = new Map<string, PtySession>()
  // 数据流：1 主进程（pty） -> 1 个 onData 回调 -> N 个 outputListeners
  // （目前 main 只有一个监听者：转发到渲染进程的 webContents），
  // 渲染进程再按 sessionId 分发给 N 张卡片订阅（store update -> SessionCard re-render）。
  let outputListeners: Array<(sessionId: string, data: string) => void> = []
  let exitListeners: Array<(sessionId: string, exitCode: number) => void> = []
  let connStatusListeners: Array<(sessionId: string, status: string) => void> = []
  let disposed = false
  // SSH 交互式认证桥（keyboard-interactive / known_hosts）；
  // 由 main/index.ts 在 app.whenReady 后通过 setSshAuthBridge 注入。
  let sshAuthBridge: SshAuthBridge | null = null

  /**
   * 追加 chunk 到分块 ring buffer：
   * - 剩余总量仍 ≥ cap 时整块丢弃头部（无大字符串拷贝，均摊 O(1)）
   * - 单块即超 cap 的异常大 chunk 才做一次 slice 截尾
   * 内存上界约 cap + 最大单块长度（≤ 2×cap）。
   */
  function appendToRing(session: PtySession, chunk: string): void {
    const cap = session.ringBufMax
    if (cap <= 0) return
    session.ringChunks.push(chunk)
    session.ringTotal += chunk.length
    while (session.ringChunks.length > 1) {
      const headLen = session.ringChunks[0].length
      if (session.ringTotal - headLen < cap) break
      session.ringChunks.shift()
      session.ringTotal -= headLen
    }
    if (session.ringChunks.length === 1 && session.ringTotal > cap) {
      session.ringChunks[0] = session.ringChunks[0].slice(session.ringTotal - cap)
      session.ringTotal = cap
    }
  }

  /**
   * 按 config.kind 选择后端实现。
   * - local：LocalPtyBackend（包 node-pty，行为与重构前完全一致）
   * - ssh：SshBackend（包 ssh2，异步连接；start() 由 createSession 调用）
   *
   * 返回 backend 与（仅 ssh）异步启动函数。local 构造即就绪，无需启动。
   */
  function createBackend(config: SessionConfig, sessionId: string): {
    backend: TerminalBackend
    starter?: () => Promise<void>
  } {
    const kind = config.kind || 'local'
    if (kind === 'ssh') {
      if (!config.ssh) {
        throw new Error('SSH 会话缺少 ssh 配置')
      }
      const ssh = new SshBackend(config.ssh, sshAuthBridge || undefined, sessionId)
      return { backend: ssh, starter: () => ssh.start() }
    }
    return {
      backend: new LocalPtyBackend({
        terminalType: config.terminalType,
        cwd: config.cwd,
        cols: config.cols,
        rows: config.rows,
        sessionId: sessionId,
      }),
    }
  }

  function createSession(config: SessionConfig): string {
    if (disposed) return ''

    const id = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const { backend, starter } = createBackend(config, id)

    const session: PtySession = {
      id,
      backend,
      config,
      destroyed: false,
      ringChunks: [],
      ringTotal: 0,
      ringBufMax: MAIN_RING_BUFFER_MAX,
    }

    backend.onData((data) => {
      if (session.destroyed || disposed) return
      // 主进程 ring buffer：append-and-trim，避免内存堆积
      appendToRing(session, data)
      outputListeners.forEach((listener) => listener(id, data))
    })

    backend.onExit(() => {
      if (disposed) return
      session.destroyed = true
      sessions.delete(id)
      exitListeners.forEach((listener) => listener(id, 0))
    })

    sessions.set(id, session)

    // SSH 异步连接：推送 connecting → ready/error 状态，
    // 失败时推一条用户可读的错误文本到预览，再触发 exit
    if (starter) {
      connStatusListeners.forEach((l) => l(id, 'connecting'))
      starter()
        .then(() => {
          if (disposed) return
          connStatusListeners.forEach((l) => l(id, 'ready'))
        })
        .catch((err) => {
          if (disposed) return
          connStatusListeners.forEach((l) => l(id, 'error'))
          const msg = `\r\n[SSH 连接失败] ${(err as Error).message || err}\r\n`
          appendToRing(session, msg)
          outputListeners.forEach((listener) => listener(id, msg))
          session.destroyed = true
          sessions.delete(id)
          exitListeners.forEach((listener) => listener(id, 1))
        })
    }

    if (config.initialCommand) {
      let sent = false
      const sendCommand = () => {
        if (sent || session.destroyed || disposed) return
        sent = true
        try {
          backend.write(config.initialCommand! + '\r')
        } catch {
          // 后端可能已关闭
        }
      }
      const unsubscribe = backend.onData(() => {
        sendCommand()
        try { unsubscribe() } catch { /* ignore */ }
      })
      setTimeout(() => {
        try { unsubscribe() } catch { /* ignore */ }
        sendCommand()
      }, 2000)
    }

    return id
  }

  /**
   * 暴露主进程 ring buffer 内容（按最近 N 字节切片），供主进程内部调试 / 未来
   * 「重连时回放」等场景使用。渲染进程不应直接调用。
   */
  function getRecentOutput(sessionId: string, maxChars?: number): string {
    const session = sessions.get(sessionId)
    if (!session) return ''
    const chunks = session.ringChunks
    if (chunks.length === 0) return ''
    // 读取时才 join（低频路径），单块时直接返回避免无谓拷贝
    const joined = chunks.length === 1 ? chunks[0] : chunks.join('')
    if (!maxChars || maxChars >= joined.length) return joined
    return joined.slice(-maxChars)
  }

  function sendInput(sessionId: string, data: string): void {
    if (disposed) return
    const session = sessions.get(sessionId)
    if (session && !session.destroyed) {
      try {
        session.backend.write(data)
      } catch {
        // 后端可能已关闭
      }
    }
  }

  function closeSession(sessionId: string): void {
    if (disposed) return
    const session = sessions.get(sessionId)
    if (session) {
      session.destroyed = true
      sessions.delete(sessionId)
      try {
        session.backend.kill()
      } catch {
        // 后端可能已关闭
      }
    }
  }

  function listSessions(): string[] {
    return Array.from(sessions.keys())
  }

  function resizeSession(sessionId: string, cols: number, rows: number): void {
    if (disposed) return
    const session = sessions.get(sessionId)
    if (session && !session.destroyed) {
      try {
        session.backend.resize(cols, rows)
      } catch {
        // 后端可能已关闭
      }
    }
  }

  function closeAllSessions(): void {
    sessions.forEach((session) => {
      session.destroyed = true
      try {
        session.backend.kill()
      } catch {
        // 后端可能已关闭
      }
    })
    sessions.clear()
  }

  function onOutput(listener: (sessionId: string, data: string) => void): void {
    outputListeners.push(listener)
  }

  function onExit(listener: (sessionId: string, exitCode: number) => void): void {
    exitListeners.push(listener)
  }

  function onConnStatus(listener: (sessionId: string, status: string) => void): void {
    connStatusListeners.push(listener)
  }

  function dispose(): void {
    disposed = true
    outputListeners = []
    exitListeners = []
    connStatusListeners = []
    sessions.forEach((session) => {
      session.destroyed = true
      try {
        session.backend.kill()
      } catch {
        // 后端可能已关闭
      }
    })
    sessions.clear()
  }

  return {
    createSession,
    sendInput,
    closeSession,
    listSessions,
    resizeSession,
    closeAllSessions,
    onOutput,
    onExit,
    onConnStatus,
    dispose,
    getRecentOutput,
    setSshAuthBridge: (bridge: SshAuthBridge | null) => { sshAuthBridge = bridge },
  }
}
