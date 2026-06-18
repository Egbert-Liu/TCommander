import { useAppStore } from '../store'
import type { Session, SshSessionConfig } from '../types'

interface CreateSessionInput {
  name: string
  kind?: 'local' | 'ssh'
  terminalType?: 'powershell' | 'cmd' | 'bash'
  cwd?: string
  initialCommand?: string
  groupId?: string
  /** 重置场景沿用原会话的快捷操作；默认用全局 defaultQuickActions */
  quickActions?: string[]
  /** SSH 表单输入（仅 kind==='ssh'）；明文密码/口令在此传入，落地前转存 safeStorage */
  ssh?: {
    host: string
    port?: number
    username: string
    authMethod: 'password' | 'privateKey'
    password?: string
    privateKeyPath?: string
    passphrase?: string
  }
  /**
   * 重连场景：复用已有 sshConfig（含 secret 引用）。
   * 提供时跳过表单→secret 流程，直接用引用创建会话。
   */
  existingSshConfig?: SshSessionConfig
}

/**
 * 把用户输入的工作目录规整为 pty.spawn 可用的绝对路径：
 * - undefined / 空字符串 / 单独的 '~' → 返回 undefined（由 pty.ts 走 os.homedir()）
 * - 其他原样返回（绝对路径、相对路径等）
 *
 * 历史 Bug：之前 quick-create 传 cwd='~'，Windows 下 pty.spawn 抛 ENOENT，
 * 渲染进程 try/catch 后返回 null，前端就提示「创建会话失败，请重试」。
 * 这里显式丢弃裸 '~'，避免再被原样传给主进程。
 */
function normalizeCwd(cwd?: string): string | undefined {
  if (!cwd) return undefined
  const trimmed = cwd.trim()
  if (!trimmed) return undefined
  if (trimmed === '~') return undefined
  return trimmed
}

/**
 * 创建底层 PTY / SSH 会话并写入 store 的单点入口（消除多处创建会话样板）。
 * 成功返回新 Session；失败（无 sessionId 或异常）返回 null，由调用方决定提示。
 *
 * SSH 流程：
 * 1. 把表单中的明文密码 / 口令通过 secretSet 存入 safeStorage（OS 级加密）
 * 2. 构造只含引用的 sshConfig，传给主进程 createSession
 * 3. 主进程 SshBackend 通过引用从 safeStorage 取回明文用于认证
 */
export async function createSessionFromConfig(input: CreateSessionInput): Promise<Session | null> {
  try {
    const kind = input.kind || 'local'

    if (kind === 'ssh') {
      return await createSshSession(input)
    }

    return await createLocalSession(input)
  } catch {
    return null
  }
}

async function createLocalSession(input: CreateSessionInput): Promise<Session | null> {
  const terminalType = input.terminalType || 'powershell'
  const sessionId = await window.electronAPI.createSession({
    terminalType,
    cwd: normalizeCwd(input.cwd),
    initialCommand: input.initialCommand || undefined,
  })
  if (!sessionId) return null

  const session: Session = {
    id: sessionId,
    name: input.name,
    groupId: input.groupId,
    terminalType,
    cwd: input.cwd || '~',
    initialCommand: input.initialCommand || undefined,
    history: [],
    previewText: '',
    status: 'idle',
    quickActions: input.quickActions ?? [...useAppStore.getState().defaultQuickActions],
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    kind: 'local',
  }
  useAppStore.getState().addSession(session)
  return session
}

async function createSshSession(input: CreateSessionInput): Promise<Session | null> {
  const sshConfig: SshSessionConfig = input.existingSshConfig
    ? { ...input.existingSshConfig }
    : await buildSshConfigFromForm(input)

  const sessionId = await window.electronAPI.createSession({
    kind: 'ssh',
    ssh: sshConfig,
    cols: 160,
    rows: 40,
    initialCommand: input.initialCommand || undefined,
  })
  if (!sessionId) return null

  const session: Session = {
    id: sessionId,
    name: input.name,
    groupId: input.groupId,
    terminalType: 'bash',
    cwd: '~',
    initialCommand: input.initialCommand || undefined,
    history: [],
    previewText: '',
    status: 'idle',
    quickActions: input.quickActions ?? [...useAppStore.getState().defaultQuickActions],
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    kind: 'ssh',
    sshConfig,
    connectionStatus: 'connecting',
  }
  useAppStore.getState().addSession(session)
  return session
}

/**
 * 从表单输入构造 SshSessionConfig：
 * 把明文 password / passphrase 存入 safeStorage，返回只含引用的配置。
 */
async function buildSshConfigFromForm(input: CreateSessionInput): Promise<SshSessionConfig> {
  const ssh = input.ssh!
  const cfg: SshSessionConfig = {
    host: ssh.host,
    port: ssh.port || 22,
    username: ssh.username,
    authMethod: ssh.authMethod,
  }

  if (ssh.authMethod === 'password' && ssh.password) {
    const ref = `pwd-${ssh.host}-${ssh.username}-${Date.now()}`
    await window.electronAPI.secretSet(ref, ssh.password)
    cfg.passwordRef = ref
  }

  if (ssh.authMethod === 'privateKey') {
    cfg.privateKeyPath = ssh.privateKeyPath
    if (ssh.passphrase) {
      const ref = `pp-${ssh.host}-${ssh.username}-${Date.now()}`
      await window.electronAPI.secretSet(ref, ssh.passphrase)
      cfg.passphraseRef = ref
    }
  }

  return cfg
}
