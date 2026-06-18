export type SessionStatus = 'idle' | 'needs-input' | 'needs-confirm' | 'error' | 'running'

export type TriggerType = 'contains' | 'equals' | 'regex' | 'startsWith' | 'endsWith'

export interface TriggerRule {
  id: string
  name: string
  triggerType: TriggerType
  pattern: string
  status: SessionStatus
  enabled: boolean
  isSystem: boolean
  caseSensitive: boolean
  description?: string
}

/**
 * SSH 连接配置（渲染层视图）。
 * 密码/口令的明文绝不落盘，passwordRef / passphraseRef 是 safeStorage 的查找键。
 * 用于卡片展示连接信息 + 重连时把引用回传给主进程。
 */
export interface SshSessionConfig {
  host: string
  port: number
  username: string
  authMethod: 'password' | 'privateKey' | 'keyboard-interactive'
  privateKeyPath?: string
  passwordRef?: string
  passphraseRef?: string
}

export interface Session {
  id: string
  name: string
  groupId?: string
  terminalType: 'powershell' | 'cmd' | 'bash'
  cwd: string
  initialCommand?: string
  history: string[]
  previewText: string
  status: SessionStatus
  matchedRuleName?: string
  quickActions: string[]
  createdAt: number
  lastActivityAt: number
  /** 会话类型：local=本地 PTY，ssh=远程 SSH。缺省按 local 处理（向后兼容）。 */
  kind?: 'local' | 'ssh'
  /** SSH 连接配置（仅 kind==='ssh'）。不含明文密钥，只存 safeStorage 引用。 */
  sshConfig?: SshSessionConfig
}

export interface Group {
  id: string
  name: string
  color: string
  order: number
}

export interface Preset {
  id: string
  name: string
  terminalType: 'powershell' | 'cmd' | 'bash'
  cwd: string
  initialCommand?: string
  groupId?: string
  kind?: 'local' | 'ssh'
  sshConfig?: SshSessionConfig
}

export interface Snapshot {
  id: string
  name: string
  description?: string
  data: SnapshotData
  createdAt: number
}

export interface SnapshotData {
  sessions: Array<{
    name: string
    groupId?: string
    terminalType: string
    cwd: string
    initialCommand?: string
    history: string[]
  }>
  groups: Group[]
}
