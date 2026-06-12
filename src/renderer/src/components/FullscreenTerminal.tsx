import { useEffect, useRef } from 'react'
import { Button } from 'antd'
import { ArrowLeftOutlined, CopyOutlined } from '@ant-design/icons'
import { useAppStore } from '../store'

const MAX_REPLAY_SIZE = 512 * 1024

export default function FullscreenTerminal() {
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const sessions = useAppStore((s) => s.sessions)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const setIsFullscreen = useAppStore((s) => s.setIsFullscreen)

  const termRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<any>(null)
  const fitAddonRef = useRef<any>(null)
  const unsubRef = useRef<(() => void) | null>(null)
  const userScrollingRef = useRef<boolean>(false)
  const resizeTimerRef = useRef<number | null>(null)
  const lastResizeRef = useRef<{ cols: number; rows: number } | null>(null)

  const currentSession = sessions.find(s => s.id === activeSessionId)

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

      const terminal = new Terminal({
        cursorBlink: true,
        cursorStyle: 'bar',
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace",
        lineHeight: 1.25,
        scrollback: 10000,
        convertEol: false,
        theme: {
          background: '#0d1117',
          foreground: '#c9d1d9',
          cursor: '#58a6ff',
          cursorAccent: '#0d1117',
          selectionBackground: '#264f78',
          black: '#484f58',
          red: '#ff7b72',
          green: '#3fb950',
          yellow: '#d29922',
          blue: '#58a6ff',
          magenta: '#bc8cff',
          cyan: '#39c5cf',
          white: '#b1bac4',
          brightBlack: '#6e7681',
          brightRed: '#ffa198',
          brightGreen: '#56d364',
          brightYellow: '#e3b341',
          brightBlue: '#79c0ff',
          brightMagenta: '#d2a8ff',
          brightCyan: '#56d4dd',
          brightWhite: '#f0f6fc',
        },
      })

      const fitAddon = new FitAddon()
      terminal.loadAddon(fitAddon)
      terminal.open(termRef.current)

      terminalRef.current = terminal
      fitAddonRef.current = fitAddon

      // ========== 修复 1: fit 后同步 PTY 尺寸 ==========
      requestAnimationFrame(() => {
        if (!mounted) return
        try {
          fitAddon.fit()
          resizePtyToXterm()
        } catch { /* */ }
      })

      // ========== 修复 3: 智能自动滚动 ==========
      // 通过监听容器 scroll 事件来判断用户是否手动滚动查看历史
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

      // 写入 replay 数据，完成后再订阅 live stream
      terminal.write(replayData, () => {
        if (!mounted) return
        terminal.focus()

        // 订阅 PTY 的实时输出：仅当用户没有手动查看历史时才自动跟随
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

        // 给 xterm 的滚动容器绑定滚动检测
        const termEl = termRef.current
        if (termEl) {
          const xtermContainer = termEl.querySelector('.xterm-viewport') as HTMLElement | null
          if (xtermContainer) {
            xtermContainer.addEventListener('scroll', handleWheelScroll, { passive: true })
            ;(xtermContainer as any).__scrollHandler = handleWheelScroll
          }
        }
      })

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

  const handleBack = () => {
    setIsFullscreen(false)
    setActiveSession(null)
  }

  const handleCopy = async () => {
    if (terminalRef.current) {
      const selection = terminalRef.current.getSelection()
      if (selection) {
        await navigator.clipboard.writeText(selection)
      }
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
        zIndex: 1000,
        background: '#0d1117',
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
          background: '#161b22',
          borderBottom: '1px solid #30363d',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={handleBack}
            style={{ color: '#c9d1d9' }}
          >
            返回
          </Button>
          <span style={{ color: '#c9d1d9', fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>
            {currentSession.name}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button
            type="text"
            icon={<CopyOutlined />}
            onClick={handleCopy}
            style={{ color: '#8b949e' }}
            title="复制选中文本"
          >
            复制
          </Button>
        </div>
      </div>

      <div
        ref={termRef}
        style={{
          flex: 1,
          padding: '8px',
          overflow: 'hidden',
        }}
      />
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
