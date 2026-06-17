/// <reference types="vite/client" />

interface ElectronAPI {
  createSession: (config: any) => Promise<string>
  sendInput: (sessionId: string, data: string) => Promise<void>
  closeSession: (sessionId: string) => Promise<void>
  resizeSession: (sessionId: string, cols: number, rows: number) => Promise<void>
  storageGet: (key: string) => Promise<any>
  storageSet: (key: string, value: any) => Promise<void>
  setTitleBarOverlay: (opts: { color: string; symbolColor: string }) => Promise<void>
  windowMinimize: () => Promise<void>
  windowToggleMaximize: () => Promise<void>
  windowClose: () => Promise<void>
  onAppClosing: (callback: () => void) => () => void
  onSessionOutput: (callback: (sessionId: string, data: string) => void) => () => void
  onSessionExit: (callback: (sessionId: string, exitCode: number) => void) => () => void
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
