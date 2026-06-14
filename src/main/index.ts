import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import path from 'path'
import { createPtyManager } from './pty'
import { createStorageManager } from './storage'

const ptyManager = createPtyManager()
const storageManager = createStorageManager()

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'TCommander',
    icon: path.join(__dirname, '../../build/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    // 隐藏系统默认标题栏（图标 + "Electron" 文字），消除顶部白色边框
    titleBarStyle: 'hidden',
    // 保留原生窗口控制按钮（最小化/最大化/关闭），但颜色由 CSS 变量
    // --title-bar-color / --title-bar-text-color 接管，自动适配明暗模式
    titleBarOverlay: {
      color: '#000000',
      symbolColor: '#ffffff',
      height: 36,
    },
    frame: true,
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../index.html'))
  }
}

function isWindowValid(): boolean {
  return mainWindow !== null && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()
}

app.whenReady().then(() => {
  // 移除默认菜单栏（File/Edit/View/Window/Help），保持界面简洁统一
  Menu.setApplicationMenu(null)

  ipcMain.handle('create-session', (_, config) => ptyManager.createSession(config))
  ipcMain.handle('send-input', (_, sessionId, data) => ptyManager.sendInput(sessionId, data))
  ipcMain.handle('close-session', (_, sessionId) => ptyManager.closeSession(sessionId))
  ipcMain.handle('resize-session', (_, sessionId, cols, rows) => 
    ptyManager.resizeSession(sessionId, cols, rows)
  )
  
  ipcMain.handle('storage-get', (_, key) => storageManager.get(key))
  ipcMain.handle('storage-set', (_, key, value) => storageManager.set(key, value))
  
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

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  ptyManager.dispose()
})
