import { useEffect } from 'react'
import { useAppStore } from './store'
import Sidebar from './components/Sidebar'
import Toolbar from './components/Toolbar'
import SessionCard from './components/SessionCard'
import FullscreenTerminal from './components/FullscreenTerminal'
import NewSessionDialog from './components/NewSessionDialog'
import { useState } from 'react'

function App() {
  const { sessions, darkMode, isFullscreen, filteredSessions } = useAppStore()
  const [showNewSession, setShowNewSession] = useState(false)

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
    <div className={`h-screen flex flex-col ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      <Toolbar onNewSession={() => setShowNewSession(true)} />
      
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        
        <main className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
          
          {filteredSessions.length === 0 && sessions.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <p className="text-xl mb-4">暂无会话</p>
              <button
                onClick={() => setShowNewSession(true)}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-blue-700 transition"
              >
                创建第一个会话
              </button>
            </div>
          )}
        </main>
      </div>

      {showNewSession && (
        <NewSessionDialog onClose={() => setShowNewSession(false)} />
      )}
    </div>
  )
}

export default App
