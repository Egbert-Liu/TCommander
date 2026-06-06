import { useState, useMemo } from 'react'
import { ConfigProvider, theme, Button } from 'antd'
import { PlusCircleFilled, CodeFilled } from '@ant-design/icons'
import { useAppStore } from './store'
import Sidebar from './components/Sidebar'
import Toolbar from './components/Toolbar'
import SessionCard from './components/SessionCard'
import FullscreenTerminal from './components/FullscreenTerminal'
import NewSessionDialog from './components/NewSessionDialog'
import PresetsDialog from './components/PresetsDialog'

function App() {
  const sessions = useAppStore((s) => s.sessions)
  const searchQuery = useAppStore((s) => s.searchQuery)
  const selectedGroupId = useAppStore((s) => s.selectedGroupId)
  const isFullscreen = useAppStore((s) => s.isFullscreen)

  const [showNewSession, setShowNewSession] = useState(false)
  const [showPresets, setShowPresets] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // 用 useMemo 派生 filteredSessions，确保 sessions/searchQuery/selectedGroupId 变化时重渲染
  const filteredSessions = useMemo(() => {
    let filtered = sessions

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(s =>
        s.name.toLowerCase().includes(query)
      )
    }

    if (selectedGroupId) {
      filtered = filtered.filter(s => s.groupId === selectedGroupId)
    }

    return filtered.sort((a, b) => a.createdAt - b.createdAt)
  }, [sessions, searchQuery, selectedGroupId])

  if (isFullscreen) {
    return <FullscreenTerminal />
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
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
      </div>
    </ConfigProvider>
  )
}

export default App
