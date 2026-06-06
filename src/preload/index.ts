import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  createSession: (config: any) => ipcRenderer.invoke('create-session', config),
  sendInput: (sessionId: string, data: string) => ipcRenderer.invoke('send-input', sessionId, data),
  closeSession: (sessionId: string) => ipcRenderer.invoke('close-session', sessionId),
  resizeSession: (sessionId: string, cols: number, rows: number) => 
    ipcRenderer.invoke('resize-session', sessionId, cols, rows),
  
  storageGet: (key: string) => ipcRenderer.invoke('storage-get', key),
  storageSet: (key: string, value: any) => ipcRenderer.invoke('storage-set', key, value),
  
  onSessionOutput: (callback: (sessionId: string, data: string) => void) => {
    ipcRenderer.on('session-output', (_, sessionId, data) => callback(sessionId, data))
  },
  onSessionExit: (callback: (sessionId: string, exitCode: number) => void) => {
    ipcRenderer.on('session-exit', (_, sessionId, exitCode) => callback(sessionId, exitCode))
  },
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('session-output')
    ipcRenderer.removeAllListeners('session-exit')
  }
})
