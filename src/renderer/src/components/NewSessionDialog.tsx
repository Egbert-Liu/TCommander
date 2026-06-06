import { useState } from 'react'
import { X, Terminal } from 'lucide-react'
import { useAppStore } from '../store'

interface NewSessionDialogProps {
  onClose: () => void
}

export default function NewSessionDialog({ onClose }: NewSessionDialogProps) {
  const { addSession, darkMode } = useAppStore()
  const [name, setName] = useState(`会话 ${Date.now()}`)
  const [terminalType, setTerminalType] = useState<'powershell' | 'cmd' | 'bash'>('powershell')
  const [cwd, setCwd] = useState('')
  const [initialCommand, setInitialCommand] = useState('')

  const handleCreate = async () => {
    if (!name.trim()) return

    const sessionId = await window.electronAPI.createSession({
      terminalType,
      cwd: cwd || undefined
    })

    const session = {
      id: sessionId,
      name,
      terminalType,
      cwd: cwd || '~',
      history: [],
      status: 'idle' as const,
      createdAt: Date.now(),
      lastActivityAt: Date.now()
    }

    addSession(session)

    // 如果有初始命令，延迟500ms后发送
    if (initialCommand.trim()) {
      setTimeout(async () => {
        await window.electronAPI.sendInput(sessionId, initialCommand + '\r')
      }, 500)
    }

    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className={`w-full max-w-md rounded-lg shadow-xl ${
        darkMode ? 'bg-gray-800' : 'bg-white'
      }`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">新建会话</h2>
          </div>
          <button
            onClick={onClose}
            className={`p-1 rounded hover:bg-gray-700 transition`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">会话名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border ${
                darkMode
                  ? 'bg-gray-700 border-gray-600 text-white'
                  : 'bg-gray-100 border-gray-300'
              } focus:outline-none focus:ring-2 focus:ring-primary`}
              placeholder="输入会话名称"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">终端类型</label>
            <select
              value={terminalType}
              onChange={(e) => setTerminalType(e.target.value as any)}
              className={`w-full px-3 py-2 rounded-lg border ${
                darkMode
                  ? 'bg-gray-700 border-gray-600 text-white'
                  : 'bg-gray-100 border-gray-300'
              } focus:outline-none focus:ring-2 focus:ring-primary`}
            >
              <option value="powershell">PowerShell</option>
              <option value="cmd">CMD</option>
              <option value="bash">Bash</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">工作目录 (可选)</label>
            <input
              type="text"
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border ${
                darkMode
                  ? 'bg-gray-700 border-gray-600 text-white'
                  : 'bg-gray-100 border-gray-300'
              } focus:outline-none focus:ring-2 focus:ring-primary`}
              placeholder="留空使用默认目录"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">初始命令 (可选)</label>
            <input
              type="text"
              value={initialCommand}
              onChange={(e) => setInitialCommand(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border ${
                darkMode
                  ? 'bg-gray-700 border-gray-600 text-white'
                  : 'bg-gray-100 border-gray-300'
              } focus:outline-none focus:ring-2 focus:ring-primary`}
              placeholder="创建会话后自动执行的命令"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-lg ${
              darkMode
                ? 'hover:bg-gray-700'
                : 'hover:bg-gray-200'
            } transition`}
          >
            取消
          </button>
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-blue-700 transition"
          >
            创建
          </button>
        </div>
      </div>
    </div>
  )
}
