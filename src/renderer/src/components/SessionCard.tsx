import { useEffect, useRef, useState } from 'react'
import { Terminal, X, Maximize2, Send, ArrowRight } from 'lucide-react'
import { Session } from '../types'
import { useAppStore } from '../store'
import { stripAnsi } from '../utils/statusDetector'

interface SessionCardProps {
  session: Session
}

export default function SessionCard({ session }: SessionCardProps) {
  const { removeSession, setActiveSession, setIsFullscreen, darkMode } = useAppStore()
  const [preview, setPreview] = useState('')
  const [input, setInput] = useState('')
  const [showInput, setShowInput] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleOutput = (sessionId: string, data: string) => {
      if (sessionId === session.id) {
        setPreview(prev => {
          const newPreview = prev + data
          const lines = newPreview.split('\n')
          return lines.slice(-20).join('\n')
        })
        
        // 更新会话历史
        useAppStore.getState().updateSession(session.id, {
          history: [...session.history, data],
          lastActivityAt: Date.now()
        })
      }
    }

    const handleExit = (sessionId: string, exitCode: number) => {
      if (sessionId === session.id) {
        useAppStore.getState().updateSession(session.id, {
          status: 'error'
        })
      }
    }

    window.electronAPI.onSessionOutput(handleOutput)
    window.electronAPI.onSessionExit(handleExit)

    return () => {
      window.electronAPI.removeAllListeners()
    }
  }, [session.id])

  const handleSendInput = async () => {
    if (input.trim()) {
      await window.electronAPI.sendInput(session.id, input + '\r')
      setInput('')
      setShowInput(false)
    }
  }

  const handleQuickConfirm = async () => {
    await window.electronAPI.sendInput(session.id, 'y\r')
  }

  const handleQuickDeny = async () => {
    await window.electronAPI.sendInput(session.id, 'n\r')
  }

  const handleClose = async () => {
    await window.electronAPI.closeSession(session.id)
    removeSession(session.id)
  }

  const handleFullscreen = () => {
    setActiveSession(session.id)
    setIsFullscreen(true)
  }

  const getStatusColor = () => {
    switch (session.status) {
      case 'needs-confirm':
        return 'border-yellow-500'
      case 'needs-input':
        return 'border-blue-500'
      case 'error':
        return 'border-red-500'
      case 'running':
        return 'border-green-500'
      default:
        return 'border-gray-500'
    }
  }

  const getStatusLabel = () => {
    switch (session.status) {
      case 'needs-confirm':
        return '需确认'
      case 'needs-input':
        return '待输入'
      case 'error':
        return '错误'
      case 'running':
        return '运行中'
      default:
        return '空闲'
    }
  }

  return (
    <div className={`rounded-lg border-2 overflow-hidden ${getStatusColor()} ${
      darkMode ? 'bg-gray-800' : 'bg-white'
    }`}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-primary" />
          <span className="font-medium">{session.name}</span>
          <span className={`text-xs px-2 py-0.5 rounded ${
            session.status === 'needs-confirm' ? 'bg-yellow-500/20 text-yellow-500' :
            session.status === 'needs-input' ? 'bg-blue-500/20 text-blue-500' :
            session.status === 'error' ? 'bg-red-500/20 text-red-500' :
            session.status === 'running' ? 'bg-green-500/20 text-green-500' :
            'bg-gray-500/20 text-gray-500'
          }`}>
            {getStatusLabel()}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleFullscreen}
            className={`p-1.5 rounded hover:bg-gray-700 transition`}
            title="全屏"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleClose}
            className="p-1.5 rounded hover:bg-red-500/20 hover:text-red-500 transition"
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        ref={previewRef}
        className="h-40 overflow-auto p-2 bg-black text-green-400 font-mono text-xs"
      >
        <pre className="whitespace-pre-wrap">{stripAnsi(preview) || '等待输出...'}</pre>
      </div>

      <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-700">
        {session.status === 'needs-confirm' && (
          <>
            <button
              onClick={handleQuickConfirm}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
            >
              <ArrowRight className="w-3 h-3" />
              确认 (Y)
            </button>
            <button
              onClick={handleQuickDeny}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
            >
              拒绝 (N)
            </button>
          </>
        )}

        {session.status === 'needs-input' || showInput ? (
          <div className="flex-1 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSendInput()
                }
              }}
              placeholder="输入命令..."
              className="flex-1 px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
            <button
              onClick={handleSendInput}
              className="p-1.5 bg-primary text-white rounded hover:bg-blue-700"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowInput(true)}
            className={`text-xs ${darkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'}`}
          >
            点击输入...
          </button>
        )}
      </div>
    </div>
  )
}
