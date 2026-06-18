/**
 * 本地 PTY 后端：把现有 pty.spawn 逻辑封装为 TerminalBackend 实现。
 *
 * 严格保留 pty.ts 原有的 shell 选择、cwd 兜底、env 注入、尺寸默认值等行为，
 * 以确保重构后本地会话零回归。SshBackend 复用同一套订阅/写入接口即可接入。
 */

import * as pty from 'node-pty'
import os from 'os'
import type { TerminalBackend } from '../types'

function getShellPath(terminalType: string): string {
  if (os.platform() === 'win32') {
    switch (terminalType) {
      case 'powershell':
        return 'powershell.exe'
      case 'cmd':
        return 'cmd.exe'
      default:
        return 'powershell.exe'
    }
  } else {
    switch (terminalType) {
      case 'bash':
        return 'bash'
      default:
        return process.env.SHELL || 'bash'
    }
  }
}

export interface LocalPtyOptions {
  terminalType?: 'powershell' | 'cmd' | 'bash'
  cwd?: string
  cols?: number
  rows?: number
}

export class LocalPtyBackend implements TerminalBackend {
  private proc: pty.IPty
  private dataCbs = new Set<(data: string) => void>()
  private exitCbs = new Set<() => void>()

  constructor(opts: LocalPtyOptions) {
    const shell = getShellPath(opts.terminalType || 'powershell')
    // 兜底：把空、纯 '~'、相对路径 '~' 统一归到用户主目录，
    // 防止 Windows 下 pty.spawn 因为 '~' 不存在而抛 ENOENT。
    const cwd = opts.cwd && opts.cwd.trim() && opts.cwd !== '~'
      ? opts.cwd
      : os.homedir()

    this.proc = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: opts.cols || 160,
      rows: opts.rows || 40,
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        LANG: 'en_US.UTF-8',
      },
    })

    this.proc.onData((data) => {
      this.dataCbs.forEach((cb) => cb(data))
    })
    this.proc.onExit(() => {
      this.exitCbs.forEach((cb) => cb())
    })
  }

  onData(cb: (data: string) => void): () => void {
    this.dataCbs.add(cb)
    return () => {
      this.dataCbs.delete(cb)
    }
  }

  onExit(cb: () => void): () => void {
    this.exitCbs.add(cb)
    return () => {
      this.exitCbs.delete(cb)
    }
  }

  write(data: string): void {
    try {
      this.proc.write(data)
    } catch {
      // PTY 可能已被系统回收
    }
  }

  resize(cols: number, rows: number): void {
    try {
      this.proc.resize(cols, rows)
    } catch {
      // 进程已退出时忽略
    }
  }

  kill(): void {
    try {
      this.proc.kill()
    } catch {
      // PTY 可能已被系统回收
    }
  }
}
