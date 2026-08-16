/// <reference types="vite/client" />

/** Claude Code transcript 对话条目（与主进程 transcriptManager 的 TranscriptEntry 对应） */
interface TranscriptEntry {
  kind: 'user' | 'assistant' | 'tool-call' | 'tool-result'
  text: string
  toolName?: string
  isError?: boolean
  ts?: number
}

interface ElectronAPI {
  createSession: (config: any) => Promise<string>
  sendInput: (sessionId: string, data: string) => Promise<void>
  closeSession: (sessionId: string) => Promise<void>
  resizeSession: (sessionId: string, cols: number, rows: number) => Promise<void>
  storageGet: (key: string) => Promise<any>
  storageSet: (key: string, value: any) => Promise<void>
  secretGet: (key: string) => Promise<string | undefined>
  secretSet: (key: string, value: string) => Promise<void>
  secretRemove: (key: string) => Promise<void>
  setTitleBarOverlay: (opts: { color: string; symbolColor: string }) => Promise<void>
  windowMinimize: () => Promise<void>
  windowToggleMaximize: () => Promise<void>
  windowClose: () => Promise<void>
  onWindowMaximizeChange: (callback: (isMaximized: boolean) => void) => () => void
  onAppClosing: (callback: () => void) => () => void
  onRequestCloseConfirm: (callback: () => void) => () => void
  closeConfirmResponse: (confirmed: boolean) => Promise<void>
  onSshAuthPrompt: (callback: (sessionId: string, prompt: string) => void) => () => void
  replySshAuth: (answer: string | null) => Promise<void>
  onSessionOutput: (callback: (sessionId: string, data: string) => void) => () => void
  onSessionExit: (callback: (sessionId: string, exitCode: number) => void) => () => void
  onSessionConnStatus: (callback: (sessionId: string, status: string) => void) => () => void
  onHookStatusUpdate: (callback: (sessionId: string, payload: any) => void) => () => void
  onClaudeTranscript: (callback: (sessionId: string, appended: TranscriptEntry[]) => void) => () => void
  claudeIntegrationStatus: () => Promise<{ configured: boolean; hookPath: string }>
  claudeIntegrationEnable: () => Promise<{ success: boolean; error?: string }>
  claudeIntegrationDisable: () => Promise<{ success: boolean; error?: string }>
}

// Electron 专用 CSS 属性扩展：-webkit-app-region 用于自定义标题栏拖拽区域
declare global {
  namespace React {
    interface CSSProperties {
      WebkitAppRegion?: 'drag' | 'no-drag'
    }
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
