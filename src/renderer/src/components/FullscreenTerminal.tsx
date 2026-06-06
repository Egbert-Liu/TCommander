import { useEffect, useRef } from 'react'
import { X, Minimize2 } from 'lucide-react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import { useAppStore } from '../store'

export default function FullscreenTerminal() {
  const { activeSessionId, sessions, setIsFullscreen, darkMode } = useAppStore()
  const terminalRef = useRef<HTMLDivElement>(null)
  const terminalInstance = useRef<Terminal | null>(null)
  const fitAddon = useRef<FitAddon | null>(null)

  const activeSession = sessions.find(s => s.id === activeSessionId)

  useEffect(() => {
    if (!terminalRef.current) return

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: darkMode ? {
        background: '#000000',
        foreground: '#ffffff',
        cursor: '#ffffff',
        cursorAccent: '#000000',
        selectionBackground: '#334155'
      } : {
        background: '#ffffff',
        foreground: '#000000',
        cursor: '#000000',
        cursorAccent: '#ffffff',
        selectionBackground: '#93c5fd'
      }
    })

    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(terminalRef.current)
    fit.fit()

    terminalInstance.current = terminal
    fitAddon.current = fit

    // 监听终端输入
    terminal.onData((data) => {
      if (activeSessionId) {
        window.electronAPI.sendInput(activeSessionId, data)
      }
    })

    // 监听窗口大小变化
    const handleResize = () => {
      fit.fit()
      if (activeSessionId) {
        window.electronAPI.resizeSession(activeSessionId, terminal.cols, terminal.rows)
      }
    }

    window.addEventListener('resize', handleResize)

    // 监听键盘快捷键
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
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 text-white">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-primary" />
          <span className="font-medium">{activeSession?.name || '终端'}</span>
          <span className="text-xs text-gray-400">按 ESC 或 S 退出全屏</span>
        </div>
        <button
          onClick={() => setIsFullscreen(false)}
          className="p-2 rounded hover:bg-gray-700 transition"
        >
          <Minimize2 className="w-5 h-5" />
        </button>
      </div>
      
      <div ref={terminalRef} className="flex-1 overflow-hidden" />
    </div>
  )
}
