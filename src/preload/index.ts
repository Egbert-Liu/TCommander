import { contextBridge, ipcRenderer } from 'electron'

let outputCallbacks: Array<(sessionId: string, data: string) => void> = []
let exitCallbacks: Array<(sessionId: string, exitCode: number) => void> = []
let appClosingCallbacks: Array<() => void> = []
let closeConfirmCallbacks: Array<(hasActiveSessions: boolean) => void> = []
let sshAuthPromptCallbacks: Array<(sessionId: string, prompt: string) => void> = []
let connStatusCallbacks: Array<(sessionId: string, status: string) => void> = []
let hookStatusUpdateCallbacks: Array<(sessionId: string, payload: any) => void> = []
let claudeTranscriptCallbacks: Array<(sessionId: string, appended: any[]) => void> = []

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

// SSH 连接状态变化：connecting → ready / error
ipcRenderer.on('session-conn-status', (_, sessionId: string, status: string) => {
  connStatusCallbacks.forEach(cb => cb(sessionId, status))
})

// Hook 服务器状态更新推送
ipcRenderer.on('hook-status-update', (_, sessionId: string, payload: any) => {
  hookStatusUpdateCallbacks.forEach(cb => cb(sessionId, payload))
})

// Claude Code transcript 增量推送（全屏 MD 对话流数据源）
ipcRenderer.on('claude-transcript', (_, sessionId: string, appended: any[]) => {
  claudeTranscriptCallbacks.forEach(cb => cb(sessionId, appended))
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
  onSessionConnStatus: (callback: (sessionId: string, status: string) => void) => {
    connStatusCallbacks.push(callback)
    return () => {
      connStatusCallbacks = connStatusCallbacks.filter(cb => cb !== callback)
    }
  },
  onHookStatusUpdate: (callback: (sessionId: string, payload: any) => void) => {
    hookStatusUpdateCallbacks.push(callback)
    return () => {
      hookStatusUpdateCallbacks = hookStatusUpdateCallbacks.filter(cb => cb !== callback)
    }
  },

  // Claude Code transcript 增量订阅（主进程 transcriptManager 推送）
  onClaudeTranscript: (callback: (sessionId: string, appended: any[]) => void) => {
    claudeTranscriptCallbacks.push(callback)
    return () => {
      claudeTranscriptCallbacks = claudeTranscriptCallbacks.filter(cb => cb !== callback)
    }
  },

  // Claude Code 集成配置（读写 ~/.claude/settings.json 的 hooks）
  claudeIntegrationStatus: () =>
    ipcRenderer.invoke('claude-integration-status') as Promise<{ configured: boolean; hookPath: string }>,
  claudeIntegrationEnable: () =>
    ipcRenderer.invoke('claude-integration-enable') as Promise<{ success: boolean; error?: string }>,
  claudeIntegrationDisable: () =>
    ipcRenderer.invoke('claude-integration-disable') as Promise<{ success: boolean; error?: string }>,

  // 系统通知
  showNotification: (title: string, body: string, sound?: boolean) =>
    ipcRenderer.invoke('show-notification', title, body, sound),
})
