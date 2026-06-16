import { contextBridge, ipcRenderer } from 'electron'

let outputCallbacks: Array<(sessionId: string, data: string) => void> = []
let exitCallbacks: Array<(sessionId: string, exitCode: number) => void> = []

ipcRenderer.on('session-output', (_, sessionId, data) => {
  outputCallbacks.forEach(cb => cb(sessionId, data))
})

ipcRenderer.on('session-exit', (_, sessionId, exitCode) => {
  exitCallbacks.forEach(cb => cb(sessionId, exitCode))
})

contextBridge.exposeInMainWorld('electronAPI', {
  createSession: (config: any) => ipcRenderer.invoke('create-session', config),
  sendInput: (sessionId: string, data: string) => ipcRenderer.invoke('send-input', sessionId, data),
  closeSession: (sessionId: string) => ipcRenderer.invoke('close-session', sessionId),
  resizeSession: (sessionId: string, cols: number, rows: number) =>
    ipcRenderer.invoke('resize-session', sessionId, cols, rows),
  
  storageGet: (key: string) => ipcRenderer.invoke('storage-get', key),
  storageSet: (key: string, value: any) => ipcRenderer.invoke('storage-set', key, value),
  setTitleBarOverlay: (opts: { color: string; symbolColor: string }) =>
    ipcRenderer.invoke('set-title-bar-overlay', opts),

  // 窗口控制
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowToggleMaximize: () => ipcRenderer.invoke('window-toggle-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  onWindowMaximizeChange: (callback: (isMaximized: boolean) => void) => {
    const handler = (_: any, isMaximized: boolean) => callback(isMaximized)
    ipcRenderer.on('window-maximize-change', handler)
    return () => {
      ipcRenderer.removeListener('window-maximize-change', handler)
    }
  },
  
  onSessionOutput: (callback: (sessionId: string, data: string) => void) => {
    outputCallbacks.push(callback)
    return () => {
      outputCallbacks = outputCallbacks.filter(cb => cb !== callback)
    }
  },
  onSessionExit: (callback: (sessionId: string, exitCode: number) => void) => {
    exitCallbacks.push(callback)
    return () => {
      exitCallbacks = exitCallbacks.filter(cb => cb !== callback)
    }
  },
})
