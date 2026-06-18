/**
 * SSH 远程终端后端：基于 ssh2 的 Client.shell() 通道实现 TerminalBackend。
 *
 * 生命周期：
 * 1. 构造（同步）：仅记录配置，不发起连接
 * 2. start()（异步）：client.connect() → 'ready' → client.shell() → 拿到 stream → resolve
 *    - 连接阶段错误 → reject（由调用方通过 session-exit + 错误文本回传）
 *    - 连接后错误（网络中断等）→ 静默，由 'close' 兜底触发 onExit
 * 3. 运行期：stream.on('data') → onData 回调；stream.setWindow → resize
 * 4. kill()：stream.end() + client.end() → 触发 onExit
 *
 * 认证支持（Task 5）：password / privateKey
 * keyboard-interactive 与 known_hosts 首连确认留给 Task 11（需 main→renderer 请求-响应通道）。
 */

import { Client } from 'ssh2'
import { readFileSync } from 'fs'
import type { TerminalBackend, SshConfig } from '../types'
import { secretStorage } from '../secretStorage'

export class SshBackend implements TerminalBackend {
  private client = new Client()
  private stream: any = null
  private dataCbs = new Set<(data: string) => void>()
  private exitCbs = new Set<() => void>()
  private closed = false

  constructor(private cfg: SshConfig) {}

  /**
   * 发起连接 + 认证 + 开 shell 通道。
   * resolved 后才开始有数据；rejected 表示连接/认证失败。
   */
  async start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false

      this.client.once('ready', () => {
        if (settled) return
        this.client.shell(
          {
            term: 'xterm-256color',
            cols: this.cfg.cols || 160,
            rows: this.cfg.rows || 40,
          },
          (err, stream) => {
            if (settled) return
            if (err) {
              settled = true
              reject(err)
              return
            }
            this.stream = stream
            stream.on('data', (d: Buffer) => {
              this.dataCbs.forEach((cb) => cb(d.toString('utf8')))
            })
            stream.on('close', () => this.handleExit())
            settled = true
            resolve()
          }
        )
      })

      // 连接阶段错误 → reject；连接后错误（网络中断）静默，由 close 兜底。
      this.client.on('error', (err: Error) => {
        if (!settled) {
          settled = true
          reject(err)
        }
      })

      this.client.on('close', () => this.handleExit())

      const connectOpts: Record<string, unknown> = {
        host: this.cfg.host,
        port: this.cfg.port || 22,
        username: this.cfg.username,
        readyTimeout: this.cfg.readyTimeout || 20000,
      }

      if (this.cfg.authMethod === 'password') {
        connectOpts.password = this.cfg.passwordRef
          ? (secretStorage.get(this.cfg.passwordRef) || '')
          : ''
      } else if (this.cfg.authMethod === 'privateKey') {
        try {
          connectOpts.privateKey = readFileSync(this.cfg.privateKeyPath!)
        } catch (e) {
          reject(new Error(`读取私钥失败: ${(e as Error).message}`))
          return
        }
        if (this.cfg.passphraseRef) {
          connectOpts.passphrase = secretStorage.get(this.cfg.passphraseRef) || ''
        }
      }

      this.client.connect(connectOpts as any)
    })
  }

  private handleExit(): void {
    if (this.closed) return
    this.closed = true
    this.exitCbs.forEach((cb) => cb())
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
      this.stream?.write(data)
    } catch {
      // 通道可能已关闭
    }
  }

  resize(cols: number, rows: number): void {
    // ssh2 的 setWindow 签名：(rows, cols, height, width)
    try {
      this.stream?.setWindow(rows, cols, 0, 0)
    } catch {
      // 通道可能已关闭
    }
  }

  kill(): void {
    try {
      this.stream?.end()
    } catch {
      // ignore
    }
    try {
      this.client.end()
    } catch {
      // ignore
    }
    this.handleExit()
  }
}
