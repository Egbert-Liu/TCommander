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
  /** 稳定活动时间：仅在状态转换时更新，用于排序防抖（避免持续输出会话互相换位） */
  stableActivityAt: number
  /** 会话类型：local=本地 PTY，ssh=远程 SSH。缺省按 local 处理（向后兼容）。 */
  kind?: 'local' | 'ssh'
  /** SSH 连接配置（仅 kind==='ssh'）。不含明文密钥，只存 safeStorage 引用。 */
  sshConfig?: SshSessionConfig
  /** SSH 连接状态：connecting → ready/error。仅 ssh 会话有意义。 */
  connectionStatus?: 'connecting' | 'ready' | 'error'
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
  /** 优先级：数字越大优先级越高，默认为 0 */
  priority?: number
  /** 使用次数：每次从该预设创建会话时递增 */
  usageCount?: number
}

export interface Snapshot {
  id: string
  name: string
  description?: string
  data: SnapshotData
  createdAt: number
  /** 快照范围：'all'（全部会话/整个窗口）或 groupId（仅该组的会话）；旧快照缺省视为 'all' */
  scope?: 'all' | string
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

/**
 * Claude Code transcript 对话条目（与主进程 transcriptManager 输出一致）。
 * 全屏 MD 模式优先用该结构化数据渲染对话流，回退到终端字节流清洗。
 */
export interface TranscriptEntry {
  kind: 'user' | 'assistant' | 'tool-call' | 'tool-result'
  /** user/assistant 文本（Markdown）；tool-call 为输入摘要；tool-result 为结果摘要 */
  text: string
  /** tool-call / tool-result 的工具名 */
  toolName?: string
  /** tool-result 是否为错误 */
  isError?: boolean
  /** 记录时间戳（ms） */
  ts?: number
  /** 渲染层分配的稳定递增 id（React key）：避免 500 条截断时 index key 错位导致全量 remount */
  id?: number
}
