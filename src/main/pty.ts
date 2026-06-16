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
}

export function createPtyManager() {
  const sessions = new Map<string, PtySession>()
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

    const session: PtySession = { id, ptyProcess, config, destroyed: false }

    ptyProcess.onData((data) => {
      if (session.destroyed || disposed) return
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
    resizeSession,
    closeAllSessions,
    onOutput,
    onExit,
    dispose,
  }
}
