import { create } from 'zustand'
import { Session, Group, Preset, Snapshot, TriggerRule } from '../types'
import { DEFAULT_SYSTEM_RULES } from '../utils/statusDetector'

interface AppState {
  sessions: Session[]
  groups: Group[]
  presets: Preset[]
  snapshots: Snapshot[]
  rules: TriggerRule[]
  activeSessionId: string | null
  searchQuery: string
  selectedGroupId: string | null
  isFullscreen: boolean
  darkMode: boolean
  previewLineCount: number
  defaultQuickActions: string[]

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
  setIsFullscreen: (fullscreen: boolean) => void
  setPreviewLineCount: (count: number) => void
  toggleDarkMode: () => void
  setDarkMode: (dark: boolean) => void
  setPresets: (presets: Preset[]) => void
  setGroups: (groups: Group[]) => void
  setSnapshots: (snapshots: Snapshot[]) => void
}

export const useAppStore = create<AppState>((set) => ({
  sessions: [],
  groups: [],
  presets: [],
  snapshots: [],
  rules: DEFAULT_SYSTEM_RULES,
  activeSessionId: null,
  searchQuery: '',
  selectedGroupId: null,
  isFullscreen: false,
  darkMode: true,
  previewLineCount: 20,
  defaultQuickActions: ['Y', 'N', 'CtrlC', 'Up', 'Down', 'Input', 'Send', 'Enter'],

  addSession: (session) => set((state) => ({
    sessions: [...state.sessions, session]
  })),

  updateSession: (id, updates) => set((state) => ({
    sessions: state.sessions.map(s => s.id === id ? { ...s, ...updates } : s)
  })),

  removeSession: (id) => set((state) => ({
    sessions: state.sessions.filter(s => s.id !== id),
    activeSessionId: state.activeSessionId === id ? null : state.activeSessionId
  })),

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

  setIsFullscreen: (fullscreen) => set({ isFullscreen: fullscreen }),

  setPreviewLineCount: (count) => set({ previewLineCount: count }),

  toggleDarkMode: () => set((state) => {
    const newDark = !state.darkMode
    window.electronAPI?.storageSet('darkMode', newDark)
    return { darkMode: newDark }
  }),

  setDarkMode: (dark) => set({ darkMode: dark }),

  setPresets: (presets) => set({ presets }),

  setGroups: (groups) => set({ groups }),

  setSnapshots: (snapshots) => set({ snapshots }),
}))
