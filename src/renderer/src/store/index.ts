import { create } from 'zustand'
import { Session, Group, Preset, Snapshot } from '../types'

interface AppState {
  sessions: Session[]
  groups: Group[]
  presets: Preset[]
  snapshots: Snapshot[]
  activeSessionId: string | null
  searchQuery: string
  selectedGroupId: string | null
  isFullscreen: boolean
  darkMode: boolean
  previewLineCount: number
  quickActions: string[]
  
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
  
  setSearchQuery: (query: string) => void
  setSelectedGroupId: (id: string | null) => void
  setIsFullscreen: (fullscreen: boolean) => void
  setPreviewLineCount: (count: number) => void
  setQuickActions: (actions: string[]) => void
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
  activeSessionId: null,
  searchQuery: '',
  selectedGroupId: null,
  isFullscreen: false,
  darkMode: true,
  previewLineCount: 20,
  quickActions: ['Y', 'N', 'CtrlC', 'Up', 'Down', 'Input', 'Send', 'Enter'],
  
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
    // Clear orphaned groupId from sessions that belonged to this group
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
  
  setSearchQuery: (query) => set({ searchQuery: query }),
  
  setSelectedGroupId: (id) => set({ selectedGroupId: id }),
  
  setIsFullscreen: (fullscreen) => set({ isFullscreen: fullscreen }),
  
  setPreviewLineCount: (count) => set({ previewLineCount: count }),
  
  setQuickActions: (actions) => set({ quickActions: actions }),
  
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
