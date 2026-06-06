import { useEffect, useState, useRef } from 'react'
import { Tag, Button, Input, Space, Popconfirm, Select, Popover, Checkbox } from 'antd'
import { ExpandOutlined, DeleteFilled, SendOutlined, CheckCircleFilled, CloseCircleFilled, CodeFilled, PlayCircleFilled, EditFilled, StopFilled, EnterOutlined, ArrowUpOutlined, ArrowDownOutlined, SettingOutlined } from '@ant-design/icons'
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

const ALL_QUICK_ACTIONS = ['Y', 'N', 'CtrlC', 'Up', 'Down', 'Input', 'Send', 'Enter']

const ACTION_LABELS: Record<string, string> = {
  'Y': 'Y',
  'N': 'N',
  'CtrlC': 'Ctrl+C',
  'Up': '↑ 上箭头',
  'Down': '↓ 下箭头',
  'Input': '输入框',
  'Send': '发送',
  'Enter': 'Enter',
}

export default function SessionCard({ session }: SessionCardProps) {
  const removeSession = useAppStore((s) => s.removeSession)
  const updateSession = useAppStore((s) => s.updateSession)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const setIsFullscreen = useAppStore((s) => s.setIsFullscreen)
  const groups = useAppStore((s) => s.groups)
  const previewLineCount = useAppStore((s) => s.previewLineCount)
  const quickActions = useAppStore((s) => s.quickActions)
  const setQuickActions = useAppStore((s) => s.setQuickActions)

  const [preview, setPreview] = useState('')
  const [input, setInput] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(session.name)
  const [previewHover, setPreviewHover] = useState(false)
  const nameInputRef = useRef<any>(null)

  useEffect(() => {
    const handleOutput = (sessionId: string, data: string) => {
      if (sessionId === session.id) {
        setPreview(prev => {
          const newPreview = prev + data
          const lines = newPreview.split('\n')
          return lines.slice(-previewLineCount).join('\n')
        })
        const currentState = useAppStore.getState()
        const currentSession = currentState.sessions.find(s => s.id === session.id)
        currentState.updateSession(session.id, {
          history: [...(currentSession?.history || []), data],
          lastActivityAt: Date.now()
        })
      }
    }

    const handleExit = (sessionId: string, _exitCode: number) => {
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

  useEffect(() => {
    if (editingName && nameInputRef.current) {
      nameInputRef.current.focus()
    }
  }, [editingName])

  const handleSendInput = async () => {
    if (input.trim()) {
      await window.electronAPI.sendInput(session.id, input + '\r')
      setInput('')
    }
  }

  const handleQuickConfirm = async () => {
    await window.electronAPI.sendInput(session.id, 'y\r')
  }

  const handleQuickDeny = async () => {
    await window.electronAPI.sendInput(session.id, 'n\r')
  }

  const handleCtrlC = async () => {
    await window.electronAPI.sendInput(session.id, '\x03')
  }

  const handleArrowUp = async () => {
    await window.electronAPI.sendInput(session.id, '\x1b[A')
  }

  const handleArrowDown = async () => {
    await window.electronAPI.sendInput(session.id, '\x1b[B')
  }

  const handleEnter = async () => {
    await window.electronAPI.sendInput(session.id, '\r')
  }

  const handleClose = async () => {
    await window.electronAPI.closeSession(session.id)
    removeSession(session.id)
  }

  const handleFullscreen = () => {
    setActiveSession(session.id)
    setIsFullscreen(true)
  }

  const handleSaveName = () => {
    if (nameValue.trim()) {
      updateSession(session.id, { name: nameValue.trim() })
    } else {
      setNameValue(session.name)
    }
    setEditingName(false)
  }

  const handleGroupChange = (groupId: string | undefined) => {
    updateSession(session.id, { groupId })
  }

  const handleToggleQuickAction = (key: string) => {
    if (quickActions.includes(key)) {
      setQuickActions(quickActions.filter(a => a !== key))
    } else {
      setQuickActions([...quickActions, key])
    }
  }

  const statusCfg = STATUS_CONFIG[session.status] || STATUS_CONFIG.idle
  const sessionGroup = groups.find(g => g.id === session.groupId)

  const settingsContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 120 }}>
      {ALL_QUICK_ACTIONS.map(key => (
        <Checkbox
          key={key}
          checked={quickActions.includes(key)}
          onChange={() => handleToggleQuickAction(key)}
          style={{ fontSize: 11 }}
        >
          {ACTION_LABELS[key]}
        </Checkbox>
      ))}
    </div>
  )

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
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: '1px solid var(--border-color)' }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div
            className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
            style={{ background: statusCfg.bg }}
          >
            <span style={{ color: statusCfg.color, fontSize: 10 }}>{statusCfg.icon}</span>
          </div>

          {editingName ? (
            <Input
              ref={nameInputRef}
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onPressEnter={handleSaveName}
              onBlur={handleSaveName}
              size="small"
              style={{ fontSize: 11, height: 22, flex: 1 }}
            />
          ) : (
            <span
              onClick={() => setEditingName(true)}
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-primary)',
                fontFamily: "'JetBrains Mono', monospace",
                cursor: 'text',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title="点击编辑名称"
            >
              {session.name}
            </span>
          )}

          {sessionGroup && (
            <Tag
              style={{
                margin: 0,
                fontSize: 9,
                lineHeight: '16px',
                background: `${sessionGroup.color}20`,
                border: `1px solid ${sessionGroup.color}40`,
                color: sessionGroup.color,
                fontFamily: "'JetBrains Mono', monospace",
                padding: '0 4px',
                borderRadius: 3,
                flexShrink: 0,
              }}
            >
              {sessionGroup.name}
            </Tag>
          )}

          <Tag
            color={statusCfg.color}
            style={{
              margin: 0,
              fontSize: 9,
              lineHeight: '16px',
              background: statusCfg.bg,
              border: 'none',
              fontFamily: "'JetBrains Mono', monospace",
              padding: '0 4px',
              borderRadius: 3,
              flexShrink: 0,
            }}
          >
            {statusCfg.label}
          </Tag>

          <Select
            value={session.groupId || undefined}
            onChange={handleGroupChange}
            placeholder="组"
            allowClear
            size="small"
            style={{ minWidth: 70, maxWidth: 70, fontSize: 10 }}
            dropdownStyle={{ fontSize: 11 }}
          >
            {groups.map(g => (
              <Select.Option key={g.id} value={g.id}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: g.color, display: 'inline-block' }} />
                  {g.name}
                </span>
              </Select.Option>
            ))}
          </Select>
        </div>

        <Space size={1} className="flex-shrink-0 ml-1">
          <Button type="text" icon={<EditFilled style={{ fontSize: 10 }} />} onClick={() => setEditingName(true)} size="small" style={{ minWidth: 20, width: 20, height: 20 }} />
          <Button type="text" icon={<ExpandOutlined style={{ fontSize: 10 }} />} onClick={handleFullscreen} size="small" style={{ minWidth: 20, width: 20, height: 20 }} />
          <Popconfirm
            title="确认删除"
            description="确定要删除此会话吗？终端进程将被关闭。"
            onConfirm={handleClose}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true, size: 'small' }}
            cancelButtonProps={{ size: 'small' }}
          >
            <Button type="text" danger icon={<DeleteFilled style={{ fontSize: 10 }} />} size="small" style={{ minWidth: 20, width: 20, height: 20 }} />
          </Popconfirm>
        </Space>
      </div>

      <div
        className="overflow-auto px-2.5 py-1.5"
        style={{
          height: previewLineCount * 16,
          minHeight: 48,
          background: previewHover ? 'var(--terminal-bg-hover, rgba(13,17,23,0.95))' : 'var(--terminal-bg)',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          lineHeight: 1.6,
          color: 'var(--terminal-green)',
          cursor: 'pointer',
          transition: 'background 0.2s ease',
        }}
        onClick={handleFullscreen}
        onMouseEnter={() => setPreviewHover(true)}
        onMouseLeave={() => setPreviewHover(false)}
      >
        <pre className="whitespace-pre-wrap m-0">{stripAnsi(preview) || '等待输出...'}</pre>
      </div>

      <div className="px-2.5 py-1.5 flex items-center gap-1" style={{ borderTop: '1px solid var(--border-color)' }}>
        {quickActions.includes('Y') && (
          <Button
            size="small"
            type="primary"
            onClick={handleQuickConfirm}
            style={{ fontSize: 10, minWidth: 28, height: 22, padding: '0 6px' }}
          >
            Y
          </Button>
        )}
        {quickActions.includes('N') && (
          <Button
            size="small"
            danger
            onClick={handleQuickDeny}
            style={{ fontSize: 10, minWidth: 28, height: 22, padding: '0 6px' }}
          >
            N
          </Button>
        )}
        {quickActions.includes('CtrlC') && (
          <Button
            size="small"
            onClick={handleCtrlC}
            icon={<StopFilled style={{ fontSize: 9 }} />}
            style={{ fontSize: 10, minWidth: 28, height: 22, padding: '0 6px' }}
            title="Ctrl+C"
          >
            C-c
          </Button>
        )}
        {quickActions.includes('Up') && (
          <Button
            size="small"
            onClick={handleArrowUp}
            icon={<ArrowUpOutlined style={{ fontSize: 9 }} />}
            style={{ fontSize: 10, minWidth: 28, height: 22, padding: '0 6px' }}
            title="上箭头"
          />
        )}
        {quickActions.includes('Down') && (
          <Button
            size="small"
            onClick={handleArrowDown}
            icon={<ArrowDownOutlined style={{ fontSize: 9 }} />}
            style={{ fontSize: 10, minWidth: 28, height: 22, padding: '0 6px' }}
            title="下箭头"
          />
        )}
        {quickActions.includes('Input') && (
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPressEnter={handleSendInput}
            placeholder="输入..."
            size="small"
            style={{ flex: 1, fontSize: 10, height: 22 }}
          />
        )}
        {quickActions.includes('Send') && (
          <Button
            type="primary"
            icon={<SendOutlined style={{ fontSize: 9 }} />}
            onClick={handleSendInput}
            size="small"
            style={{ minWidth: 24, width: 24, height: 22 }}
            title="发送"
          />
        )}
        {quickActions.includes('Enter') && (
          <Button
            size="small"
            icon={<EnterOutlined style={{ fontSize: 9 }} />}
            onClick={handleEnter}
            style={{ minWidth: 24, width: 24, height: 22 }}
            title="Enter"
          />
        )}
        <Popover
          content={settingsContent}
          title="快捷操作显示设置"
          trigger="click"
          placement="topRight"
        >
          <Button
            type="text"
            icon={<SettingOutlined style={{ fontSize: 10 }} />}
            size="small"
            style={{ minWidth: 20, width: 20, height: 22, flexShrink: 0 }}
            title="快捷操作设置"
          />
        </Popover>
      </div>
    </div>
  )
}
