import { useEffect, useRef, useMemo, useCallback } from 'react'
import { Button, Dropdown, Tooltip, message } from 'antd'
import type { MenuProps } from 'antd'
import { ArrowLeftOutlined, CopyOutlined, SunFilled, MoonFilled, CheckOutlined } from '@ant-design/icons'
import '@xterm/xterm/css/xterm.css'
import { useAppStore } from '../store'
import { getTerminalTheme, TERMINAL_THEMES } from '../utils/terminalThemes'
import { STATUS_COLORS } from '../utils/statusColors'
import type { SessionStatus } from '../types'

const MAX_REPLAY_SIZE = 512 * 1024

export default function FullscreenTerminal() {
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const sessions = useAppStore((s) => s.sessions)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const setIsFullscreen = useAppStore((s) => s.setIsFullscreen)
  const terminalThemeId = useAppStore((s) => s.terminalTheme)
  const setTerminalTheme = useAppStore((s) => s.setTerminalTheme)
  const darkMode = useAppStore((s) => s.darkMode)
  const toggleDarkMode = useAppStore((s) => s.toggleDarkMode)

  const termRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<any>(null)
  const fitAddonRef = useRef<any>(null)
  const unsubRef = useRef<(() => void) | null>(null)
  const userScrollingRef = useRef<boolean>(false)
  const resizeTimerRef = useRef<number | null>(null)
  const lastResizeRef = useRef<{ cols: number; rows: number } | null>(null)
  // 用一个 ref 容器接收 Dropdown / Popover 的 portal 弹出层，
  // 并把这个容器标为 WebkitAppRegion: no-drag，避免 Electron 拖拽吃掉点击事件
  const noDragRef = useRef<HTMLDivElement>(null)
  const getNoDragPopupContainer = useCallback(() => noDragRef.current ?? document.body, [])

  const currentSession = sessions.find(s => s.id === activeSessionId)

  // 其他会话（排除当前全屏会话）
  const otherSessions = useMemo(() => {
    // 如果没有激活的会话，返回空数组
    if (!activeSessionId) return []
    return sessions.filter(s => s.id !== activeSessionId)
  }, [sessions, activeSessionId])

  // 切换到其他会话
  const handleSwitchSession = (sessionId: string) => {
    setActiveSession(sessionId)
  }

  // 状态文字映射
  const statusTextMap: Record<SessionStatus, string> = {
    running: '运行中',
    'needs-input': '等待输入',
    'needs-confirm': '等待确认',
    error: '错误',
    idle: '空闲',
  }

  useEffect(() => {
    if (!termRef.current || !activeSessionId || !currentSession) return

    let mounted = true

    // ========== 修复 1: 同步 PTY 尺寸到 xterm ==========
    const resizePtyToXterm = () => {
      if (!terminalRef.current || !activeSessionId || !mounted) return
      const t = terminalRef.current
      const cols = t.cols || 80
      const rows = t.rows || 24

      // 防抖：避免频繁调用
      if (lastResizeRef.current
        && Math.abs(lastResizeRef.current.cols - cols) <= 1
        && Math.abs(lastResizeRef.current.rows - rows) <= 1) {
        return
      }
      lastResizeRef.current = { cols, rows }

      // 通过 IPC 通知主进程调整 PTY 尺寸
      window.electronAPI.resizeSession(activeSessionId, cols, rows)
    }

    // ========== 修复 2: 包含 batchQueueRef 中未 flush 的数据 ==========
    // 强制触发一次 flush 后再读取（此处通过 store.getState 确保拿到最新）
    // 同时收集 store.history 中的完整数据
    const stateNow = useAppStore.getState()
    const sessionNow = stateNow.sessions.find(s => s.id === activeSessionId)
    const historySnapshot = sessionNow ? [...sessionNow.history] : []
    const replayData = selectReplayContent(historySnapshot)

    const initTerminal = async () => {
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')

      if (!mounted || !termRef.current) return

      // 获取当前选中的终端主题
      const theme = getTerminalTheme(terminalThemeId)

      const terminal = new Terminal({
        cols: 160,
        rows: 40,
        cursorBlink: true,
        cursorStyle: 'bar',
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace",
        lineHeight: 1.25,
        scrollback: 10000,
        convertEol: true,
        theme: theme.colors,
      })

      const fitAddon = new FitAddon()
      terminal.loadAddon(fitAddon)
      terminal.open(termRef.current)

      terminalRef.current = terminal
      fitAddonRef.current = fitAddon

      // ========== 关键修复: 先 fit 到真实尺寸，再写入任何内容 ==========
      // 否则内容会先按 80x24 默认尺寸换行，等下一帧 fit 到真实尺寸后出现错乱与上下跳动
      try {
        fitAddon.fit()
        resizePtyToXterm()
      } catch { /* */ }

      // rAF 兜底：首次提交时字体/布局未必稳定，稳定后再 fit 一次
      requestAnimationFrame(() => {
        if (!mounted) return
        try {
          fitAddon.fit()
          resizePtyToXterm()
        } catch { /* */ }
      })

      // ========== 智能自动滚动：监听容器 scroll 判断用户是否在查看历史 ==========
      const handleWheelScroll = () => {
        if (!terminalRef.current) return
        const t = terminalRef.current
        const viewportY = t.buffer.active.viewportY
        const baseY = t.buffer.active.baseY
        const rows = t.rows
        // 用户在底部（缓冲区最新位置）时，重置滚动状态
        const atBottom = (baseY - viewportY) < rows
        userScrollingRef.current = !atBottom
      }

      // ========== 关键修复: 先订阅实时输出，再写回放 ==========
      // 订阅是同步注册的，回放 write 也是同步入队；
      // 而 IPC 的实时数据回调必然在本同步块之后才触发，
      // 因此回放一定先于实时数据写入——既不丢数据，也不会乱序
      const unsub = window.electronAPI.onSessionOutput((sid, data) => {
        if (sid === activeSessionId && mounted) {
          const wasAtBottom = !userScrollingRef.current
          terminal.write(data)
          if (wasAtBottom) {
            try { terminal.scrollToBottom() } catch { /* */ }
          }
        }
      })
      unsubRef.current = unsub

      // 写入回放（早于后续到达的实时数据）
      if (replayData) {
        terminal.write(replayData, () => {
          if (!mounted) return
          try { terminal.scrollToBottom() } catch { /* */ }
        })
      }

      terminal.focus()

      // 给 xterm 的滚动容器绑定滚动检测
      const termEl = termRef.current
      if (termEl) {
        const xtermViewport = termEl.querySelector('.xterm-viewport') as HTMLElement | null
        if (xtermViewport) {
          xtermViewport.addEventListener('scroll', handleWheelScroll, { passive: true })
          ;(xtermViewport as any).__scrollHandler = handleWheelScroll
        }
      }

      // 用户输入发送到 PTY
      terminal.onData((data) => {
        if (activeSessionId) {
          userScrollingRef.current = false // 输入时重置用户滚动状态
          window.electronAPI.sendInput(activeSessionId, data)
        }
      })
    }

    initTerminal()

    // ========== 修复 1: 窗口尺寸变化时同步 PTY ==========
    const handleResize = () => {
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current)
      }
      resizeTimerRef.current = window.setTimeout(() => {
        if (fitAddonRef.current && mounted) {
          try {
            fitAddonRef.current.fit()
            resizePtyToXterm()
          } catch { /* */ }
        }
      }, 150) // 150ms 防抖，避免拖拽时频繁 resize
    }
    window.addEventListener('resize', handleResize)

    return () => {
      mounted = false
      window.removeEventListener('resize', handleResize)
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current)
        resizeTimerRef.current = null
      }
      if (unsubRef.current) {
        unsubRef.current()
        unsubRef.current = null
      }
      if (terminalRef.current) {
        terminalRef.current.dispose()
        terminalRef.current = null
      }
      fitAddonRef.current = null
      lastResizeRef.current = null
      userScrollingRef.current = false
    }
  }, [activeSessionId])

  // Theme-only hot-swap: update colors without recreating the terminal
  useEffect(() => {
    const t = terminalRef.current
    if (t) {
      const theme = getTerminalTheme(terminalThemeId)
      t.options.theme = theme.colors
      // xterm 不会自动响应 options.theme 的变更，必须手动刷新已渲染内容
      try {
        const end = Math.max(0, (t.buffer.active.length ?? t.rows) - 1)
        t.refresh(0, end)
      } catch { /* */ }
    }
  }, [terminalThemeId])

  const themeItems: MenuProps['items'] = [
    {
      type: 'group',
      label: '暗色主题',
      children: TERMINAL_THEMES.filter(t => t.group === 'dark').map(t => ({
        key: t.id,
        label: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
            <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
              {[t.colors.background, t.colors.red, t.colors.green, t.colors.yellow, t.colors.blue, t.colors.magenta, t.colors.foreground].map((c, i) => (
                <div key={i} style={{ width: 6, height: 22, background: c }} />
              ))}
            </div>
            <span style={{ fontSize: 13, color: 'var(--ant-color-text)', flex: 1 }}>{t.name}</span>
            {terminalThemeId === t.id && <CheckOutlined style={{ color: 'var(--primary)', fontSize: 12 }} />}
          </div>
        ),
        onClick: () => setTerminalTheme(t.id),
      })),
    },
    {
      type: 'group',
      label: '亮色主题',
      children: TERMINAL_THEMES.filter(t => t.group === 'light').map(t => ({
        key: t.id,
        label: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
            <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
              {[t.colors.background, t.colors.red, t.colors.green, t.colors.yellow, t.colors.blue, t.colors.magenta, t.colors.foreground].map((c, i) => (
                <div key={i} style={{ width: 6, height: 22, background: c }} />
              ))}
            </div>
            <span style={{ fontSize: 13, color: 'var(--ant-color-text)', flex: 1 }}>{t.name}</span>
            {terminalThemeId === t.id && <CheckOutlined style={{ color: 'var(--primary)', fontSize: 12 }} />}
          </div>
        ),
        onClick: () => setTerminalTheme(t.id),
      })),
    },
  ]

  const handleBack = () => {
    setIsFullscreen(false)
    setActiveSession(null)
  }

  // 窗口控制按钮已移除：原代码自带的「最小化/最大化/关闭」三按钮与原生标题栏的
  // 窗口控制按钮重复。用户反馈「右上角多出一套窗口控制按钮」，故统一交回原生层。

  const handleCopy = async () => {
    if (terminalRef.current) {
      const selection = terminalRef.current.getSelection()
      if (selection) {
        await navigator.clipboard.writeText(selection)
        message.success('已复制')
      }
    }
  }

  // 终端式右键交互：有选中 → 复制；无选中 → 粘贴
  const handleContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const terminal = terminalRef.current
    if (!terminal) return

    try {
      if (terminal.hasSelection()) {
        const selection = terminal.getSelection()
        if (selection) {
          await navigator.clipboard.writeText(selection)
          terminal.clearSelection()
          message.success('已复制')
        }
      } else {
        const text = await navigator.clipboard.readText()
        if (text) {
          terminal.paste(text)
        }
      }
    } catch {
      message.error('剪贴板操作失败')
    }
  }

  if (!currentSession) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 'var(--z-fullscreen)',
        background: 'var(--ant-color-bg-base)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          // 右侧留出原生窗口控制按钮区（Windows 三按钮；macOS 无）
          paddingRight: 'var(--titlebar-control-width)',
          background: 'var(--ant-color-bg-layout)',
          borderBottom: '1px solid var(--ant-color-border)',
          flexShrink: 0,
          // 整个顶部栏作为窗口拖拽区域
          WebkitAppRegion: 'drag',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            // 返回按钮和会话选择需要可点击
            WebkitAppRegion: 'no-drag',
          }}
        >
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={handleBack}
            style={{ color: 'var(--ant-color-text)' }}
          >
            返回
          </Button>
          <span style={{ color: 'var(--ant-color-text)', fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>
            {currentSession.name}
          </span>
        </div>
        <div
          ref={noDragRef}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            // 主题选择按钮和切换按钮需要可点击
            WebkitAppRegion: 'no-drag',
          }}
        >
          <Dropdown
            menu={{ items: themeItems, style: { minWidth: 220 } }}
            placement="bottomRight"
            trigger={['click']}
            getPopupContainer={getNoDragPopupContainer}
          >
            <Button
              type="text"
              style={{ color: 'var(--ant-color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px' }}
            >
              {(() => {
                const tc = getTerminalTheme(terminalThemeId).colors
                return (
                  <div style={{ display: 'flex', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
                    {[tc.background, tc.red, tc.green, tc.blue, tc.foreground].map((c, i) => (
                      <div key={i} style={{ width: 4, height: 14, background: c }} />
                    ))}
                  </div>
                )
              })()}
              配色
            </Button>
          </Dropdown>

          <Tooltip title={darkMode ? '切换到亮色模式' : '切换到暗色模式'}>
            <Button
              type="text"
              icon={darkMode ? <SunFilled /> : <MoonFilled />}
              onClick={toggleDarkMode}
              aria-label={darkMode ? '切换到亮色模式' : '切换到暗色模式'}
              style={{ color: 'var(--ant-color-text-secondary)' }}
            />
          </Tooltip>

          <Button
            type="text"
            icon={<CopyOutlined />}
            onClick={handleCopy}
            style={{ color: 'var(--ant-color-text-secondary)' }}
            title="复制选中文本"
          >
            复制
          </Button>
        </div>
      </div>

      <div
        ref={termRef}
        onContextMenu={handleContextMenu}
        style={{
          flex: 1,
          padding: '8px',
          overflow: 'hidden',
        }}
      />

      {/* 底部会话状态指示条 */}
      {otherSessions.length > 0 && (
        <div
          style={{
            height: 36,
            background: 'var(--ant-color-bg-layout)',
            borderTop: '1px solid var(--ant-color-border)',
            padding: '0 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0,
            position: 'relative',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              overflowX: 'auto',
              flex: 1,
              paddingBottom: 2,
            }}
            className="hide-scrollbar"
          >
            {otherSessions.map((session) => {
              const statusColor = STATUS_COLORS[session.status]?.color || STATUS_COLORS.idle.color
              const statusText = statusTextMap[session.status] || '空闲'
              const displayName = session.name.length > 8 ? session.name.slice(0, 8) + '...' : session.name
              const previewLines = session.previewText.split('\n').slice(-2).join('\n')

              return (
                <Tooltip
                  key={session.id}
                  title={
                    <div style={{ fontSize: 12 }}>
                      <div style={{ fontWeight: 500, marginBottom: 4 }}>{session.name}</div>
                      <div style={{ opacity: 0.85 }}>状态: {statusText}</div>
                      {previewLines && (
                        <div style={{ marginTop: 4, opacity: 0.75, whiteSpace: 'pre-wrap', maxWidth: 300 }}>
                          {previewLines}
                        </div>
                      )}
                    </div>
                  }
                  placement="top"
                >
                  <div
                    onClick={() => handleSwitchSession(session.id)}
                    style={{
                      height: 24,
                      padding: '0 8px',
                      borderRadius: 12,
                      background: 'var(--ant-color-bg-container)',
                      border: '1px solid var(--ant-color-border)',
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'all 0.2s',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--ant-color-bg-text-hover)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--ant-color-bg-container)'
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: statusColor,
                        display: 'inline-block',
                        animation: session.status !== 'idle' ? 'pulse 1.5s ease-in-out infinite' : 'none',
                      }}
                    />
                    <span style={{ color: 'var(--ant-color-text)' }}>{displayName}</span>
                  </div>
                </Tooltip>
              )
            })}
          </div>
          {otherSessions.length > 5 && (
            <div
              style={{
                fontSize: 11,
                color: 'var(--ant-color-text-tertiary)',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              共 {otherSessions.length} 个
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function selectReplayContent(historyChunks: string[]): string {
  const full = historyChunks.join('')

  if (full.length === 0) return ''

  // 检测备用屏幕切换（vim/less/htop 类程序）
  let lastAltScreenIdx = -1
  let searchOffset = 0
  while (true) {
    const match = full.indexOf('\x1b[?1049h', searchOffset)
    const match2 = full.indexOf('\x1b[?47h', searchOffset)
    const match3 = full.indexOf('\x1b[?1047h', searchOffset)

    let nearest = -1
    if (match !== -1) nearest = match
    if (match2 !== -1 && (nearest === -1 || match2 < nearest)) nearest = match2
    if (match3 !== -1 && (nearest === -1 || match3 < nearest)) nearest = match3

    if (nearest === -1) break
    lastAltScreenIdx = nearest
    searchOffset = nearest + 1
  }

  if (lastAltScreenIdx >= 0) {
    const fromAltScreen = full.substring(lastAltScreenIdx)
    if (fromAltScreen.length <= MAX_REPLAY_SIZE) {
      return fromAltScreen
    }
    return fromAltScreen.substring(fromAltScreen.length - MAX_REPLAY_SIZE)
  }

  if (full.length <= MAX_REPLAY_SIZE) {
    return full
  }

  // 截断到最近的 512KB，并尽量对齐到行首
  const truncated = full.substring(full.length - MAX_REPLAY_SIZE)
  const firstNewline = truncated.indexOf('\n')
  if (firstNewline >= 0 && firstNewline < 200) {
    return truncated.substring(firstNewline + 1)
  }
  return truncated
}
