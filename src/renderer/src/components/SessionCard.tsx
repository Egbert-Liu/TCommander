import { useState, useRef, useMemo, useCallback } from 'react'
import { Tag, Button, Input, Space, Popconfirm, Select, Popover, Checkbox, Tooltip, Dropdown, message } from 'antd'
import type { MenuProps } from 'antd'
import { ExpandOutlined, DeleteFilled, SendOutlined, CheckCircleFilled, CloseCircleFilled, CodeFilled, PlayCircleFilled, EditFilled, StopFilled, EnterOutlined, ArrowUpOutlined, ArrowDownOutlined, SettingOutlined, ReloadOutlined, SafetyCertificateFilled, CopyOutlined, ClearOutlined } from '@ant-design/icons'
import { Session } from '../types'
import { useAppStore } from '../store'

interface SessionCardProps {
  session: Session
  onResetSession?: (session: Session) => void
  selectable?: boolean
  selected?: boolean
  onSelect?: (id: string, selected: boolean) => void
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

export default function SessionCard({ session, onResetSession, selectable, selected, onSelect }: SessionCardProps) {
  const removeSession = useAppStore((s) => s.removeSession)
  const updateSession = useAppStore((s) => s.updateSession)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const setIsFullscreen = useAppStore((s) => s.setIsFullscreen)
  const groups = useAppStore((s) => s.groups)
  const previewLineCount = useAppStore((s) => s.previewLineCount)

  const [input, setInput] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(session.name)
  const nameInputRef = useRef<any>(null)

  const quickActions = session.quickActions

  const preview = useMemo(() => {
    if (!session.previewText) return '等待输出...'
    const lines = session.previewText.split('\n')
    return lines.slice(-previewLineCount).join('\n')
  }, [session.previewText, previewLineCount])

  const handleSendInput = async () => {
    if (input.trim()) {
      // 多行文本：把 textarea 内的换行转为 PTY 的回车，整体一次性发送
      await window.electronAPI.sendInput(session.id, input + '\r')
      setInput('')
    }
  }

  // 回车 = 发送；Shift+回车 = 换行（不换行则不会阻止默认行为）
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // 让 textarea 正常插入换行，不做其它处理
        return
      }
      e.preventDefault()
      handleSendInput()
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

  const handleCopyPreview = useCallback(async () => {
    const text = session.previewText || preview
    if (text) {
      await navigator.clipboard.writeText(text)
      message.success('已复制到剪贴板')
    }
  }, [session.previewText, preview])

  const handleClearHistory = () => {
    updateSession(session.id, {
      history: [],
      previewText: '',
    })
  }

  // 右键菜单
  const contextMenuItems: MenuProps['items'] = [
    {
      key: 'copy',
      icon: <CopyOutlined style={{ fontSize: 11 }} />,
      label: '复制预览内容',
      onClick: handleCopyPreview,
    },
    {
      key: 'fullscreen',
      icon: <ExpandOutlined style={{ fontSize: 11 }} />,
      label: '全屏查看',
      onClick: handleFullscreen,
    },
    { type: 'divider' },
    {
      key: 'clear',
      icon: <ClearOutlined style={{ fontSize: 11 }} />,
      label: '清空历史',
      danger: true,
      onClick: handleClearHistory,
    },
  ]

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
      <div style={{ height: 1, background: 'var(--ant-color-border)', margin: '4px 0' }} />
      <Button
        size="small"
        icon={<ReloadOutlined style={{ fontSize: 11 }} />}
        onClick={() => onResetSession?.(session)}
        style={{ fontSize: 11, justifyContent: 'flex-start', height: 26 }}
      >
        重置会话
      </Button>
    </div>
  )

  return (
    <div
      className={`session-card rounded-xl overflow-hidden flex flex-col ${statusClass}`}
      style={{
        background: 'var(--ant-color-bg-container)',
        border: '1px solid var(--ant-color-border)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: '1px solid var(--ant-color-border)' }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {selectable && (
            <Checkbox
              checked={selected}
              onChange={(e) => {
                e.stopPropagation()
                onSelect?.(session.id, e.target.checked)
              }}
              onClick={(e) => e.stopPropagation()}
              style={{ flexShrink: 0 }}
            />
          )}
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
          {statusCfg.glow && (
            <Tooltip title={`标记为已处理（触发规则: ${session.matchedRuleName || statusCfg.label}）`}>
              <Button
                type="text"
                size="small"
                icon={<CheckCircleFilled style={{ fontSize: 10 }} />}
                onClick={handleDismissStatus}
                style={{ minWidth: 20, width: 20, height: 20, color: statusCfg.color }}
              />
            </Tooltip>
          )}
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

      <Dropdown menu={{ items: contextMenuItems }} trigger={['contextMenu']}>
        <div
          className="session-card-preview overflow-auto px-2.5 py-1.5"
          style={{
            height: previewLineCount * 16,
            minHeight: 48,
            background: 'var(--ant-color-fill)',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            lineHeight: 1.6,
            color: 'var(--ant-color-text)',
            cursor: 'pointer',
            userSelect: 'text',
          }}
          onClick={handleFullscreen}
          onDoubleClick={(e) => {
            e.stopPropagation()
            handleCopyPreview()
          }}
        >
          <pre className="whitespace-pre-wrap m-0">{preview || '等待输出...'}</pre>
        </div>
      </Dropdown>

      <div
        className="px-2 flex items-center gap-1"
        style={{ borderTop: '1px solid var(--ant-color-border)', height: 28 }}
      >
        {quickActions.includes('Y') && (
          <Button
            type="primary"
            size="small"
            onClick={handleQuickConfirm}
            style={{ fontSize: 9, fontWeight: 700, width: 22, height: 20, minWidth: 22, padding: 0, borderRadius: 3 }}
          >
            Y
          </Button>
        )}
        {quickActions.includes('N') && (
          <Button
            danger
            size="small"
            onClick={handleQuickDeny}
            style={{ fontSize: 9, fontWeight: 700, width: 22, height: 20, minWidth: 22, padding: 0, borderRadius: 3 }}
          >
            N
          </Button>
        )}
        {quickActions.includes('CtrlC') && (
          <Tooltip title="Ctrl+C">
            <Button
              size="small"
              onClick={handleCtrlC}
              icon={<StopFilled style={{ fontSize: 9 }} />}
              style={{ width: 22, height: 20, minWidth: 22, padding: 0, borderRadius: 3 }}
            />
          </Tooltip>
        )}
        {quickActions.includes('Up') && (
          <Tooltip title="上箭头">
            <Button
              size="small"
              onClick={handleArrowUp}
              icon={<ArrowUpOutlined style={{ fontSize: 8 }} />}
              style={{ width: 20, height: 20, minWidth: 20, padding: 0, borderRadius: 3 }}
            />
          </Tooltip>
        )}
        {quickActions.includes('Down') && (
          <Tooltip title="下箭头">
            <Button
              size="small"
              onClick={handleArrowDown}
              icon={<ArrowDownOutlined style={{ fontSize: 8 }} />}
              style={{ width: 20, height: 20, minWidth: 20, padding: 0, borderRadius: 3 }}
            />
          </Tooltip>
        )}

        {quickActions.includes('Input') && (
          <Input.TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入… Enter发送"
            autoSize={{ minRows: 1, maxRows: 2 }}
            style={{ flex: 1, fontSize: 10, lineHeight: '18px', height: 20, maxHeight: 44, padding: '1px 6px', borderRadius: 3, resize: 'none', overflow: 'auto' }}
          />
        )}
        {quickActions.includes('Send') && (
          <Tooltip title="发送">
            <Button type="primary" icon={<SendOutlined style={{ fontSize: 8 }} />} onClick={handleSendInput} size="small" style={{ width: 22, height: 20, minWidth: 22, padding: 0, borderRadius: 3 }} />
          </Tooltip>
        )}
        {quickActions.includes('Enter') && (
          <Tooltip title="Enter">
            <Button size="small" icon={<EnterOutlined style={{ fontSize: 8 }} />} onClick={handleEnter} style={{ width: 20, height: 20, minWidth: 20, padding: 0, borderRadius: 3 }} />
          </Tooltip>
        )}
        <Popover content={settingsContent} title="快捷操作显示设置" trigger="click" placement="topRight">
          <Button type="text" icon={<SettingOutlined style={{ fontSize: 10 }} />} size="small" style={{ width: 20, height: 20, minWidth: 20, padding: 0, flexShrink: 0 }} title="快捷操作设置" />
        </Popover>
      </div>
    </div>
  )
}
