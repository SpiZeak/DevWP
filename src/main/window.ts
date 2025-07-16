import { BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { startDockerCompose } from './services/docker'
import { startContainerMonitoring } from './ipc/container'
import { registerXdebugHandlers } from './ipc/xdebug'
import { registerWpCliHandlers } from './ipc/wpCli'

export function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'default',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false
    }
  })

  // Add external URL handler
  ipcMain.handle('open-external', async (_, url) => {
    await shell.openExternal(url)
    return true
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Start container monitoring when window is loaded
  mainWindow.webContents.on('did-finish-load', () => {
    // Start docker compose
    startDockerCompose(mainWindow).catch((err) => {
      console.error('Docker compose failed:', err)
    })

    // Start container monitoring
    startContainerMonitoring(mainWindow)

    // Register Xdebug handlers
    registerXdebugHandlers(mainWindow)

    // Register WP-CLI handlers
    registerWpCliHandlers()
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}
