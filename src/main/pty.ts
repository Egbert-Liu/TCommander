import * as pty from 'node-pty'
import os from 'os'
import path from 'path'

interface SessionConfig {
  terminalType: 'powershell' | 'cmd' | 'bash'
  cwd?: string
  cols?: number
  rows?: number
}

interface PtySession {
  id: string
  ptyProcess: pty.IPty
  config: SessionConfig
}

export function createPtyManager() {
  const sessions = new Map<string, PtySession>()
  const outputListeners: Array<(sessionId: string, data: string) => void> = []
  const exitListeners: Array<(sessionId: string, exitCode: number) => void> = []

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
    const id = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const shell = getShellPath(config.terminalType)
    const cwd = config.cwd || os.homedir()
    
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: config.cols || 80,
      rows: config.rows || 24,
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        LANG: 'en_US.UTF-8'
      }
    })

    ptyProcess.onData((data) => {
      outputListeners.forEach((listener) => listener(id, data))
    })

    ptyProcess.onExit(({ exitCode }) => {
      sessions.delete(id)
      exitListeners.forEach((listener) => listener(id, exitCode || 0))
    })

    sessions.set(id, { id, ptyProcess, config })
    return id
  }

  function sendInput(sessionId: string, data: string): void {
    const session = sessions.get(sessionId)
    if (session) {
      session.ptyProcess.write(data)
    }
  }

  function closeSession(sessionId: string): void {
    const session = sessions.get(sessionId)
    if (session) {
      try {
        session.ptyProcess.kill()
      } catch (e) {
        console.error('Error killing session:', e)
      }
      sessions.delete(sessionId)
    }
  }

  function resizeSession(sessionId: string, cols: number, rows: number): void {
    const session = sessions.get(sessionId)
    if (session) {
      session.ptyProcess.resize(cols, rows)
    }
  }

  function closeAllSessions(): void {
    sessions.forEach((session) => {
      try {
        session.ptyProcess.kill()
      } catch (e) {
        console.error('Error killing session:', e)
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

  return {
    createSession,
    sendInput,
    closeSession,
    resizeSession,
    closeAllSessions,
    onOutput,
    onExit
  }
}
