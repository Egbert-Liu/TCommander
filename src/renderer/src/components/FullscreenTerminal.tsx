import { useEffect, useRef } from 'react'
import { Button } from 'antd'
import { CompressOutlined, CodeOutlined } from '@ant-design/icons'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useAppStore } from '../store'

export default function FullscreenTerminal() {
  const { activeSessionId, sessions, setIsFullscreen } = useAppStore()
  const terminalRef = useRef<HTMLDivElement>(null)
  const terminalInstance = useRef<Terminal | null>(null)
  const fitAddon = useRef<FitAddon | null>(null)

  const activeSession = sessions.find(s => s.id === activeSessionId)

  useEffect(() => {
    if (!terminalRef.current) return

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', Menlo, Monaco, monospace",
      theme: {
        background: '#0d1117',
        foreground: '#e2e8f0',
        cursor: '#38bdf8',
        cursorAccent: '#0d1117',
        selectionBackground: 'rgba(56, 189, 248, 0.25)',
        black: '#0d1117',
        green: '#4ade80',
        yellow: '#fbbf24',
        red: '#f87171',
        cyan: '#38bdf8',
      }
    })

    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(terminalRef.current)
    fit.fit()

    terminalInstance.current = terminal
    fitAddon.current = fit

    terminal.onData((data) => {
      if (activeSessionId) {
        window.electronAPI.sendInput(activeSessionId, data)
      }
    })

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
        terminalInstance.current?.write(`\r\n[进程已退出，退出码: ${exitCode}]\r\n`)
        setTimeout(() => setIsFullscreen(false), 2000)
      }
    }

    window.electronAPI.onSessionOutput(handleOutput)
    window.electronAPI.onSessionExit(handleExit)

    return () => {
      window.electronAPI.removeAllListeners()
    }
  }, [activeSessionId])

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#0d1117' }}>
      <div 
        className="flex items-center justify-between px-4 h-10"
        style={{ 
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-color)'
        }}
      >
        <div className="flex items-center gap-2">
          <CodeOutlined style={{ color: 'var(--accent)', fontSize: 13 }} />
          <span 
            style={{ 
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-primary)'
            }}
          >
            {activeSession?.name || '终端'}
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
            ESC 退出全屏
          </span>
        </div>
        <Button
          type="text"
          icon={<CompressOutlined />}
          onClick={() => setIsFullscreen(false)}
          size="small"
        />
      </div>
      
      <div ref={terminalRef} className="flex-1 overflow-hidden" />
    </div>
  )
}
