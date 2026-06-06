import { useEffect, useState } from 'react'
import { ConfigProvider, theme, Empty, Button } from 'antd'
import { useAppStore } from './store'
import Sidebar from './components/Sidebar'
import Toolbar from './components/Toolbar'
import SessionCard from './components/SessionCard'
import FullscreenTerminal from './components/FullscreenTerminal'
import NewSessionDialog from './components/NewSessionDialog'
import PresetsDialog from './components/PresetsDialog'

function App() {
  const { sessions, darkMode, isFullscreen, filteredSessions } = useAppStore()
  const [showNewSession, setShowNewSession] = useState(false)
  const [showPresets, setShowPresets] = useState(false)

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [darkMode])

  if (isFullscreen) {
    return <FullscreenTerminal />
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: darkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1677ff',
        },
      }}
    >
      <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
        <Toolbar 
          onNewSession={() => setShowNewSession(true)} 
          onOpenPresets={() => setShowPresets(true)}
        />
        
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          
          <main className="flex-1 overflow-auto p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredSessions.map((session) => (
                <SessionCard key={session.id} session={session} />
              ))}
            </div>
            
            {filteredSessions.length === 0 && sessions.length === 0 && (
              <Empty 
                description="暂无会话" 
                className="flex flex-col items-center justify-center h-full"
              >
                <Button 
                  type="primary" 
                  onClick={() => setShowNewSession(true)}
                  size="large"
                >
                  创建第一个会话
                </Button>
              </Empty>
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
