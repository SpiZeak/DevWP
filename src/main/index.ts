import { app } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createWindow } from './window'
import { registerContainerHandlers, stopContainerMonitoring } from './ipc/container'
import { registerSiteHandlers } from './ipc/site'
import { stopDockerCompose } from './services/docker'

// Register all IPC handlers
registerContainerHandlers()
registerSiteHandlers()

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Create window first
  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (app.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  // Stop container monitoring
  stopContainerMonitoring()

  stopDockerCompose()
    .catch((error) => {
      console.error('Failed to stop Docker containers:', error)
    })
    .finally(() => {
      if (process.platform !== 'darwin') {
        app.quit()
      }
    })
})
