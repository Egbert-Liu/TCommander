import { app, BrowserWindow, ipcMain } from 'electron'
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
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    frame: true,
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../index.html'))
  }
}

app.whenReady().then(() => {
  // 注册IPC处理器
  ipcMain.handle('create-session', (_, config) => ptyManager.createSession(config))
  ipcMain.handle('send-input', (_, sessionId, data) => ptyManager.sendInput(sessionId, data))
  ipcMain.handle('close-session', (_, sessionId) => ptyManager.closeSession(sessionId))
  ipcMain.handle('resize-session', (_, sessionId, cols, rows) => 
    ptyManager.resizeSession(sessionId, cols, rows)
  )
  
  ipcMain.handle('storage-get', (_, key) => storageManager.get(key))
  ipcMain.handle('storage-set', (_, key, value) => storageManager.set(key, value))
  
  // 转发PTY事件
  ptyManager.onOutput((sessionId, data) => {
    mainWindow?.webContents.send('session-output', sessionId, data)
  })
  
  ptyManager.onExit((sessionId, exitCode) => {
    mainWindow?.webContents.send('session-exit', sessionId, exitCode)
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
  ptyManager.closeAllSessions()
})
