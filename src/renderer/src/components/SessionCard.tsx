import { useState, useRef, useMemo, useCallback } from 'react'
import { Tag, Button, Input, Checkbox, Tooltip, Dropdown, Popover, message } from 'antd'
import type { MenuProps } from 'antd'
import { ExpandOutlined, DeleteFilled, CheckCircleFilled, CloseCircleFilled, CodeFilled, PlayCircleFilled, EditFilled, SafetyCertificateFilled, CopyOutlined, ClearOutlined, MoreOutlined, CheckOutlined, StopFilled, ArrowUpOutlined, ArrowDownOutlined, SendOutlined, EnterOutlined, SettingOutlined, ReloadOutlined } from '@ant-design/icons'
import { Session } from '../types'
import { useAppStore } from '../store'
import { STATUS_COLORS } from '../utils/statusColors'

interface SessionCardProps {
  session: Session
  onResetSession?: (session: Session) => void
  selectable?: boolean
  selected?: boolean
  onSelect?: (id: string, selected: boolean) => void
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string; glow: boolean; icon: React.ReactNode }> = {
  'needs-confirm': { ...STATUS_COLORS['needs-confirm'], label: '需确认', glow: true, icon: <CheckCircleFilled /> },
  'needs-input':   { ...STATUS_COLORS['needs-input'], label: '待输入', glow: true, icon: <PlayCircleFilled /> },
  'error':         { ...STATUS_COLORS['error'], label: '错误', glow: true, icon: <CloseCircleFilled /> },
  'running':       { ...STATUS_COLORS['running'], label: '运行中', glow: false, icon: <PlayCircleFilled /> },
  'idle':          { ...STATUS_COLORS['idle'], label: '空闲', glow: false, icon: <CodeFilled /> },
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
      className={`session-card flex flex-col ${statusClass}`}
      style={{
        background: 'var(--ant-color-bg-container)',
        border: '1px solid var(--ant-color-border)',
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      <div
        className="flex items-center justify-between"
        style={{
          padding: '8px 10px',
          borderBottom: '1px solid var(--ant-color-border)',
          background: 'var(--ant-color-bg-container)',
        }}
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
              role="button"
              tabIndex={0}
              aria-label="编辑会话名称"
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditingName(true) } }}
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
                fontSize: 11,
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
            className="status-pill"
            data-active={statusCfg.glow}
            color={statusCfg.color}
            style={{
              margin: 0,
              fontSize: 11,
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
                  fontSize: 11,
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
                <SafetyCertificateFilled style={{ fontSize: 11, marginRight: 2 }} />
                {session.matchedRuleName}
              </Tag>
            </Tooltip>
          )}

          {statusCfg.glow && (
            <Button
              size="small"
              type="text"
              icon={<CheckOutlined style={{ fontSize: 11 }} />}
              onClick={(e) => {
                e.stopPropagation()
                handleDismissStatus()
              }}
              aria-label="确认恢复"
              style={{
                flexShrink: 0,
                height: 20,
                padding: '0 6px',
                fontSize: 11,
                fontWeight: 500,
                color: statusCfg.color,
                background: statusCfg.bg,
                border: `1px solid ${statusCfg.color}40`,
                borderRadius: 4,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 2,
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              确认恢复
            </Button>
          )}
        </div>

        <Dropdown
          menu={{
            items: [
              {
                key: 'rename',
                icon: <EditFilled style={{ fontSize: 11 }} />,
                label: '重命名',
                onClick: () => setEditingName(true),
              },
              {
                key: 'fullscreen',
                icon: <ExpandOutlined style={{ fontSize: 11 }} />,
                label: '全屏查看',
                onClick: handleFullscreen,
              },
              {
                key: 'copy',
                icon: <CopyOutlined style={{ fontSize: 11 }} />,
                label: '复制预览',
                onClick: handleCopyPreview,
              },
              {
                key: 'clear',
                icon: <ClearOutlined style={{ fontSize: 11 }} />,
                label: '清空历史',
                onClick: handleClearHistory,
              },
              {
                key: 'group',
                icon: <span style={{ fontSize: 11, width: 11, display: 'inline-flex', justifyContent: 'center' }}>📁</span>,
                label: '切换分组',
                children: [
                  {
                    key: 'group-none',
                    icon: <CheckOutlined style={{ fontSize: 10, visibility: session.groupId ? 'hidden' : 'visible' }} />,
                    label: '无分组',
                    onClick: () => handleGroupChange(undefined),
                  },
                  ...groups.map(g => ({
                    key: `group-${g.id}`,
                    icon: <CheckOutlined style={{ fontSize: 10, color: g.color, visibility: session.groupId === g.id ? 'visible' : 'hidden' }} />,
                    label: (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: g.color, display: 'inline-block' }} />
                        {g.name}
                      </span>
                    ),
                    onClick: () => handleGroupChange(g.id),
                  })),
                ],
              },
              { type: 'divider' },
              {
                key: 'delete',
                icon: <DeleteFilled style={{ fontSize: 11 }} />,
                label: '删除会话',
                danger: true,
                onClick: handleClose,
              },
            ],
          }}
          trigger={['click']}
          placement="bottomRight"
        >
          <Button
            type="text"
            icon={<MoreOutlined style={{ fontSize: 14 }} />}
            size="small"
            style={{ minWidth: 20, width: 20, height: 20, flexShrink: 0 }}
          />
        </Dropdown>
      </div>

      <Dropdown menu={{ items: contextMenuItems }} trigger={['contextMenu']}>
        <div
          className="session-card-preview px-2.5 py-1.5"
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
            overflow: 'hidden',
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
        style={{
          borderTop: '1px solid var(--ant-color-border)',
          height: 32,
          background: 'var(--ant-color-bg-container)',
        }}
      >
        {quickActions.includes('Y') && (
          <Button
            type="primary"
            size="small"
            onClick={handleQuickConfirm}
            style={{ fontSize: 11, fontWeight: 700, width: 24, height: 22, minWidth: 24, padding: 0, borderRadius: 4 }}
          >
            Y
          </Button>
        )}
        {quickActions.includes('N') && (
          <Button
            danger
            size="small"
            onClick={handleQuickDeny}
            style={{ fontSize: 11, fontWeight: 700, width: 24, height: 22, minWidth: 24, padding: 0, borderRadius: 4 }}
          >
            N
          </Button>
        )}
        {quickActions.includes('CtrlC') && (
          <Tooltip title="Ctrl+C">
            <Button
              size="small"
              onClick={handleCtrlC}
              aria-label="Ctrl+C"
              icon={<StopFilled style={{ fontSize: 11 }} />}
              style={{ width: 24, height: 22, minWidth: 24, padding: 0, borderRadius: 4 }}
            />
          </Tooltip>
        )}
        {quickActions.includes('Up') && (
          <Tooltip title="上箭头">
            <Button
              size="small"
              onClick={handleArrowUp}
              aria-label="上箭头"
              icon={<ArrowUpOutlined style={{ fontSize: 11 }} />}
              style={{ width: 22, height: 22, minWidth: 22, padding: 0, borderRadius: 4 }}
            />
          </Tooltip>
        )}
        {quickActions.includes('Down') && (
          <Tooltip title="下箭头">
            <Button
              size="small"
              onClick={handleArrowDown}
              aria-label="下箭头"
              icon={<ArrowDownOutlined style={{ fontSize: 11 }} />}
              style={{ width: 22, height: 22, minWidth: 22, padding: 0, borderRadius: 4 }}
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
            style={{ flex: 1, fontSize: 10, lineHeight: '20px', height: 22, maxHeight: 44, padding: '1px 6px', borderRadius: 4, resize: 'none', overflow: 'hidden' }}
          />
        )}
        {quickActions.includes('Send') && (
          <Tooltip title="发送">
            <Button type="primary" aria-label="发送" icon={<SendOutlined style={{ fontSize: 11 }} />} onClick={handleSendInput} size="small" style={{ width: 24, height: 22, minWidth: 24, padding: 0, borderRadius: 4 }} />
          </Tooltip>
        )}
        {quickActions.includes('Enter') && (
          <Tooltip title="Enter">
            <Button size="small" aria-label="Enter" icon={<EnterOutlined style={{ fontSize: 11 }} />} onClick={handleEnter} style={{ width: 22, height: 22, minWidth: 22, padding: 0, borderRadius: 4 }} />
          </Tooltip>
        )}
        <Popover content={settingsContent} title="快捷操作显示设置" trigger="click" placement="topRight">
          <Button type="text" aria-label="快捷操作设置" icon={<SettingOutlined style={{ fontSize: 11 }} />} size="small" style={{ width: 22, height: 22, minWidth: 22, padding: 0, flexShrink: 0, borderRadius: 4 }} title="快捷操作设置" />
        </Popover>
      </div>
    </div>
  )
}
