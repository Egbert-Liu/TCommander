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
