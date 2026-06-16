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
 * 创建底层 PTY 会话并写入 store 的单点入口（消除多处创建会话样板）。
 * 成功返回新 Session；失败（无 sessionId 或异常）返回 null，由调用方决定提示。
 */
export async function createSessionFromConfig(input: CreateSessionInput): Promise<Session | null> {
  try {
    const sessionId = await window.electronAPI.createSession({
      terminalType: input.terminalType,
      cwd: normalizeCwd(input.cwd),
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
