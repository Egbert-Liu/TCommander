import { useState, useRef, useMemo, useCallback } from 'react'
import { Tag, Button, Input, Checkbox, Tooltip, Dropdown, Popconfirm, message } from 'antd'
import {
  DeleteFilled, EditFilled,
  MoreOutlined, CheckOutlined,
  ArrowUpOutlined, ArrowDownOutlined, SendOutlined, EnterOutlined,
  ReloadOutlined, CloseSquareFilled, SafetyCertificateFilled
} from '@ant-design/icons'
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

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string; glow: boolean }> = {
  'needs-confirm': { ...STATUS_COLORS['needs-confirm'], label: '需确认', glow: true },
  'needs-input':   { ...STATUS_COLORS['needs-input'], label: '待输入', glow: true },
  'error':         { ...STATUS_COLORS['error'], label: '错误', glow: true },
  'running':       { ...STATUS_COLORS['running'], label: '运行中', glow: false },
  'idle':          { ...STATUS_COLORS['idle'], label: '空闲', glow: false },
}

// 已从 UI 移除（用户要求"代码保留"）
// const ALL_QUICK_ACTIONS = ['Y', 'N', 'CtrlC', 'Up', 'Down', 'Input', 'Send', 'Enter']

// const ACTION_LABELS: Record<string, string> = {
//   'Y': 'Y',
//   'N': 'N',
//   'CtrlC': 'Ctrl+C',
//   'Up': '↑ 上箭头',
//   'Down': '↓ 下箭头',
//   'Input': '输入框',
//   'Send': '发送',
//   'Enter': 'Enter',
// }

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
  // 受控的删除/重置 Popconfirm：菜单点击只打开弹层，确认/取消再关闭
  const [deletePopOpen, setDeletePopOpen] = useState(false)
  const [resetPopOpen, setResetPopOpen] = useState(false)
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
    const setGlobalLoading = useAppStore.getState().setGlobalLoading
    setGlobalLoading(true, '正在关闭会话并清理 PTY 资源...')
    try {
      await window.electronAPI.closeSession(session.id)
      removeSession(session.id)
    } finally {
      setGlobalLoading(false)
    }
  }

  // 重置会话：会清空历史 + 状态回退 idle
  const handleResetConfirm = () => {
    setResetPopOpen(false)
    if (onResetSession) {
      onResetSession(session)
    } else {
      updateSession(session.id, {
        history: [],
        previewText: '',
        status: 'idle',
        matchedRuleName: undefined,
      })
      message.success('会话已重置')
    }
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

  // 已从 UI 移除（用户要求"代码保留"）
  // const handleToggleQuickAction = (key: string) => {
  //   const currentActions = session.quickActions
  //   const newActions = currentActions.includes(key)
  //     ? currentActions.filter((a: string) => a !== key)
  //     : [...currentActions, key]
  //   updateSession(session.id, { quickActions: newActions })
  // }

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

  // 已从 UI 移除（用户要求"代码保留"）
  // const handleClearHistory = () => {
  //   updateSession(session.id, {
  //     history: [],
  //     previewText: '',
  //   })
  // }

  // 右键菜单 — 已从 UI 移除（用户要求"代码保留"）
  // const contextMenuItems: MenuProps['items'] = [
  //   {
  //     key: 'copy',
  //     icon: <CopyOutlined style={{ fontSize: 11 }} />,
  //     label: '复制预览内容',
  //     onClick: handleCopyPreview,
  //   },
  //   {
  //     key: 'fullscreen',
  //     icon: <ExpandOutlined style={{ fontSize: 11 }} />,
  //     label: '全屏查看',
  //     onClick: handleFullscreen,
  //   },
  //   { type: 'divider' },
  //   {
  //     key: 'clear',
  //     icon: <ClearOutlined style={{ fontSize: 11 }} />,
  //     label: '清空历史',
  //     danger: true,
  //     onClick: handleClearHistory,
  //   },
  // ]

  // 快捷操作显示设置弹窗内容 — 已从 UI 移除（用户要求"代码保留"）
  // const settingsContent = (
  //   <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }}>
  //     {ALL_QUICK_ACTIONS.map(key => (
  //       <Checkbox
  //         key={key}
  //         checked={quickActions.includes(key)}
  //         onChange={() => handleToggleQuickAction(key)}
  //         style={{ fontSize: 11 }}
  //       >
  //         {ACTION_LABELS[key]}
  //       </Checkbox>
  //     ))}
  //     <div style={{ height: 1, background: 'var(--ant-color-border)', margin: '4px 0' }} />
  //     <Button
  //       size="small"
  //       icon={<ReloadOutlined style={{ fontSize: 11 }} />}
  //       onClick={() => onResetSession?.(session)}
  //       style={{ fontSize: 11, justifyContent: 'flex-start', height: 26 }}
  //     >
  //       重置会话
  //     </Button>
  //   </div>
  // )

  const statusCfg = STATUS_CONFIG[session.status] || STATUS_CONFIG.idle
  const sessionGroup = groups.find(g => g.id === session.groupId)
  const statusClass = statusCfg.glow ? `card-status-${session.status}` : ''

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

          {/* 名称前小图标已移除 — 后面已经有 status-pill 文字说明 */}

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
                key: 'reset',
                icon: <ReloadOutlined style={{ fontSize: 11 }} />,
                label: '重置会话',
                onClick: () => setResetPopOpen(true),
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
                onClick: () => setDeletePopOpen(true),
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

      {/* 删除/重置会话的二次确认 Popconfirm（受控 open 模式）
          放在头部之后，弹出位置跟随默认（卡片中心偏上），不影响布局。 */}
      <Popconfirm
        title="删除会话"
        description="确定要删除该会话吗？会关闭对应的 PTY 进程并清空所有历史。"
        open={deletePopOpen}
        onConfirm={() => { setDeletePopOpen(false); handleClose() }}
        onCancel={() => setDeletePopOpen(false)}
        okText="删除"
        cancelText="取消"
        okButtonProps={{ danger: true, size: 'small' }}
        cancelButtonProps={{ size: 'small' }}
        placement="top"
      >
        <span style={{ display: 'none' }} />
      </Popconfirm>
      <Popconfirm
        title="重置会话"
        description="清空历史与状态，重新开始。PTY 进程不会被关闭。"
        open={resetPopOpen}
        onConfirm={handleResetConfirm}
        onCancel={() => setResetPopOpen(false)}
        okText="重置"
        cancelText="取消"
        okButtonProps={{ size: 'small' }}
        cancelButtonProps={{ size: 'small' }}
        placement="top"
      >
        <span style={{ display: 'none' }} />
      </Popconfirm>

      {/* 右键菜单 — 已从 UI 移除（用户要求"代码保留"）
          <Dropdown menu={{ items: contextMenuItems }} trigger={['contextMenu']}>
      */}
      <div
        className="session-card-preview px-2.5 py-1.5"
          style={{
            // 高度按行数自适应：每行 18px（比之前 16px 略高，更舒服）+ 上下 padding 12 = 12 + N * 18
            // 5 行 = 102px, 10 行 = 192px, 15 行 = 282px, 20 行 = 372px
            minHeight: 102,
            height: 12 + previewLineCount * 18,
            background: 'var(--ant-color-fill)',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
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
      {/* </Dropdown> — 右键菜单已从 UI 移除（用户要求"代码保留"） */}

      <div
        className="px-2 flex items-center gap-1"
        style={{
          borderTop: '1px solid var(--ant-color-border)',
          height: 32,
          background: 'var(--ant-color-bg-container)',
        }}
      >
        {/* Y / N 仅在「需确认」状态下出现，平常隐藏，避免噪声 */}
        {quickActions.includes('Y') && session.status === 'needs-confirm' && (
          <Button
            type="primary"
            size="small"
            onClick={handleQuickConfirm}
            style={{ fontSize: 11, fontWeight: 700, width: 24, height: 22, minWidth: 24, padding: 0, borderRadius: 4 }}
          >
            Y
          </Button>
        )}
        {quickActions.includes('N') && session.status === 'needs-confirm' && (
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
          <Tooltip title="Ctrl+C 中断">
            <Button
              size="small"
              onClick={handleCtrlC}
              aria-label="Ctrl+C"
              danger
              icon={<CloseSquareFilled style={{ fontSize: 11 }} />}
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
        {/* 快捷操作显示设置按钮 — 临时从 UI 移除（用户要求"代码保留"）
            如需恢复，取消下面这段注释即可：
            <Popover content={settingsContent} title="快捷操作显示设置" trigger="click" placement="topRight">
              <Button type="text" aria-label="快捷操作设置" icon={<SettingOutlined style={{ fontSize: 11 }} />} size="small" style={{ width: 22, height: 22, minWidth: 22, padding: 0, flexShrink: 0, borderRadius: 4 }} title="快捷操作设置" />
            </Popover>
        */}
      </div>
    </div>
  )
}
