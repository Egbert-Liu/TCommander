import { create } from 'zustand'
import { Session, Group, Preset, Snapshot, SessionStatus } from '../types'
import { detectStatus, truncateHistory, stripAnsi } from '../utils/statusDetector'

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
  toggleDarkMode: () => void
  
  filteredSessions: Session[]
}

export const useAppStore = create<AppState>((set, get) => ({
  sessions: [],
  groups: [],
  presets: [],
  snapshots: [],
  activeSessionId: null,
  searchQuery: '',
  selectedGroupId: null,
  isFullscreen: false,
  darkMode: true,
  
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
  
  addGroup: (group) => set((state) => ({
    groups: [...state.groups, group]
  })),
  
  updateGroup: (id, updates) => set((state) => ({
    groups: state.groups.map(g => g.id === id ? { ...g, ...updates } : g)
  })),
  
  removeGroup: (id) => set((state) => ({
    groups: state.groups.filter(g => g.id !== id)
  })),
  
  addPreset: (preset) => set((state) => ({
    presets: [...state.presets, preset]
  })),
  
  updatePreset: (id, updates) => set((state) => ({
    presets: state.presets.map(p => p.id === id ? { ...p, ...updates } : p)
  })),
  
  removePreset: (id) => set((state) => ({
    presets: state.presets.filter(p => p.id !== id)
  })),
  
  addSnapshot: (snapshot) => set((state) => ({
    snapshots: [...state.snapshots, snapshot]
  })),
  
  updateSnapshot: (id, updates) => set((state) => ({
    snapshots: state.snapshots.map(s => s.id === id ? { ...s, ...updates } : s)
  })),
  
  removeSnapshot: (id) => set((state) => ({
    snapshots: state.snapshots.filter(s => s.id !== id)
  })),
  
  setSearchQuery: (query) => set({ searchQuery: query }),
  
  setSelectedGroupId: (id) => set({ selectedGroupId: id }),
  
  setIsFullscreen: (fullscreen) => set({ isFullscreen: fullscreen }),
  
  toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
  
  get filteredSessions() {
    const state = get()
    let filtered = state.sessions
    
    if (state.searchQuery) {
      const query = state.searchQuery.toLowerCase()
      filtered = filtered.filter(s => 
        s.name.toLowerCase().includes(query)
      )
    }
    
    if (state.selectedGroupId) {
      filtered = filtered.filter(s => s.groupId === state.selectedGroupId)
    }
    
    return filtered.sort((a, b) => a.createdAt - b.createdAt)
  }
}))
