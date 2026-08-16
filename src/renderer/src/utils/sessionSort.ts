/**
 * 会话排序公共函数
 *
 * 排序规则：
 *   1. 「有状态」(error/needs-confirm/needs-input) 的会话永远排最前，
 *      组内按严重程度排：error < needs-confirm < needs-input。
 *   2. 「无状态」(running/idle) 的会话排在所有有状态会话之后，
 *      组内按 stableActivityAt 倒序——仅状态转换时更新，避免持续输出会话互相换位（抖动）。
 *   3. 兜底：createdAt 升序 + id localeCompare，保证排序绝对稳定。
 */
import { Session } from '../types'
import { hasStatus, statusPriority } from './statusDetector'

export function sortSessions(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => {
    const aHas = hasStatus(a.status)
    const bHas = hasStatus(b.status)
    if (aHas && bHas) {
      const diff = statusPriority(a.status) - statusPriority(b.status)
      if (diff !== 0) return diff
    }
    if (aHas !== bHas) {
      return aHas ? -1 : 1
    }
    // 防抖关键：用 stableActivityAt 代替 lastActivityAt
    // stableActivityAt 仅在状态转换时更新，两个持续输出的 running 会话不会互相换位
    const aStable = a.stableActivityAt ?? a.lastActivityAt ?? a.createdAt
    const bStable = b.stableActivityAt ?? b.lastActivityAt ?? b.createdAt
    if (aStable !== bStable) return bStable - aStable
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt
    return a.id.localeCompare(b.id)
  })
}
