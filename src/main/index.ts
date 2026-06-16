import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { createPtyManager } from './pty'
import { createStorageManager } from './storage'

const ptyManager = createPtyManager()
const storageManager = createStorageManager()

let mainWindow: BrowserWindow | null = null

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
