import { Search, Plus, Moon, Sun, Camera } from 'lucide-react'
import { useAppStore } from '../store'

interface ToolbarProps {
  onNewSession: () => void
}

export default function Toolbar({ onNewSession }: ToolbarProps) {
  const { searchQuery, setSearchQuery, darkMode, toggleDarkMode, addSnapshot } = useAppStore()

  const handleSnapshot = async () => {
    const sessions = useAppStore.getState().sessions
    const groups = useAppStore.getState().groups
    
    const snapshot = {
      id: `snapshot-${Date.now()}`,
      name: `快照 ${new Date().toLocaleString()}`,
      data: {
        sessions: sessions.map(s => ({
          name: s.name,
          groupId: s.groupId,
          terminalType: s.terminalType,
          cwd: s.cwd,
          history: s.history
        })),
        groups
      },
      createdAt: Date.now()
    }
    
    addSnapshot(snapshot)
    
    // 保存到持久化存储
    await window.electronAPI.storageSet('snapshots', [...useAppStore.getState().snapshots, snapshot])
  }

  return (
    <div className={`px-4 py-3 border-b flex items-center gap-4 ${
      darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
    }`}>
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold text-primary">Client Manager</h1>
      </div>
      
      <div className="flex-1 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜索会话..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-10 pr-4 py-2 rounded-lg border ${
              darkMode 
                ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                : 'bg-gray-100 border-gray-300 text-gray-900 placeholder-gray-500'
            } focus:outline-none focus:ring-2 focus:ring-primary`}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onNewSession}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus className="w-4 h-4" />
          新建会话
        </button>
        
        <button
          onClick={handleSnapshot}
          className={`p-2 rounded-lg ${
            darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
          } transition`}
          title="保存快照"
        >
          <Camera className="w-5 h-5" />
        </button>
        
        <button
          onClick={toggleDarkMode}
          className={`p-2 rounded-lg ${
            darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
          } transition`}
          title={darkMode ? '切换到亮色模式' : '切换到暗色模式'}
        >
          {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </div>
    </div>
  )
}
