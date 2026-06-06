import { useEffect, useRef } from 'react'
import { Button, message } from 'antd'
import { CompressOutlined, CodeFilled, CopyOutlined } from '@ant-design/icons'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { ClipboardAddon } from '@xterm/addon-clipboard'
import '@xterm/xterm/css/xterm.css'
import { useAppStore } from '../store'

export default function FullscreenTerminal() {
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const sessions = useAppStore((s) => s.sessions)
  const setIsFullscreen = useAppStore((s) => s.setIsFullscreen)
  const terminalRef = useRef<HTMLDivElement>(null)
  const terminalInstance = useRef<Terminal | null>(null)
  const fitAddon = useRef<FitAddon | null>(null)

  const activeSession = sessions.find(s => s.id === activeSessionId)

  useEffect(() => {
    if (!terminalRef.current || !activeSessionId) return

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      lineHeight: 1.2,
      fontFamily: "'JetBrains Mono', Menlo, Monaco, monospace",
      scrollback: 5000,
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        cursorAccent: '#0d1117',
        selectionBackground: 'rgba(56, 189, 248, 0.3)',
        selectionForeground: '#ffffff',
        black: '#0d1117',
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
      }
    })

    const fit = new FitAddon()
    terminal.loadAddon(fit)

    try {
      const clipboard = new ClipboardAddon()
      terminal.loadAddon(clipboard)
    } catch (e) {
      console.warn('ClipboardAddon not available:', e)
    }

    terminal.open(terminalRef.current)
    fit.fit()

    terminalInstance.current = terminal
    fitAddon.current = fit

    const currentSession = useAppStore.getState().sessions.find(s => s.id === activeSessionId)
    if (currentSession?.history?.length) {
      terminal.write(currentSession.history.join(''))
    }

    terminal.onData((data) => {
      if (activeSessionId) {
        window.electronAPI.sendInput(activeSessionId, data)
      }
    })

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      const selection = terminal.getSelection()
      if (selection) {
        navigator.clipboard.writeText(selection).then(() => {
          message.success('已复制到剪贴板')
        }).catch(() => {})
      }
    }

    terminalRef.current.addEventListener('contextmenu', handleContextMenu)

    const handleResize = () => {
      fit.fit()
      if (activeSessionId) {
        window.electronAPI.resizeSession(activeSessionId, terminal.cols, terminal.rows)
      }
    }

    window.addEventListener('resize', handleResize)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setIsFullscreen(false)
      }
      if (e.key === 'Escape') {
        setIsFullscreen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('keydown', handleKeyDown)
      terminalRef.current?.removeEventListener('contextmenu', handleContextMenu)
      terminal.dispose()
    }
  }, [activeSessionId])

  useEffect(() => {
    if (!activeSessionId) return

    const handleOutput = (sessionId: string, data: string) => {
      if (sessionId === activeSessionId && terminalInstance.current) {
        terminalInstance.current.write(data)
      }
    }

    const handleExit = (sessionId: string, exitCode: number) => {
      if (sessionId === activeSessionId) {
        terminalInstance.current?.write(`\r\n\x1b[33m[进程已退出，退出码: ${exitCode}]\x1b[0m\r\n`)
        setTimeout(() => setIsFullscreen(false), 3000)
      }
    }

    window.electronAPI.onSessionOutput(handleOutput)
    window.electronAPI.onSessionExit(handleExit)

    return () => {
      window.electronAPI.removeAllListeners()
    }
  }, [activeSessionId])

  const handleCopySelection = () => {
    if (terminalInstance.current) {
      const selection = terminalInstance.current.getSelection()
      if (selection) {
        navigator.clipboard.writeText(selection).then(() => {
          message.success('已复制到剪贴板')
        })
      } else {
        message.info('请先选中要复制的文本')
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#0d1117' }}>
      <div 
        className="flex items-center justify-between px-4 h-10"
        style={{ 
          background: '#161b22',
          borderBottom: '1px solid rgba(56, 189, 248, 0.1)'
        }}
      >
        <div className="flex items-center gap-2">
          <CodeFilled style={{ color: 'var(--accent)', fontSize: 14 }} />
          <span 
            style={{ 
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              fontWeight: 600,
              color: '#f0f6fc'
            }}
          >
            {activeSession?.name || '终端'}
          </span>
          <span style={{ color: '#6e7681', fontSize: 11 }}>
            ESC 退出全屏 · 右键复制选中内容
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="text"
            icon={<CopyOutlined />}
            onClick={handleCopySelection}
            size="small"
            style={{ color: '#8b949e' }}
            title="复制选中内容"
          />
          <Button
            type="text"
            icon={<CompressOutlined />}
            onClick={() => setIsFullscreen(false)}
            size="small"
            style={{ color: '#8b949e' }}
          />
        </div>
      </div>
      
      <div ref={terminalRef} className="flex-1 overflow-hidden" style={{ padding: '4px 0' }} />
    </div>
  )
}
