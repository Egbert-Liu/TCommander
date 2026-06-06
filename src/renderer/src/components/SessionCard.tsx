import { useEffect, useState } from 'react'
import { Card, Tag, Button, Input, Space } from 'antd'
import { FullscreenOutlined, DeleteOutlined, SendOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons'
import { Session } from '../types'
import { useAppStore } from '../store'
import { stripAnsi } from '../utils/statusDetector'

interface SessionCardProps {
  session: Session
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
      case 'needs-confirm': return 'gold'
      case 'needs-input': return 'blue'
      case 'error': return 'red'
      case 'running': return 'green'
      default: return 'default'
    }
  }

  const getStatusLabel = () => {
    switch (session.status) {
      case 'needs-confirm': return '需确认'
      case 'needs-input': return '待输入'
      case 'error': return '错误'
      case 'running': return '运行中'
      default: return '空闲'
    }
  }

  const actions = [
    <Button key="fullscreen" type="text" icon={<FullscreenOutlined />} onClick={handleFullscreen} />,
    <Button key="delete" type="text" danger icon={<DeleteOutlined />} onClick={handleClose} />
  ]

  return (
    <Card 
      size="small" 
      title={
        <Space>
          <span className="font-medium">{session.name}</span>
          <Tag color={getStatusColor()}>{getStatusLabel()}</Tag>
        </Space>
      }
      extra={
        <Space>
          <Button type="text" icon={<FullscreenOutlined />} onClick={handleFullscreen} size="small" />
          <Button type="text" danger icon={<DeleteOutlined />} onClick={handleClose} size="small" />
        </Space>
      }
      className="h-full flex flex-col"
    >
      <div className="h-32 overflow-auto p-2 bg-gray-900 text-green-400 font-mono text-xs rounded mb-3">
        <pre className="whitespace-pre-wrap m-0">{stripAnsi(preview) || '等待输出...'}</pre>
      </div>

      <div className="flex-shrink-0">
        {session.status === 'needs-confirm' && (
          <Space className="mb-2">
            <Button size="small" type="primary" icon={<CheckOutlined />} onClick={handleQuickConfirm}>
              确认 (Y)
            </Button>
            <Button size="small" danger icon={<CloseOutlined />} onClick={handleQuickDeny}>
              拒绝 (N)
            </Button>
          </Space>
        )}

        {(session.status === 'needs-input' || showInput) ? (
          <Input.Group compact className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPressEnter={handleSendInput}
              placeholder="输入命令..."
              className="flex-1"
              size="small"
            />
            <Button type="primary" icon={<SendOutlined />} onClick={handleSendInput} size="small" />
          </Input.Group>
        ) : (
          <Button 
            type="link" 
            size="small" 
            onClick={() => setShowInput(true)}
            block
          >
            点击输入...
          </Button>
        )}
      </div>
    </Card>
  )
}
