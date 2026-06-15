import { useAppStore } from '../store'
import type { Session } from '../types'

interface CreateSessionInput {
  name: string
  terminalType: 'powershell' | 'cmd' | 'bash'
  cwd?: string
  initialCommand?: string
  groupId?: string
  /** 重置场景沿用原会话的快捷操作；默认用全局 defaultQuickActions */
  quickActions?: string[]
}

/**
 * 创建底层 PTY 会话并写入 store 的单点入口（消除多处创建会话样板）。
 * 成功返回新 Session；失败（无 sessionId 或异常）返回 null，由调用方决定提示。
 */
export async function createSessionFromConfig(input: CreateSessionInput): Promise<Session | null> {
  try {
    const sessionId = await window.electronAPI.createSession({
      terminalType: input.terminalType,
      cwd: input.cwd || undefined,
      initialCommand: input.initialCommand || undefined,
    })
    if (!sessionId) return null

    const session: Session = {
      id: sessionId,
      name: input.name,
      groupId: input.groupId,
      terminalType: input.terminalType,
      cwd: input.cwd || '~',
      initialCommand: input.initialCommand || undefined,
      history: [],
      previewText: '',
      status: 'idle',
      quickActions: input.quickActions ?? [...useAppStore.getState().defaultQuickActions],
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    }
    useAppStore.getState().addSession(session)
    return session
  } catch {
    return null
  }
}
