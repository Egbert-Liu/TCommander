import { useState, useRef, useMemo, memo } from 'react'
import { Tag, Button, Input, Checkbox, Tooltip, Dropdown, Modal } from 'antd'
import {
  DeleteFilled, EditFilled,
  MoreOutlined, CheckOutlined,
  ArrowUpOutlined, ArrowDownOutlined, SendOutlined, EnterOutlined,
  ReloadOutlined, SafetyCertificateFilled, ExpandAltOutlined
} from '@ant-design/icons'
import { Session } from '../types'
import { useAppStore } from '../store'
import { STATUS_COLORS } from '../utils/statusColors'
import { ansiToHtml } from '../utils/ansiToHtml'
import { getTerminalTheme } from '../utils/terminalThemes'

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

function SessionCardImpl(props: SessionCardProps) {
  const { session, onResetSession, selectable, selected, onSelect } = props
  const removeSession = useAppStore((s) => s.removeSession)
  const updateSession = useAppStore((s) => s.updateSession)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const setIsFullscreen = useAppStore((s) => s.setIsFullscreen)
  const groups = useAppStore((s) => s.groups)
  const previewLineCount = useAppStore((s) => s.previewLineCount)
  const terminalThemeId = useAppStore((s) => s.terminalTheme)

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

  // 终端主题：预览区背景/前景直接取自当前终端主题，使卡片预览与 xterm.js
  // 全屏终端视觉完全一致（深色主题→深色预览，亮色主题→亮色预览）。
  const terminalTheme = useMemo(() => getTerminalTheme(terminalThemeId), [terminalThemeId])
  const themeBg = terminalTheme.colors.background
  const themeFg = terminalTheme.colors.foreground

  // 将带 ANSI SGR 转义的预览文本渲染为带内联颜色的 HTML，使用当前终端主题调色板，
  // 让卡片预览的配色与 xterm.js 全屏终端完全一致（解决用户反馈「外面看没有颜色」）。
  // ansiToHtml 内部已对纯文本做 escapeHtml，再通过 dangerouslySetInnerHTML 注入是安全的。
  const previewHtml = useMemo(() => {
    if (!session.previewText) return ''
    return ansiToHtml(preview, terminalTheme)
  }, [preview, terminalTheme, session.previewText])

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

  // 二次确认删除：用 Modal.confirm 替代受控 Popconfirm，避免菜单点击穿透与 trigger 定位问题
  const handleDeleteClick = () => {
    Modal.confirm({
      title: '删除会话',
      content: '确定要删除该会话吗？会关闭对应的 PTY 进程并清空所有历史。',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      cancelButtonProps: {},
      onOk: handleClose,
    })
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

  // 已从 UI 移除（用户要求"代码保留"）：handleCopyPreview 在右键菜单被注释后不再被引用，
  // 为保持代码可恢复性，这里也注释掉函数本身，避免 TS6133「声明但未使用」报错。
  // const handleCopyPreview = useCallback(async () => {
  //   const text = session.previewText || preview
  //   if (text) {
  //     await navigator.clipboard.writeText(text)
  //     message.success('已复制到剪贴板')
  //   }
  // }, [session.previewText, preview])

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
                // 直接打开「重置会话」对话框（NewSessionDialog 的 reset 模式），
                // 不再额外弹 Modal.confirm —— 用户反馈那个小确认框是多余的，
                // 因为重置会话本身就会弹出一个带配置项的中型对话框让用户确认。
                onClick: () => onResetSession?.(session),
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
                onClick: handleDeleteClick,
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

      {/* 右键菜单 — 已从 UI 移除（用户要求"代码保留"）
          <Dropdown menu={{ items: contextMenuItems }} trigger={['contextMenu']}>
      */}
      <div
        className="session-card-preview"
          style={{
            // 高度按行数自适应：每行 22px（更舒展，字号 11 行高 1.6 ≈ 17.6，按 22 给足）
            // 上下 padding 16 = 16 + N * 22
            // 5 行 = 126px, 10 行 = 236px, 15 行 = 346px, 20 行 = 456px
            // 颜色加深：从 var(--ant-color-fill) 改为深灰底（与卡片容器形成层级感）
            minHeight: 126,
            height: 16 + previewLineCount * 22,
            padding: '10px 12px',
            // 背景跟随终端主题：预览区视觉与全屏终端保持一致
            background: themeBg,
            // CSS 变量供 ::after 底部淡出遮罩使用（渐变到主题背景，而非固定黑色）
            ['--preview-bg' as any]: themeBg,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            lineHeight: 1.6,
            // 前景跟随终端主题：未带 SGR 的纯文本用主题前景色
            color: themeFg,
            cursor: 'text',
            userSelect: 'text',
            // 等宽不折行 + 横向滚动：让按真实终端宽度（可能远宽于卡片）排版的
            // TUI 内容（如 Claude Code 的 120 列分割线）保持原始列布局，不错位、不折行，
            // 超出部分横向滚动查看。纵向仍隐藏（只显最后 N 行，不纵向滚动）。
            overflowX: 'auto',
            overflowY: 'hidden',
            borderTop: '1px solid var(--ant-color-border)',
            borderBottom: '1px solid var(--ant-color-border)',
            position: 'relative',
          }}
          // 单击不再触发全屏（与文本选择 + 双击复制冲突）。
          // 改为：双击进入全屏（更符合终端类应用的「展开」直觉）。
          // 右上角悬浮按钮提供更明显的「全屏」入口（ExpandAltOutlined）。
          onDoubleClick={handleFullscreen}
        >
          {session.previewText ? (
            <pre
              className="whitespace-pre m-0"
              // whitespace-pre（非 -wrap）：保持终端原始列布局，等宽字体下列严格对齐，
              // 超宽内容不折行、不错位，由外层容器 overflow-x:auto 提供横向滚动。
              // 不再设 pointerEvents:none —— 此前导致预览文本完全无法选中。
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          ) : (
            <pre className="whitespace-pre m-0" style={{ color: themeFg, opacity: 0.4 }}>等待输出...</pre>
          )}
          {/* 悬浮的「全屏」入口按钮：默认隐藏，hover 时显示，避免抢占文本选择 */}
          <Tooltip title="双击或点击全屏查看">
            <Button
              type="text"
              size="small"
              onClick={handleFullscreen}
              icon={<ExpandAltOutlined style={{ fontSize: 12 }} />}
              aria-label="全屏查看"
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                width: 22,
                height: 22,
                minWidth: 22,
                padding: 0,
                background: 'rgba(0, 0, 0, 0.45)',
                color: 'var(--ant-color-text-secondary)',
                borderRadius: 4,
                opacity: 0,
                transition: 'opacity 0.15s ease',
                zIndex: 2,
              }}
              className="session-card-preview-expand"
            />
          </Tooltip>
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
              // Unicode 命令符号 ⌘ + 字母 C，红底白字（用户指定样式）
              style={{
                width: 32,
                height: 22,
                minWidth: 32,
                padding: 0,
                borderRadius: 4,
                background: 'var(--ant-color-error)',
                borderColor: 'var(--ant-color-error)',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                lineHeight: 1,
              }}
            >
              <span style={{ fontSize: 12 }}>⌘</span>
              <span style={{ fontSize: 11 }}>C</span>
            </Button>
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

// memo 默认浅比较：session 引用不变 + 父级 useCallback 稳定的回调 → 不会重渲染
// 这对 SessionGrid 渲染 N 张卡片的场景非常关键（搜索/darkMode 切换时不再波及所有卡片）
const SessionCard = memo(SessionCardImpl)
export default SessionCard
