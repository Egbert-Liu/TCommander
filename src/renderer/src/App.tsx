import { useState, useMemo, useEffect, useRef } from 'react'
import { ConfigProvider, theme, Button } from 'antd'
import { PlusCircleFilled, CodeFilled } from '@ant-design/icons'
import { useAppStore } from './store'
import Sidebar from './components/Sidebar'
import Toolbar from './components/Toolbar'
import SessionCard from './components/SessionCard'
import FullscreenTerminal from './components/FullscreenTerminal'
import NewSessionDialog from './components/NewSessionDialog'
import PresetsDialog from './components/PresetsDialog'
import SnapshotsDialog from './components/SnapshotsDialog'
import { cleanTerminalOutput, detectStatus, truncateHistory } from './utils/statusDetector'

function App() {
  const sessions = useAppStore((s) => s.sessions)
  const searchQuery = useAppStore((s) => s.searchQuery)
  const selectedGroupId = useAppStore((s) => s.selectedGroupId)
  const isFullscreen = useAppStore((s) => s.isFullscreen)
  const darkMode = useAppStore((s) => s.darkMode)
  const setPresets = useAppStore((s) => s.setPresets)
  const setGroups = useAppStore((s) => s.setGroups)
  const setSnapshots = useAppStore((s) => s.setSnapshots)
  const setDarkMode = useAppStore((s) => s.setDarkMode)

  const [showNewSession, setShowNewSession] = useState(false)
  const [showPresets, setShowPresets] = useState(false)
  const [showSnapshots, setShowSnapshots] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  useEffect(() => {
    const loadPersistedData = async () => {
      try {
        const [savedPresets, savedGroups, savedSnapshots, savedDarkMode] = await Promise.all([
          window.electronAPI.storageGet('presets'),
          window.electronAPI.storageGet('groups'),
          window.electronAPI.storageGet('snapshots'),
          window.electronAPI.storageGet('darkMode'),
        ])
        if (savedPresets && Array.isArray(savedPresets)) setPresets(savedPresets)
        if (savedGroups && Array.isArray(savedGroups)) setGroups(savedGroups)
        if (savedSnapshots && Array.isArray(savedSnapshots)) setSnapshots(savedSnapshots)
        if (typeof savedDarkMode === 'boolean') setDarkMode(savedDarkMode)
      } catch (e) {
        console.error('加载持久化数据失败:', e)
      }
    }
    loadPersistedData()
  }, [])

  const pendingBufferRef = useRef<Record<string, string[]>>({})
  const batchQueueRef = useRef<Record<string, string[]>>({})
  const batchTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    const flushSession = (sessionId: string) => {
      const state = useAppStore.getState()
      const session = state.sessions.find(s => s.id === sessionId)
      if (!session) return

      const pending = pendingBufferRef.current[sessionId]
      const batched = batchQueueRef.current[sessionId]
      pendingBufferRef.current[sessionId] = []
      batchQueueRef.current[sessionId] = []

      const chunks: string[] = []
      if (pending && pending.length > 0) chunks.push(...pending)
      if (batched && batched.length > 0) chunks.push(...batched)
      if (chunks.length === 0) return

      const rawHistory = [...session.history, ...chunks]
      const newHistory = truncateHistory(rawHistory)
      const fullRaw = newHistory.join('')
      const cleanText = cleanTerminalOutput(fullRaw)
      const newStatus = detectStatus(fullRaw)

      state.updateSession(sessionId, {
        history: newHistory,
        previewText: cleanText,
        status: newStatus,
        lastActivityAt: Date.now()
      })
    }

    const handleOutput = (sessionId: string, data: string) => {
      const state = useAppStore.getState()
      const session = state.sessions.find(s => s.id === sessionId)

      if (!session) {
        if (!pendingBufferRef.current[sessionId]) {
          pendingBufferRef.current[sessionId] = []
        }
        pendingBufferRef.current[sessionId].push(data)
        return
      }

      if (!batchQueueRef.current[sessionId]) {
        batchQueueRef.current[sessionId] = []
      }
      batchQueueRef.current[sessionId].push(data)

      if (batchTimerRef.current[sessionId]) {
        clearTimeout(batchTimerRef.current[sessionId])
      }
      batchTimerRef.current[sessionId] = setTimeout(() => {
        flushSession(sessionId)
      }, 30)
    }

    const handleExit = (sessionId: string, exitCode: number) => {
      const timer = batchTimerRef.current[sessionId]
      if (timer) {
        clearTimeout(timer)
        delete batchTimerRef.current[sessionId]
      }

      const state = useAppStore.getState()
      const session = state.sessions.find(s => s.id === sessionId)

      if (session) {
        const pending = pendingBufferRef.current[sessionId] || []
        const batched = batchQueueRef.current[sessionId] || []
        delete pendingBufferRef.current[sessionId]
        delete batchQueueRef.current[sessionId]

        const allChunks = [...pending, ...batched]
        const exitMsg = `\r\n\x1b[33m[进程已退出，退出码: ${exitCode}]\x1b[0m\r\n`
        const newHistory = [...session.history, ...allChunks, exitMsg]
        const fullRaw = newHistory.join('')
        const cleanText = cleanTerminalOutput(fullRaw)

        state.updateSession(sessionId, {
          history: newHistory,
          previewText: cleanText,
          status: exitCode === 0 ? 'idle' : 'error',
        })
      } else {
        delete pendingBufferRef.current[sessionId]
        delete batchQueueRef.current[sessionId]
      }
    }

    const unsubOutput = window.electronAPI.onSessionOutput(handleOutput)
    const unsubExit = window.electronAPI.onSessionExit(handleExit)

    return () => {
      unsubOutput()
      unsubExit()
      Object.values(batchTimerRef.current).forEach(t => clearTimeout(t))
      batchTimerRef.current = {}
      batchQueueRef.current = {}
      pendingBufferRef.current = {}
    }
  }, [])

  const filteredSessions = useMemo(() => {
    const STATUS_PRIORITY: Record<string, number> = {
      'error': 0,
      'needs-confirm': 1,
      'needs-input': 2,
      'running': 3,
      'idle': 4,
    }

    let filtered = [...sessions]

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(s =>
        s.name.toLowerCase().includes(query)
      )
    }

    if (selectedGroupId) {
      filtered = filtered.filter(s => s.groupId === selectedGroupId)
    }

    return filtered.sort((a, b) => {
      const pa = STATUS_PRIORITY[a.status] ?? 5
      const pb = STATUS_PRIORITY[b.status] ?? 5
      if (pa !== pb) return pa - pb
      return a.createdAt - b.createdAt
    })
  }, [sessions, searchQuery, selectedGroupId])

  if (isFullscreen) {
    return <FullscreenTerminal />
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: darkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#38bdf8',
          borderRadius: 6,
          fontSize: 13,
          fontFamily: "'DM Sans', -apple-system, sans-serif",
        },
      }}
    >
      <div className="h-screen flex flex-col" style={{ background: 'var(--bg-primary)' }}>
        <Toolbar 
          onNewSession={() => setShowNewSession(true)} 
          onOpenPresets={() => setShowPresets(true)}
          onOpenSnapshots={() => setShowSnapshots(true)}
        />
        
        <div className="flex flex-1 overflow-hidden">
          <Sidebar 
            collapsed={sidebarCollapsed} 
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)} 
          />
          
          <main className="flex-1 overflow-auto p-5">
            {filteredSessions.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredSessions.map((session, index) => (
                  <div key={session.id} className="animate-fade-in" style={{ animationDelay: `${index * 50}ms` }}>
                    <SessionCard session={session} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-5">
                <div 
                  className="w-20 h-20 rounded-2xl flex items-center justify-center"
                  style={{ 
                    background: 'linear-gradient(135deg, rgba(56,189,248,0.15) 0%, rgba(129,140,248,0.15) 100%)',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <CodeFilled style={{ fontSize: 36, color: 'var(--accent)' }} />
                </div>
                <div className="text-center">
                  <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 4 }}>
                    暂无终端会话
                  </p>
                  <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    创建一个新会话开始管理你的终端
                  </p>
                </div>
                <Button 
                  type="primary" 
                  icon={<PlusCircleFilled />}
                  onClick={() => setShowNewSession(true)}
                >
                  新建会话
                </Button>
              </div>
            )}
          </main>
        </div>

        <NewSessionDialog 
          open={showNewSession} 
          onClose={() => setShowNewSession(false)} 
        />
        
        <PresetsDialog 
          open={showPresets} 
          onClose={() => setShowPresets(false)} 
        />

        <SnapshotsDialog
          open={showSnapshots}
          onClose={() => setShowSnapshots(false)}
        />
      </div>
    </ConfigProvider>
  )
}

export default App
