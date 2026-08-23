import { create } from 'zustand'
import { Session, Group, Preset, Snapshot, TriggerRule, TranscriptEntry } from '../types'
import { DEFAULT_SYSTEM_RULES } from '../utils/statusDetector'
import { TERMINAL_THEMES } from '../utils/terminalThemes'
import { sortSessions } from '../utils/sessionSort'
import { terminalPool } from '../utils/terminalPool'

interface AppState {
  sessions: Session[]
  groups: Group[]
  presets: Preset[]
  snapshots: Snapshot[]
  rules: TriggerRule[]
  activeSessionId: string | null
  searchQuery: string
  selectedGroupId: string | null
  statusFilter: string[]
  isFullscreen: boolean
  darkMode: boolean
  previewLineCount: number
  defaultQuickActions: string[]
  terminalTheme: string  // 终端主题 ID
  /** 全屏终端字号（用户可调，卡片模式按比例缩小跟随） */
  terminalFontSize: number
  /** 终端字体族（CSS font-family 字符串） */
  terminalFontFamily: string
  markdownEnabled: boolean  // 终端实时 Markdown 渲染层开关（卡片/全屏共用）
  /** Claude Code transcript 对话流（sessionId → 条目数组，全屏 MD 模式数据源） */
  claudeTranscripts: Record<string, TranscriptEntry[]>
  /** 系统通知设置 */
  notificationEnabled: boolean
  notificationSoundEnabled: boolean
  /** 侧边栏树排序方式 */
  sidebarSortMode: SidebarSortMode

  addSession: (session: Session) => void
  updateSession: (id: string, updates: Partial<Session>) => void
  removeSession: (id: string) => void
  setActiveSession: (id: string | null) => void

  addGroup: (group: Group) => void
  updateGroup: (id: string, updates: Partial<Group>) => void
  removeGroup: (id: string) => void

  addPreset: (preset: Preset) => void
  updatePreset: (id: string, updates: Partial<Preset>) => void
  removePreset: (id: string) => void

  addSnapshot: (snapshot: Snapshot) => void
  updateSnapshot: (id: string, updates: Partial<Snapshot>) => void
  removeSnapshot: (id: string) => void

  setRules: (rules: TriggerRule[]) => void
  addRule: (rule: TriggerRule) => void
  updateRule: (id: string, updates: Partial<TriggerRule>) => void
  removeRule: (id: string) => void

  setSearchQuery: (query: string) => void
  setSelectedGroupId: (id: string | null) => void
  setStatusFilter: (statuses: string[]) => void
  setIsFullscreen: (fullscreen: boolean) => void
  setPreviewLineCount: (count: number) => void
  toggleDarkMode: () => void
  setDarkMode: (dark: boolean) => void
  setTerminalTheme: (themeId: string) => void
  setTerminalFontSize: (size: number) => void
  setTerminalFontFamily: (family: string) => void
  setMarkdownEnabled: (enabled: boolean) => void
  appendClaudeTranscript: (sessionId: string, entries: TranscriptEntry[]) => void
  setPresets: (presets: Preset[]) => void
  setGroups: (groups: Group[]) => void
  setSnapshots: (snapshots: Snapshot[]) => void
  setNotificationEnabled: (enabled: boolean) => void
  setNotificationSoundEnabled: (enabled: boolean) => void
  setSidebarSortMode: (mode: SidebarSortMode) => void

  // 全局 loading 蒙板：用于关闭应用/关闭会话等需要等待 PTY 资源释放的场景
  globalLoading: { open: boolean; text: string }
  setGlobalLoading: (open: boolean, text?: string) => void
}

/** 侧边栏树排序方式：状态优先（默认）/ 最近活动 / 最新创建 / 名称 */
export type SidebarSortMode = 'status' | 'recent' | 'created' | 'name'

/** 侧边栏排序选项（Sidebar 排序下拉用）：value 与 SidebarSortMode 一一对应 */
export const SIDEBAR_SORT_OPTIONS: Array<{ value: SidebarSortMode; label: string }> = [
  { value: 'status', label: '状态优先' },
  { value: 'recent', label: '最近活动' },
  { value: 'created', label: '最新创建' },
  { value: 'name', label: '名称' },
]

/** 侧边栏树排序：status 走公共 sortSessions（状态+防抖），其余按对应键排 */
export function sortSessionsForSidebar(sessions: Session[], mode: SidebarSortMode): Session[] {
  if (mode === 'status') return sortSessions(sessions)
  const byRecent = (a: Session, b: Session) =>
    (b.stableActivityAt ?? b.lastActivityAt ?? b.createdAt) - (a.stableActivityAt ?? a.lastActivityAt ?? a.createdAt)
  const byCreated = (a: Session, b: Session) => b.createdAt - a.createdAt
  const byName = (a: Session, b: Session) => a.name.localeCompare(b.name, 'zh-Hans-CN')
  const cmp = mode === 'recent' ? byRecent : mode === 'created' ? byCreated : byName
  return [...sessions].sort(cmp)
}

/** 按当前明暗主题同步原生窗口控制按钮（最小化/最大化/关闭）的底色与符号色 */
function applyTitleBarOverlay(dark: boolean) {
  window.electronAPI?.setTitleBarOverlay(
    dark
      ? { color: '#000000', symbolColor: '#ffffff' }
      : { color: '#ffffff', symbolColor: '#000000' }
  )
}

/** transcript 条目全局递增 id 序列（React key 用，见 appendClaudeTranscript） */
let transcriptIdSeq = 0

export const useAppStore = create<AppState>((set) => ({
  sessions: [],
  groups: [],
  presets: [],
  snapshots: [],
  rules: DEFAULT_SYSTEM_RULES,
  activeSessionId: null,
  searchQuery: '',
  selectedGroupId: null,
  statusFilter: [],
  isFullscreen: false,
  darkMode: true,
  terminalTheme: 'github-dark',
  terminalFontSize: 13,
  terminalFontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace",
  previewLineCount: 15,
  defaultQuickActions: ['Y', 'N', 'CtrlC', 'Up', 'Down', 'Input', 'Send', 'Enter'],
  markdownEnabled: false,
  claudeTranscripts: {},
  notificationEnabled: true,
  notificationSoundEnabled: true,
  sidebarSortMode: 'status',

  addSession: (session) => set((state) => ({
    sessions: [...state.sessions, { ...session, stableActivityAt: session.stableActivityAt ?? session.lastActivityAt ?? Date.now() }]
  })),

  updateSession: (id, updates) => set((state) => ({
    sessions: state.sessions.map(s => s.id === id ? { ...s, ...updates } : s)
  })),

  removeSession: (id) => set((state) => {
    // 顺带清理该会话的 transcript 对话流，避免长期运行内存增长
    const { [id]: _removed, ...restTranscripts } = state.claudeTranscripts
    return {
      sessions: state.sessions.filter(s => s.id !== id),
      activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
      claudeTranscripts: restTranscripts
    }
  }),

  setActiveSession: (id) => set({ activeSessionId: id }),

  addGroup: (group) => set((state) => {
    const groups = [...state.groups, group]
    window.electronAPI?.storageSet('groups', groups)
    return { groups }
  }),

  updateGroup: (id, updates) => set((state) => {
    const groups = state.groups.map(g => g.id === id ? { ...g, ...updates } : g)
    window.electronAPI?.storageSet('groups', groups)
    return { groups }
  }),

  removeGroup: (id) => set((state) => {
    const groups = state.groups.filter(g => g.id !== id)
    window.electronAPI?.storageSet('groups', groups)
    const sessions = state.sessions.map(s =>
      s.groupId === id ? { ...s, groupId: undefined } : s
    )
    return { groups, sessions }
  }),

  addPreset: (preset) => set((state) => {
    const presets = [...state.presets, preset]
    window.electronAPI?.storageSet('presets', presets)
    return { presets }
  }),

  updatePreset: (id, updates) => set((state) => {
    const presets = state.presets.map(p => p.id === id ? { ...p, ...updates } : p)
    window.electronAPI?.storageSet('presets', presets)
    return { presets }
  }),

  removePreset: (id) => set((state) => {
    const presets = state.presets.filter(p => p.id !== id)
    window.electronAPI?.storageSet('presets', presets)
    return { presets }
  }),

  addSnapshot: (snapshot) => set((state) => {
    const snapshots = [...state.snapshots, snapshot]
    window.electronAPI?.storageSet('snapshots', snapshots)
    return { snapshots }
  }),

  updateSnapshot: (id, updates) => set((state) => {
    const snapshots = state.snapshots.map(s => s.id === id ? { ...s, ...updates } : s)
    window.electronAPI?.storageSet('snapshots', snapshots)
    return { snapshots }
  }),

  removeSnapshot: (id) => set((state) => {
    const snapshots = state.snapshots.filter(s => s.id !== id)
    window.electronAPI?.storageSet('snapshots', snapshots)
    return { snapshots }
  }),

  setRules: (rules) => {
    window.electronAPI?.storageSet('rules', rules)
    return set({ rules })
  },

  addRule: (rule) => set((state) => {
    const rules = [...state.rules, rule]
    window.electronAPI?.storageSet('rules', rules)
    return { rules }
  }),

  updateRule: (id, updates) => set((state) => {
    const rules = state.rules.map(r => r.id === id ? { ...r, ...updates } : r)
    window.electronAPI?.storageSet('rules', rules)
    return { rules }
  }),

  removeRule: (id) => set((state) => {
    const rules = state.rules.filter(r => r.id !== id)
    window.electronAPI?.storageSet('rules', rules)
    return { rules }
  }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setSelectedGroupId: (id) => set({ selectedGroupId: id }),

  setStatusFilter: (statuses) => set({ statusFilter: statuses }),

  setIsFullscreen: (fullscreen) => set({ isFullscreen: fullscreen }),

  setPreviewLineCount: (count) => set({ previewLineCount: count }),

  toggleDarkMode: () => set((state) => {
    const newDark = !state.darkMode
    window.electronAPI?.storageSet('darkMode', newDark)
    applyTitleBarOverlay(newDark)
    // 自动同步终端主题：当前终端主题与新模式不匹配时，切换到对应分组的默认主题
    const currentTheme = TERMINAL_THEMES.find(t => t.id === state.terminalTheme)
    const currentGroup = currentTheme?.group ?? 'dark'
    let newTerminalTheme = state.terminalTheme
    if ((newDark && currentGroup === 'light') || (!newDark && currentGroup === 'dark')) {
      const targetGroup = newDark ? 'dark' : 'light'
      const fallback = TERMINAL_THEMES.find(t => t.group === targetGroup)
      if (fallback) {
        newTerminalTheme = fallback.id
        window.electronAPI?.storageSet('terminalTheme', newTerminalTheme)
      }
    }
    return { darkMode: newDark, terminalTheme: newTerminalTheme }
  }),

  setDarkMode: (dark) => {
    applyTitleBarOverlay(dark)
    return set({ darkMode: dark })
  },

  setTerminalTheme: (themeId) => {
    window.electronAPI?.storageSet('terminalTheme', themeId)
    return set({ terminalTheme: themeId })
  },

  // 终端字号/字体：写入 store + 持久化 + 热更新池中所有 xterm 实例（见 terminalPool）
  setTerminalFontSize: (size) => {
    const clamped = Math.min(28, Math.max(8, Math.round(size)))
    window.electronAPI?.storageSet('terminalFontSize', clamped)
    terminalPool.setFontSize(clamped)
    return set({ terminalFontSize: clamped })
  },

  setTerminalFontFamily: (family) => {
    window.electronAPI?.storageSet('terminalFontFamily', family)
    terminalPool.setFontFamily(family)
    return set({ terminalFontFamily: family })
  },

  setMarkdownEnabled: (enabled) => {
    window.electronAPI?.storageSet('markdownEnabled', enabled)
    return set({ markdownEnabled: enabled })
  },

  // 追加 transcript 条目：主进程 transcriptManager 增量推送。
  // - 渲染层为每条分配全局递增 id（React key 用）：500 条截断时若用 index 作 key
  //   会导致所有条目 key 错位 → 全量 remount → ReactMarkdown 全部重解析
  // - 上限保护：超长会话仅保留最新条目（MD 视图是「最近对话」语义）
  appendClaudeTranscript: (sessionId, entries) => {
    if (entries.length === 0) return
    set((state) => {
      const withIds = entries.map(e => ({ ...e, id: ++transcriptIdSeq }))
      const merged = [...(state.claudeTranscripts[sessionId] ?? []), ...withIds]
      const MAX_ENTRIES = 500
      const trimmed = merged.length > MAX_ENTRIES ? merged.slice(merged.length - MAX_ENTRIES) : merged
      return { claudeTranscripts: { ...state.claudeTranscripts, [sessionId]: trimmed } }
    })
  },

  setPresets: (presets) => set({ presets }),
  setGroups: (groups) => set({ groups }),
  setSnapshots: (snapshots) => set({ snapshots }),
  setNotificationEnabled: (enabled) => set({ notificationEnabled: enabled }),
  setNotificationSoundEnabled: (enabled) => set({ notificationSoundEnabled: enabled }),
  setSidebarSortMode: (mode) => {
    window.electronAPI?.storageSet('sidebarSortMode', mode)
    return set({ sidebarSortMode: mode })
  },
  globalLoading: { open: false, text: '' },
  setGlobalLoading: (open, text = '') => set({ globalLoading: { open, text } }),
}))
