export type SessionStatus = 'idle' | 'needs-input' | 'needs-confirm' | 'error' | 'running'

export interface Session {
  id: string
  name: string
  groupId?: string
  terminalType: 'powershell' | 'cmd' | 'bash'
  cwd: string
  history: string[]
  status: SessionStatus
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
}

export interface Snapshot {
  id: string
  name: string
  data: SnapshotData
  createdAt: number
}

export interface SnapshotData {
  sessions: Array<{
    name: string
    groupId?: string
    terminalType: string
    cwd: string
    history: string[]
  }>
  groups: Group[]
}
