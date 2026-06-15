import type { SessionStatus } from '../types'

/**
 * 状态色单一来源：改这里即全局生效——
 * 1) JS 内联样式（STATUS_CONFIG / 空状态 / Toolbar 等）直接引用；
 * 2) 经 ThemeSync 注入为 --status-* CSS 变量，供脉冲动画 ::before 等使用。
 */
export const STATUS_COLORS: Record<SessionStatus, { color: string; bg: string }> = {
  error:           { color: '#f87171', bg: 'rgba(248, 113, 113, 0.10)' },
  'needs-confirm': { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.10)' },
  'needs-input':   { color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.10)' },
  running:         { color: '#34d399', bg: 'rgba(52, 211, 153, 0.10)' },
  idle:            { color: '#64748b', bg: 'rgba(100, 116, 139, 0.08)' },
}
