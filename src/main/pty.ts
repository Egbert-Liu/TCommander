import type { SessionConfig, TerminalBackend, SshAuthBridge } from './types'
import { LocalPtyBackend } from './backends/localPty'
import { SshBackend } from './backends/sshBackend'

interface PtySession {
  id: string
  backend: TerminalBackend
  config: SessionConfig
  destroyed: boolean
  /**
   * 主进程侧 ring buffer：按字符数（UTF-16 code unit）保留最近一段原始输出。
   * 用作「最近 N 字节历史」快照，避免在主进程堆无限增长；
   * 真正的卡片状态/预览缓存由渲染进程侧的双级缓存管理。
   *
   * 上限 256 KB ≈ 13 万中文字 ≈ 25 万 ASCII；普通终端滚动缓冲远超这个值，
   * 保留这么多够状态检测和快速回放用。
   */
  ringBuf: string
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
  let disposed = false
  // SSH 交互式认证桥（keyboard-interactive / known_hosts）；
  // 由 main/index.ts 在 app.whenReady 后通过 setSshAuthBridge 注入。
  let sshAuthBridge: SshAuthBridge | null = null

  function appendToRing(buf: string, chunk: string, cap: number): string {
    if (cap <= 0) return ''
    const next = buf + chunk
    if (next.length <= cap) return next
    // 超出容量时截掉头部，保留尾部 cap 个字符。
    return next.slice(next.length - cap)
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
      ringBuf: '',
      ringBufMax: MAIN_RING_BUFFER_MAX,
    }

    backend.onData((data) => {
      if (session.destroyed || disposed) return
      // 主进程 ring buffer：append-and-trim，避免内存堆积
      session.ringBuf = appendToRing(session.ringBuf, data, session.ringBufMax)
      outputListeners.forEach((listener) => listener(id, data))
    })

    backend.onExit(() => {
      if (disposed) return
      session.destroyed = true
      sessions.delete(id)
      exitListeners.forEach((listener) => listener(id, 0))
    })

    sessions.set(id, session)

    // SSH 异步连接：失败时推一条用户可读的错误文本到预览，再触发 exit
    // （保持 createSession 同步返回 id，避免 invoke 改 async 的连锁改动）
    if (starter) {
      starter().catch((err) => {
        if (disposed) return
        const msg = `\r\n[SSH 连接失败] ${(err as Error).message || err}\r\n`
        session.ringBuf = appendToRing(session.ringBuf, msg, session.ringBufMax)
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
    if (!maxChars || maxChars >= session.ringBuf.length) return session.ringBuf
    return session.ringBuf.slice(-maxChars)
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

  function dispose(): void {
    disposed = true
    outputListeners = []
    exitListeners = []
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
    dispose,
    getRecentOutput,
    setSshAuthBridge: (bridge: SshAuthBridge | null) => { sshAuthBridge = bridge },
  }
}
