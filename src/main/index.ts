import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { createPtyManager } from './pty'
import { createStorageManager } from './storage'
import { secretStorage } from './secretStorage'
import { createHookServer, HookRequestHandler, HookPayload, HookResponse } from './hookServer'
import { createTranscriptManager, TranscriptManager } from './transcriptManager'

const ptyManager = createPtyManager()
const storageManager = createStorageManager()

// Hook server 实例（延迟到 app.whenReady 后初始化）
let hookServer: ReturnType<typeof createHookServer> | null = null
const HOOK_PORT = 19527

// Claude Code transcript 管理器：watch transcript JSONL 并增量推送渲染进程
let transcriptManager: TranscriptManager | null = null

let mainWindow: BrowserWindow | null = null
// 标记：用户已确认关闭后置 true，跳过后续的确认弹窗
let userConfirmedClose = false
// 渲染进程对关闭确认弹框的响应 resolver；主进程 await 它来等待用户选择
let closeConfirmResolver: ((confirmed: boolean) => void) | null = null

// 计算项目根目录：dev 模式下为 dist 目录；
// 打包后，app.asar 作为虚拟目录挂在 process.resourcesPath 下
function getResourcesPath(): string {
  if (app.isPackaged) {
    // 打包后，渲染进程构建产物在 app.asar 内的 dist 目录下
    // 使用 path.join 确保路径分隔符正确，asar 支持标准路径
    return path.join(process.resourcesPath, 'app.asar', 'dist')
  }
  return path.join(__dirname, '..', '..', 'dist')
}

function getIconPath(): string {
  if (app.isPackaged) {
    // 打包后，build 目录从 asar 中解压出来，路径在 app.asar.unpacked/build
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'build', 'icon.ico')
  }
  return path.join(__dirname, '..', '..', 'build', 'icon.ico')
}

// ========== Claude Code 集成：transcript hook 一键配置 ==========
// 写入 ~/.claude/settings.json 的 hooks，让 Claude Code 在事件触发时执行
// transcript-hook.js 报告 transcript 路径（MD 渲染层的数据源）

/** 识别「我们写入的 hook 条目」的标记（command 中包含脚本文件名） */
const TRANSCRIPT_HOOK_MARKER = 'transcript-hook.js'
/** 需要挂 hook 的 Claude Code 事件：首条输入报告路径 + 每轮结束触发增量读 */
const CLAUDE_HOOK_EVENTS = ['UserPromptSubmit', 'PostToolUse', 'Stop']

function getTranscriptHookPath(): string {
  if (app.isPackaged) {
    // extraResources 把 hooks/ 复制到 resources/hooks
    return path.join(process.resourcesPath, 'hooks', 'claude-code', 'transcript-hook.js')
  }
  return path.join(__dirname, '..', '..', 'hooks', 'claude-code', 'transcript-hook.js')
}

function getClaudeSettingsPath(): string {
  return path.join(os.homedir(), '.claude', 'settings.json')
}

function readClaudeSettings(): Record<string, any> {
  try {
    const raw = fs.readFileSync(getClaudeSettingsPath(), 'utf8')
    return JSON.parse(raw)
  } catch {
    return {} // 不存在或损坏：视为空配置
  }
}

function isOurHookEntry(hookEntry: any): boolean {
  return (
    hookEntry &&
    typeof hookEntry === 'object' &&
    hookEntry.type === 'command' &&
    typeof hookEntry.command === 'string' &&
    hookEntry.command.includes(TRANSCRIPT_HOOK_MARKER)
  )
}

function claudeIntegrationConfigured(): boolean {
  const settings = readClaudeSettings()
  const hooks = settings?.hooks
  if (!hooks || typeof hooks !== 'object') return false
  for (const event of Object.values(hooks)) {
    if (!Array.isArray(event)) continue
    for (const group of event) {
      if (group && Array.isArray(group.hooks) && group.hooks.some(isOurHookEntry)) {
        return true
      }
    }
  }
  return false
}

function claudeIntegrationEnable(): { success: boolean; error?: string } {
  try {
    const settingsPath = getClaudeSettingsPath()
    const settings = readClaudeSettings()

    // 首次写入前备份原配置（存在才备份）
    if (!fs.existsSync(settingsPath + '.tcommander-bak')) {
      try {
        fs.copyFileSync(settingsPath, settingsPath + '.tcommander-bak')
      } catch { /* 原文件不存在（首次配置）无需备份 */ }
    }

    const command = `node "${getTranscriptHookPath()}"`
    if (!settings.hooks || typeof settings.hooks !== 'object') settings.hooks = {}

    for (const eventName of CLAUDE_HOOK_EVENTS) {
      if (!Array.isArray(settings.hooks[eventName])) settings.hooks[eventName] = []
      // 去重：已存在则跳过
      const exists = settings.hooks[eventName].some(
        (group: any) => group && Array.isArray(group.hooks) && group.hooks.some(isOurHookEntry)
      )
      if (!exists) {
        settings.hooks[eventName].push({
          hooks: [{ type: 'command', command }]
        })
      }
    }

    fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

function claudeIntegrationDisable(): { success: boolean; error?: string } {
  try {
    const settingsPath = getClaudeSettingsPath()
    const settings = readClaudeSettings()
    const hooks = settings?.hooks
    if (hooks && typeof hooks === 'object') {
      for (const eventName of Object.keys(hooks)) {
        const event = hooks[eventName]
        if (!Array.isArray(event)) continue
        // 移除组内我们的 hook 条目；组空则移除组；事件空则移除事件
        const filtered = event
          .map((group: any) => {
            if (!group || !Array.isArray(group.hooks)) return group
            const kept = group.hooks.filter((h: any) => !isOurHookEntry(h))
            return kept.length > 0 ? { ...group, hooks: kept } : null
          })
          .filter((g: any) => g != null)
        if (filtered.length > 0) {
          hooks[eventName] = filtered
        } else {
          delete hooks[eventName]
        }
      }
      if (Object.keys(hooks).length === 0) delete settings.hooks
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8')
    }
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'TCommander',
    icon: getIconPath(),
    show: false, // 先隐藏，等页面渲染完再显示，避免白屏闪烁
    backgroundColor: '#1a1a1a', // 窗口底色设为深色，减少白屏感
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    // 隐藏系统默认标题栏（图标 + "Electron" 文字），消除顶部白色边框
    titleBarStyle: 'hidden',
    // 保留原生窗口控制按钮（最小化/最大化/关闭）；初始为暗色（#000/#fff），
    // 运行时由渲染进程经 set-title-bar-overlay IPC 按当前主题同步颜色
    titleBarOverlay: {
      color: '#000000',
      symbolColor: '#ffffff',
      height: 36,
    },
    frame: true,
  })

  // 页面渲染完成后再显示窗口，避免白屏
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // ========== 拦截原生右上角关闭按钮：弹自定义确认对话框 ==========
  // 用户希望直接在原生的 X 按钮上做确认，所以走主进程拦截 `close` 事件。
  // 但原生 dialog.showMessageBox 样式很丑，改为：preventDefault 后通过 IPC 通知
  // 渲染进程弹出 antd 自定义 Modal，主进程 await 渲染进程回传的结果。
  //
  // 注意：不再用 ptyManager.listSessions() 提前判断「是否有活跃会话」。
  // 因为 PTY 进程退出后即从 Map 移除，但 UI 卡片记录仍在，会导致该弹框时不弹、直接关闭。
  // 改为始终走 IPC 弹框，由渲染进程依据 store 里的会话数决定提示文案。
  mainWindow.on('close', (event) => {
    if (userConfirmedClose) return
    if (!mainWindow) return

    event.preventDefault()
    // 通知渲染进程弹出自定义确认框，等待用户选择
    if (closeConfirmResolver) {
      // 上一次的确认框还没关闭（理论上不会发生，防御性处理）：直接按取消
      closeConfirmResolver(false)
      closeConfirmResolver = null
    }
    new Promise<boolean>((resolve) => {
      closeConfirmResolver = resolve
      try {
        mainWindow?.webContents.send('request-close-confirm')
      } catch { /* 窗口已销毁 */ resolve(false) }
    }).then((confirmed) => {
      closeConfirmResolver = null
      if (confirmed && mainWindow) {
        userConfirmedClose = true
        // 通知渲染进程显示 loading 蒙板，给用户即时反馈
        try {
          mainWindow.webContents.send('app-closing')
        } catch { /* 窗口已销毁 */ }
        mainWindow.close()
      }
      // 选「取消」则不关闭
    })
  })

  // F11 切换全屏
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F11' && mainWindow) {
      event.preventDefault()
      mainWindow.setFullScreen(!mainWindow.isFullScreen())
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    // 加载渲染进程构建后的 index.html（位于 dist 目录）
    mainWindow.loadFile(path.join(getResourcesPath(), 'index.html'))
  }
}

function isWindowValid(): boolean {
  return mainWindow !== null && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()
}

// ========== SSH 交互式认证：main→renderer 请求-响应桥 ==========
// 复用 close-confirm 的范式：主进程把 prompt 推给渲染进程弹框，等用户回答后 resolve。
let sshAuthResolver: ((answer: string | null) => void) | null = null

async function requestSshAuth(sessionId: string, prompt: string): Promise<string | null> {
  if (!isWindowValid()) return null
  // 防御：若上一次询问未关闭（理论上不会），先按取消 resolve
  if (sshAuthResolver) {
    sshAuthResolver(null)
    sshAuthResolver = null
  }
  try {
    mainWindow!.webContents.send('ssh-auth-prompt', sessionId, prompt)
  } catch {
    return null
  }
  return new Promise<string | null>((resolve) => {
    sshAuthResolver = resolve
  })
}

app.whenReady().then(() => {
  // 移除默认菜单栏（File/Edit/View/Window/Help），保持界面简洁统一
  Menu.setApplicationMenu(null)

  ipcMain.handle('create-session', (_, config) => ptyManager.createSession(config))
  ipcMain.handle('send-input', (_, sessionId, data) => ptyManager.sendInput(sessionId, data))
  ipcMain.handle('close-session', (_, sessionId) => {
    transcriptManager?.cleanup(sessionId)
    return ptyManager.closeSession(sessionId)
  })
  ipcMain.handle('resize-session', (_, sessionId, cols, rows) => 
    ptyManager.resizeSession(sessionId, cols, rows)
  )
  
  ipcMain.handle('storage-get', (_, key) => storageManager.get(key))
  ipcMain.handle('storage-set', (_, key, value) => storageManager.set(key, value))

  // 敏感信息（SSH 密码 / 私钥口令）加密封装：底层 safeStorage + electron-store
  ipcMain.handle('secret-set', (_, key, value) => secretStorage.set(key, value))
  ipcMain.handle('secret-get', (_, key) => secretStorage.get(key))
  ipcMain.handle('secret-remove', (_, key) => secretStorage.remove(key))

  // SSH 交互式认证：渲染进程用户输入答案后回传，唤醒 requestSshAuth 里的 await
  ipcMain.handle('ssh-auth-reply', (_, answer: string | null) => {
    sshAuthResolver?.(answer)
    sshAuthResolver = null
  })

  // 把认证桥注入 ptyManager（SshBackend 通过它询问渲染进程）
  ptyManager.setSshAuthBridge({ requestAuth: requestSshAuth })

  // 窗口控制 IPC
  ipcMain.handle('window-minimize', () => {
    if (isWindowValid()) mainWindow?.minimize()
  })
  ipcMain.handle('window-toggle-maximize', () => {
    if (isWindowValid()) {
      if (mainWindow?.isMaximized()) {
        mainWindow.unmaximize()
      } else {
        mainWindow?.maximize()
      }
    }
  })
  ipcMain.handle('window-close', () => {
    if (isWindowValid()) mainWindow?.close()
  })

  // 关闭确认弹框的响应：渲染进程用户选择后回传 confirmed，唤醒 close 事件里的 await
  ipcMain.handle('close-confirm-response', (_, confirmed: boolean) => {
    closeConfirmResolver?.(confirmed)
    closeConfirmResolver = null
  })

  // 监听窗口最大化状态变化，通知渲染进程
  mainWindow?.on('maximize', () => {
    if (isWindowValid()) {
      mainWindow?.webContents.send('window-maximize-change', true)
    }
  })
  mainWindow?.on('unmaximize', () => {
    if (isWindowValid()) {
      mainWindow?.webContents.send('window-maximize-change', false)
    }
  })

  // 渲染进程按当前明暗主题同步原生窗口控制按钮（最小化/最大化/关闭）的底色与符号色
  ipcMain.handle('set-title-bar-overlay', (_, opts: { color: string; symbolColor: string }) => {
    if (isWindowValid()) mainWindow!.setTitleBarOverlay(opts)
  })
  
  ptyManager.onOutput((sessionId, data) => {
    if (!isWindowValid()) return
    try {
      mainWindow!.webContents.send('session-output', sessionId, data)
    } catch {
      // 窗口已被销毁
    }
  })
  
  ptyManager.onExit((sessionId, exitCode) => {
    if (!isWindowValid()) return
    try {
      mainWindow!.webContents.send('session-exit', sessionId, exitCode)
    } catch {
      // 窗口已被销毁
    }
  })

  // SSH 连接状态推送：connecting → ready/error
  ptyManager.onConnStatus((sessionId, status) => {
    if (!isWindowValid()) return
    try {
      mainWindow!.webContents.send('session-conn-status', sessionId, status)
    } catch {
      // 窗口已被销毁
    }
  })

  // ========== 启动 Hook 服务器（Claude Code 等工具回调） ==========
  const hookHandler: HookRequestHandler = async (
    sessionId: string,
    payload: HookPayload
  ): Promise<HookResponse> => {
    if (payload.action === 'get') {
      // 查询会话状态
      if (sessionId) {
        const session = ptyManager.listSessions().find(id => id === sessionId)
        if (!session) {
          return { success: false, error: 'Session not found' }
        }
        // 从渲染进程 store 获取会话详情（通过 IPC 回传）
        if (!isWindowValid()) {
          return { success: false, error: 'Renderer not ready' }
        }
        const sessionData = await mainWindow!.webContents.executeJavaScript(
          `window.__getHookSessionData?.('${sessionId}')`
        )
        return { success: true, sessionId, data: sessionData }
      } else {
        // 列出所有会话
        if (!isWindowValid()) {
          return { success: false, error: 'Renderer not ready' }
        }
        const allSessions = await mainWindow!.webContents.executeJavaScript(
          `window.__getHookAllSessions?.()`
        )
        return { success: true, data: allSessions }
      }
    }

    if (payload.action === 'claude-transcript') {
      // Claude Code hook 报告 transcript 路径：绑定 watch，后续增量推送到渲染进程
      if (!sessionId || !payload.transcriptPath) {
        return { success: false, error: 'Missing sessionId or transcriptPath' }
      }
      transcriptManager?.bind(sessionId, payload.claudeSessionId || '', payload.transcriptPath)
      return { success: true, sessionId }
    }

    if (payload.action === 'update') {
      // 更新会话状态（推送到渲染进程）
      if (!sessionId) {
        return { success: false, error: 'Missing sessionId' }
      }
      if (!isWindowValid()) {
        return { success: false, error: 'Renderer not ready' }
      }
      try {
        mainWindow!.webContents.send('hook-status-update', sessionId, payload)
        return { success: true, sessionId, newStatus: payload.status }
      } catch (e) {
        return { success: false, error: (e as Error).message }
      }
    }

    return { success: false, error: 'Unknown action' }
  }

  hookServer = createHookServer(HOOK_PORT, hookHandler)

  // Transcript 管理器：增量解析结果经 IPC 推送渲染进程（全屏 MD 对话流数据源）
  transcriptManager = createTranscriptManager(
    (sessionId, appended) => {
      if (!isWindowValid()) return
      try {
        mainWindow!.webContents.send('claude-transcript', sessionId, appended)
      } catch {
        // 窗口已被销毁
      }
    },
    // Claude Code /rename → transcript 追加 summary 条目 → 推送新会话名（卡片名双向绑定）
    (sessionId, name) => {
      if (!isWindowValid()) return
      try {
        mainWindow!.webContents.send('claude-session-name', sessionId, name)
      } catch {
        // 窗口已被销毁
      }
    }
  )

  // Claude Code 集成配置（读写 ~/.claude/settings.json 的 hooks）
  ipcMain.handle('claude-integration-status', () => ({
    configured: claudeIntegrationConfigured(),
    hookPath: getTranscriptHookPath()
  }))
  ipcMain.handle('claude-integration-enable', () => claudeIntegrationEnable())
  ipcMain.handle('claude-integration-disable', () => claudeIntegrationDisable())

  // 系统通知
  ipcMain.handle('show-notification', (_event, title: string, body: string, sound?: boolean) => {
    const { Notification } = require('electron')
    if (Notification.isSupported()) {
      const notification = new Notification({
        title,
        body,
        silent: !sound,
        icon: getIconPath()
      })
      notification.show()
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // 所有平台先释放 PTY：darwin 关窗后应用常驻，避免留下无头 PTY 孤儿进程；
  // 其余平台随后 app.quit() → before-quit 里会再次 dispose（dispose 对空 Map 无害、幂等）
  ptyManager.dispose()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  ptyManager.dispose()
  // 释放 transcript watcher
  transcriptManager?.dispose()
  transcriptManager = null
  // 关闭 Hook 服务器
  if (hookServer) {
    // 先主动断开所有保持中的连接（http.Server 的 Node ≥18.2 API，
    // 可选调用保证低版本运行时静默跳过），再 close 更利于 close 回调完成
    hookServer.closeAllConnections?.()
    hookServer.close()
    hookServer = null
  }
})
