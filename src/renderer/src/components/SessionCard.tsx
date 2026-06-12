import { useState, useRef, useMemo } from 'react'
import { Tag, Button, Input, Space, Popconfirm, Select, Popover, Checkbox, Tooltip } from 'antd'
import { ExpandOutlined, DeleteFilled, SendOutlined, CheckCircleFilled, CloseCircleFilled, CodeFilled, PlayCircleFilled, EditFilled, StopFilled, EnterOutlined, ArrowUpOutlined, ArrowDownOutlined, SettingOutlined, ReloadOutlined, SafetyCertificateFilled } from '@ant-design/icons'
import { Session } from '../types'
import { useAppStore } from '../store'

interface SessionCardProps {
  session: Session
  onResetSession?: (session: Session) => void
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

export default function SessionCard({ session, onResetSession }: SessionCardProps) {
  const removeSession = useAppStore((s) => s.removeSession)
  const updateSession = useAppStore((s) => s.updateSession)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const setIsFullscreen = useAppStore((s) => s.setIsFullscreen)
  const groups = useAppStore((s) => s.groups)
  const previewLineCount = useAppStore((s) => s.previewLineCount)

  const [input, setInput] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(session.name)
  const [previewHover, setPreviewHover] = useState(false)
  const nameInputRef = useRef<any>(null)

  const quickActions = session.quickActions

  const preview = useMemo(() => {
    if (!session.previewText) return '等待输出...'
    const lines = session.previewText.split('\n')
    return lines.slice(-previewLineCount).join('\n')
  }, [session.previewText, previewLineCount])

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
    const currentActions = session.quickActions
    const newActions = currentActions.includes(key)
      ? currentActions.filter((a: string) => a !== key)
      : [...currentActions, key]
    updateSession(session.id, { quickActions: newActions })
  }

  const handleDismissStatus = () => {
    updateSession(session.id, {
      status: 'running',
      matchedRuleName: undefined,
    })
  }

  const statusCfg = STATUS_CONFIG[session.status] || STATUS_CONFIG.idle
  const sessionGroup = groups.find(g => g.id === session.groupId)
  const statusClass = statusCfg.glow ? `card-status-${session.status}` : ''

  const settingsContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }}>
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
      className={`rounded-xl overflow-hidden flex flex-col ${statusClass}`}
      style={{
        background: 'var(--ant-color-bg-container)',
        border: '1px solid var(--ant-color-border)',
        backdropFilter: 'blur(12px)',
        transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--ant-color-primary)'
        e.currentTarget.style.boxShadow = `0 4px 16px rgba(0,0,0,0.2)`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: '1px solid var(--ant-color-border)' }}
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
                color: 'var(--ant-color-text)',
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
              fontSize: statusCfg.glow ? 10 : 9,
              lineHeight: '16px',
              background: statusCfg.bg,
              border: statusCfg.glow ? `1px solid ${statusCfg.color}40` : 'none',
              fontFamily: "'JetBrains Mono', monospace",
              padding: '0 4px',
              borderRadius: 3,
              flexShrink: 0,
              fontWeight: statusCfg.glow ? 600 : 400,
              letterSpacing: '-0.01em',
            }}
          >
            {statusCfg.label}
          </Tag>

          {session.matchedRuleName && statusCfg.glow && (
            <Tooltip title={`触发规则: ${session.matchedRuleName}`}>
              <Tag
                style={{
                  margin: 0,
                  fontSize: 8,
                  lineHeight: '14px',
                  background: 'var(--ant-color-fill-quaternary)',
                  border: '1px solid var(--ant-color-border)',
                  color: 'var(--ant-color-text-tertiary)',
                  fontFamily: "'JetBrains Mono', monospace",
                  padding: '0 3px',
                  borderRadius: 2,
                  maxWidth: 120,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  cursor: 'help',
                }}
              >
                <SafetyCertificateFilled style={{ fontSize: 7, marginRight: 2 }} />
                {session.matchedRuleName}
              </Tag>
            </Tooltip>
          )}

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

      {statusCfg.glow && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 10px',
            background: `${statusCfg.color}08`,
            borderBottom: '1px solid var(--ant-color-border)',
          }}
        >
          <span style={{ fontSize: 10, color: statusCfg.color, fontFamily: "'JetBrains Mono', monospace" }}>
            ⚡ 触发规则: {session.matchedRuleName || statusCfg.label}
          </span>
          <Space size={4}>
            <Button
              size="small"
              type="primary"
              icon={<CheckCircleFilled style={{ fontSize: 9 }} />}
              onClick={handleDismissStatus}
              style={{ fontSize: 9, height: 20, padding: '0 6px', background: statusCfg.color, borderColor: statusCfg.color }}
            >
              已处理
            </Button>
          </Space>
        </div>
      )}

      <div
        className="overflow-auto px-2.5 py-1.5"
        style={{
          height: previewLineCount * 16,
          minHeight: 48,
          background: previewHover ? 'rgba(13,17,23,0.95)' : '#1e1e2e',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          lineHeight: 1.6,
          color: '#a6e3a1',
          cursor: 'pointer',
          transition: 'background 0.2s ease',
        }}
        onClick={handleFullscreen}
        onMouseEnter={() => setPreviewHover(true)}
        onMouseLeave={() => setPreviewHover(false)}
      >
        <pre className="whitespace-pre-wrap m-0">{preview || '等待输出...'}</pre>
      </div>

      <div className="px-2.5 py-1.5 flex items-center gap-1" style={{ borderTop: '1px solid var(--ant-color-border)' }}>
        {quickActions.includes('Y') && (
          <Button size="small" type="primary" onClick={handleQuickConfirm} style={{ fontSize: 10, minWidth: 28, height: 22, padding: '0 6px' }}>Y</Button>
        )}
        {quickActions.includes('N') && (
          <Button size="small" danger onClick={handleQuickDeny} style={{ fontSize: 10, minWidth: 28, height: 22, padding: '0 6px' }}>N</Button>
        )}
        {quickActions.includes('CtrlC') && (
          <Button size="small" onClick={handleCtrlC} icon={<StopFilled style={{ fontSize: 9 }} />} style={{ fontSize: 10, minWidth: 28, height: 22, padding: '0 6px' }} title="Ctrl+C">C-c</Button>
        )}
        {quickActions.includes('Up') && (
          <Button size="small" onClick={handleArrowUp} icon={<ArrowUpOutlined style={{ fontSize: 9 }} />} style={{ fontSize: 10, minWidth: 28, height: 22, padding: '0 6px' }} title="上箭头" />
        )}
        {quickActions.includes('Down') && (
          <Button size="small" onClick={handleArrowDown} icon={<ArrowDownOutlined style={{ fontSize: 9 }} />} style={{ fontSize: 10, minWidth: 28, height: 22, padding: '0 6px' }} title="下箭头" />
        )}
        {quickActions.includes('Input') && (
          <Input value={input} onChange={(e) => setInput(e.target.value)} onPressEnter={handleSendInput} placeholder="输入..." size="small" style={{ flex: 1, fontSize: 10, height: 22 }} />
        )}
        {quickActions.includes('Send') && (
          <Button type="primary" icon={<SendOutlined style={{ fontSize: 9 }} />} onClick={handleSendInput} size="small" style={{ minWidth: 24, width: 24, height: 22 }} title="发送" />
        )}
        {quickActions.includes('Enter') && (
          <Button size="small" icon={<EnterOutlined style={{ fontSize: 9 }} />} onClick={handleEnter} style={{ minWidth: 24, width: 24, height: 22 }} title="Enter" />
        )}
        <Popover content={settingsContent} title="快捷操作显示设置" trigger="click" placement="topRight">
          <Button type="text" icon={<SettingOutlined style={{ fontSize: 10 }} />} size="small" style={{ minWidth: 20, width: 20, height: 22, flexShrink: 0 }} title="快捷操作设置" />
        </Popover>
        <Tooltip title="重置会话">
          <Button
            type="text"
            icon={<ReloadOutlined style={{ fontSize: 10 }} />}
            size="small"
            onClick={() => onResetSession?.(session)}
            style={{ minWidth: 20, width: 20, height: 22, flexShrink: 0 }}
          />
        </Tooltip>
      </div>
    </div>
  )
}
