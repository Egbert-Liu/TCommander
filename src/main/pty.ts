import * as pty from 'node-pty'
import os from 'os'

interface SessionConfig {
  terminalType: 'powershell' | 'cmd' | 'bash'
  cwd?: string
  initialCommand?: string
  cols?: number
  rows?: number
}

interface PtySession {
  id: string
  ptyProcess: pty.IPty
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

  function getShellPath(type: string): string {
    if (os.platform() === 'win32') {
      switch (type) {
        case 'powershell':
          return 'powershell.exe'
        case 'cmd':
          return 'cmd.exe'
        default:
          return 'powershell.exe'
      }
    } else {
      switch (type) {
        case 'bash':
          return 'bash'
        default:
          return process.env.SHELL || 'bash'
      }
    }
  }

  function appendToRing(buf: string, chunk: string, cap: number): string {
    if (cap <= 0) return ''
    const next = buf + chunk
    if (next.length <= cap) return next
    // 超出容量时截掉头部，保留尾部 cap 个字符。
    return next.slice(next.length - cap)
  }

  function createSession(config: SessionConfig): string {
    if (disposed) return ''

    const id = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const shell = getShellPath(config.terminalType)
    // 兜底：把空、纯 '~'、相对路径 '~' 统一归到用户主目录，
    // 防止 Windows 下 pty.spawn 因为 '~' 不存在而抛 ENOENT。
    let cwd = config.cwd && config.cwd.trim() && config.cwd !== '~'
      ? config.cwd
      : os.homedir()

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: config.cols || 160,
      rows: config.rows || 40,
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        LANG: 'en_US.UTF-8'
      }
    })

    const session: PtySession = {
      id,
      ptyProcess,
      config,
      destroyed: false,
      ringBuf: '',
      ringBufMax: MAIN_RING_BUFFER_MAX,
    }

    ptyProcess.onData((data) => {
      if (session.destroyed || disposed) return
      // 主进程 ring buffer：append-and-trim，避免内存堆积
      session.ringBuf = appendToRing(session.ringBuf, data, session.ringBufMax)
      outputListeners.forEach((listener) => listener(id, data))
    })

    ptyProcess.onExit(({ exitCode }) => {
      if (disposed) return
      session.destroyed = true
      sessions.delete(id)
      exitListeners.forEach((listener) => listener(id, exitCode || 0))
    })

    sessions.set(id, session)

    if (config.initialCommand) {
      let sent = false
      const sendCommand = () => {
        if (sent || session.destroyed || disposed) return
        sent = true
        try {
          ptyProcess.write(config.initialCommand! + '\r')
        } catch {
          // PTY 可能已被系统回收
        }
      }
      const disposable = ptyProcess.onData(() => {
        sendCommand()
        try { disposable.dispose() } catch { /* ignore */ }
      })
      setTimeout(() => {
        try { disposable.dispose() } catch { /* ignore */ }
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
        session.ptyProcess.write(data)
      } catch {
        // PTY 可能已被系统回收
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
        session.ptyProcess.kill()
      } catch {
        // PTY 可能已被系统回收
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
        session.ptyProcess.resize(cols, rows)
      } catch {
        // PTY 可能已被系统回收
      }
    }
  }

  function closeAllSessions(): void {
    sessions.forEach((session) => {
      session.destroyed = true
      try {
        session.ptyProcess.kill()
      } catch {
        // PTY 可能已被系统回收
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
        session.ptyProcess.kill()
      } catch {
        // PTY 可能已被系统回收
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
  }
}
