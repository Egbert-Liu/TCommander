/**
 * 终端后端抽象与会话配置类型定义。
 *
 * 通过 TerminalBackend 接口，让本地 PTY（node-pty）与远程 SSH（ssh2）共用
 * 同一套 PtySession 外壳：渲染层与 IPC 层对「会话类型」完全无感知，
 * 只要后端实现 onData/onExit/write/resize/kill 五个方法即可接入。
 */

/**
 * 终端后端抽象接口。本地 PTY 与 SSH 通道都实现此接口。
 *
 * 设计意图：PtySession 持有 backend 而非具体进程对象，createSession 按
 * config.kind 选择后端实现。这样 ringBuf、listeners、IPC 桥接代码完全复用，
 * 新增后端类型只需实现本接口。
 */
export interface TerminalBackend {
  /**
   * 订阅输出数据（含 ANSI 转义序列）。
   * @returns 取消订阅函数
   */
  onData(cb: (data: string) => void): () => void

  /**
   * 订阅后端结束。
   * 本地：进程退出；SSH：通道/连接关闭。
   * @returns 取消订阅函数
   */
  onExit(cb: () => void): () => void

  /**
   * 写入用户输入（含 \r \x03 \x1b[A 等控制序列）。
   */
  write(data: string): void

  /**
   * 调整伪终端尺寸。
   */
  resize(cols: number, rows: number): void

  /**
   * 终止后端。
   * 本地：kill 进程；SSH：关闭通道与连接。
   */
  kill(): void
}

/**
 * SSH 连接配置（不含敏感字段明文，敏感字段单独走 secretStorage 加密存储）。
 */
export interface SshConfig {
  host: string
  port: number
  username: string

  /** 认证方式 */
  authMethod: 'password' | 'privateKey' | 'keyboard-interactive'

  /** 私钥时：私钥文件路径 */
  privateKeyPath?: string

  /** 私钥 passphrase 引用（实际值存于 secretStorage，这里只存查找 key） */
  passphraseRef?: string

  /** 密码引用（实际值存于 secretStorage，这里只存查找 key） */
  passwordRef?: string

  /** known_hosts 校验策略：accept=首连提示后接受并记录，skip=跳过校验 */
  hostVerifier?: 'accept' | 'skip'

  /** 连接超时（毫秒），默认 20000 */
  readyTimeout?: number

  cols?: number
  rows?: number
}

/**
 * 会话配置：kind 默认 'local'，向后兼容现有调用（不传 kind 即本地会话）。
 *
 * local 与 ssh 字段互斥：local 用 terminalType/cwd/initialCommand，
 * ssh 用 ssh 字段。
 */
export interface SessionConfig {
  /** 会话类型，默认 'local' */
  kind?: 'local' | 'ssh'

  // —— local ——
  terminalType?: 'powershell' | 'cmd' | 'bash'
  cwd?: string
  initialCommand?: string

  // —— 通用 ——
  cols?: number
  rows?: number

  // —— ssh ——
  ssh?: SshConfig
}
