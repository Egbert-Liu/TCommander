import { contextBridge, ipcRenderer } from 'electron'

let outputCallbacks: Array<(sessionId: string, data: string) => void> = []
let exitCallbacks: Array<(sessionId: string, exitCode: number) => void> = []
let appClosingCallbacks: Array<() => void> = []
let closeConfirmCallbacks: Array<(hasActiveSessions: boolean) => void> = []
let sshAuthPromptCallbacks: Array<(sessionId: string, prompt: string) => void> = []

ipcRenderer.on('session-output', (_, sessionId, data) => {
  outputCallbacks.forEach(cb => cb(sessionId, data))
})

ipcRenderer.on('session-exit', (_, sessionId, exitCode) => {
  exitCallbacks.forEach(cb => cb(sessionId, exitCode))
})

ipcRenderer.on('app-closing', () => {
  appClosingCallbacks.forEach(cb => cb())
})

// 主进程要求弹出关闭确认框（用户点了原生 X 按钮）
ipcRenderer.on('request-close-confirm', (_, hasActiveSessions: boolean) => {
  closeConfirmCallbacks.forEach(cb => cb(hasActiveSessions))
})

// 主进程要求弹出 SSH 交互式认证输入框（keyboard-interactive / known_hosts）
ipcRenderer.on('ssh-auth-prompt', (_, sessionId: string, prompt: string) => {
  sshAuthPromptCallbacks.forEach(cb => cb(sessionId, prompt))
})

contextBridge.exposeInMainWorld('electronAPI', {
  createSession: (config: any) => ipcRenderer.invoke('create-session', config),
  sendInput: (sessionId: string, data: string) => ipcRenderer.invoke('send-input', sessionId, data),
  closeSession: (sessionId: string) => ipcRenderer.invoke('close-session', sessionId),
  resizeSession: (sessionId: string, cols: number, rows: number) =>
    ipcRenderer.invoke('resize-session', sessionId, cols, rows),
  
  storageGet: (key: string) => ipcRenderer.invoke('storage-get', key),
  storageSet: (key: string, value: any) => ipcRenderer.invoke('storage-set', key, value),

  // 敏感信息加密存储（SSH 密码 / 私钥口令）
  secretGet: (key: string) => ipcRenderer.invoke('secret-get', key),
  secretSet: (key: string, value: string) => ipcRenderer.invoke('secret-set', key, value),
  secretRemove: (key: string) => ipcRenderer.invoke('secret-remove', key),
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

  // 应用关闭事件：主进程在用户确认关闭后通知渲染进程，渲染进程显示 loading 蒙板
  onAppClosing: (callback: () => void) => {
    appClosingCallbacks.push(callback)
    return () => {
      appClosingCallbacks = appClosingCallbacks.filter(cb => cb !== callback)
    }
  },

  // 关闭确认：主进程拦截原生 X 后请求渲染进程弹自定义 Modal；
  // 用户选择后通过 closeConfirmResponse 回传结果给主进程。
  // 会话数由渲染进程自行从 store 读取，主进程不再判断。
  onRequestCloseConfirm: (callback: () => void) => {
    closeConfirmCallbacks.push(callback)
    return () => {
      closeConfirmCallbacks = closeConfirmCallbacks.filter(cb => cb !== callback)
    }
  },
  closeConfirmResponse: (confirmed: boolean) =>
    ipcRenderer.invoke('close-confirm-response', confirmed),

  // SSH 交互式认证：主进程推 prompt → 渲染进程弹框；用户输入后回传答案
  onSshAuthPrompt: (callback: (sessionId: string, prompt: string) => void) => {
    sshAuthPromptCallbacks.push(callback)
    return () => {
      sshAuthPromptCallbacks = sshAuthPromptCallbacks.filter(cb => cb !== callback)
    }
  },
  replySshAuth: (answer: string | null) =>
    ipcRenderer.invoke('ssh-auth-reply', answer),

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
