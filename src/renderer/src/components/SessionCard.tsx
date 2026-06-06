import { useEffect, useState } from 'react'
import { Tag, Button, Input, Space } from 'antd'
import { ExpandOutlined, DeleteFilled, SendOutlined, CheckCircleFilled, CloseCircleFilled, CodeFilled, PlayCircleFilled } from '@ant-design/icons'
import { Session } from '../types'
import { useAppStore } from '../store'
import { stripAnsi } from '../utils/statusDetector'

interface SessionCardProps {
  session: Session
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string; glow: boolean; icon: React.ReactNode }> = {
  'needs-confirm': { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.1)', label: '需确认', glow: true, icon: <CheckCircleFilled /> },
  'needs-input':   { color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.1)', label: '待输入', glow: true, icon: <PlayCircleFilled /> },
  'error':         { color: '#f87171', bg: 'rgba(248, 113, 113, 0.1)', label: '错误', glow: true, icon: <CloseCircleFilled /> },
  'running':       { color: '#34d399', bg: 'rgba(52, 211, 153, 0.1)', label: '运行中', glow: false, icon: <PlayCircleFilled /> },
  'idle':          { color: '#64748b', bg: 'rgba(100, 116, 139, 0.08)', label: '空闲', glow: false, icon: <CodeFilled /> },
}

export default function SessionCard({ session }: SessionCardProps) {
  const { removeSession, setActiveSession, setIsFullscreen } = useAppStore()
  const [preview, setPreview] = useState('')
  const [input, setInput] = useState('')
  const [showInput, setShowInput] = useState(false)

  useEffect(() => {
    const handleOutput = (sessionId: string, data: string) => {
      if (sessionId === session.id) {
        setPreview(prev => {
          const newPreview = prev + data
          const lines = newPreview.split('\n')
          return lines.slice(-20).join('\n')
        })
        useAppStore.getState().updateSession(session.id, {
          history: [...session.history, data],
          lastActivityAt: Date.now()
        })
      }
    }

    const handleExit = (sessionId: string, exitCode: number) => {
      if (sessionId === session.id) {
        useAppStore.getState().updateSession(session.id, { status: 'error' })
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

  const statusCfg = STATUS_CONFIG[session.status] || STATUS_CONFIG.idle

  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        backdropFilter: 'blur(12px)',
        transition: 'all 0.25s ease',
        ...(statusCfg.glow ? { boxShadow: `0 0 24px ${statusCfg.bg}, inset 0 1px 0 ${statusCfg.color}15`, borderColor: `${statusCfg.color}25` } : {})
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-hover)'
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = `0 8px 24px rgba(0,0,0,0.3)${statusCfg.glow ? `, 0 0 20px ${statusCfg.bg}` : ''}`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = statusCfg.glow ? `${statusCfg.color}25` : 'var(--border-color)'
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = statusCfg.glow ? `0 0 24px ${statusCfg.bg}` : 'none'
      }}
    >
      {/* 头部 */}
      <div 
        className="flex items-center justify-between px-3 py-2.5"
        style={{ borderBottom: '1px solid var(--border-color)' }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ background: statusCfg.bg }}
          >
            <span style={{ color: statusCfg.color, fontSize: 12 }}>{statusCfg.icon}</span>
          </div>
          <span 
            style={{ 
              fontSize: 12, 
              fontWeight: 600, 
              color: 'var(--text-primary)',
              fontFamily: "'JetBrains Mono', monospace"
            }}
          >
            {session.name}
          </span>
          <Tag 
            color={statusCfg.color} 
            style={{ 
              margin: 0, 
              fontSize: 10, 
              lineHeight: '18px',
              background: statusCfg.bg,
              border: 'none',
              fontFamily: "'JetBrains Mono', monospace"
            }}
          >
            {statusCfg.label}
          </Tag>
        </div>
        <Space size={2}>
          <Button type="text" icon={<ExpandOutlined style={{ fontSize: 12 }} />} onClick={handleFullscreen} size="small" />
          <Button type="text" danger icon={<DeleteFilled style={{ fontSize: 12 }} />} onClick={handleClose} size="small" />
        </Space>
      </div>

      {/* 终端预览 */}
      <div 
        className="h-28 overflow-auto px-2.5 py-2"
        style={{ 
          background: 'var(--terminal-bg)',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          lineHeight: 1.5,
          color: 'var(--terminal-green)'
        }}
      >
        <pre className="whitespace-pre-wrap m-0">{stripAnsi(preview) || '等待输出...'}</pre>
      </div>

      {/* 操作栏 */}
      <div className="px-3 py-2" style={{ borderTop: '1px solid var(--border-color)' }}>
        {session.status === 'needs-confirm' && (
          <Space size={4} className="mb-1.5">
            <Button size="small" type="primary" icon={<CheckCircleFilled />} onClick={handleQuickConfirm}>
              Y
            </Button>
            <Button size="small" danger icon={<CloseCircleFilled />} onClick={handleQuickDeny}>
              N
            </Button>
          </Space>
        )}

        {(session.status === 'needs-input' || showInput) ? (
          <div className="flex gap-1.5">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPressEnter={handleSendInput}
              placeholder="输入命令..."
              className="flex-1"
              size="small"
            />
            <Button type="primary" icon={<SendOutlined />} onClick={handleSendInput} size="small" />
          </div>
        ) : (
          <button
            onClick={() => setShowInput(true)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: 11,
              cursor: 'pointer',
              padding: 0,
              fontFamily: "'JetBrains Mono', monospace"
            }}
          >
            &gt; 点击输入...
          </button>
        )}
      </div>
    </div>
  )
}
