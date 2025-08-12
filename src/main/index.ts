import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createWindow } from './window'
import { registerContainerHandlers, stopContainerMonitoring } from './ipc/container'
import { registerSiteHandlers } from './ipc/site'
import { registerSettingsHandlers } from './ipc/settings'
import { stopDockerCompose } from './services/docker'
import { initializeConfigDatabase } from './services/database'
import { initializeXdebugStatus } from './services/xdebug'
import {
  installExtension,
  REACT_DEVELOPER_TOOLS,
  REDUX_DEVTOOLS
} from 'electron-devtools-installer'

// Register all IPC handlers
registerContainerHandlers()
registerSiteHandlers()
registerSettingsHandlers()

app.commandLine.appendSwitch('gtk-version', '3')

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(async () => {
  installExtension([REDUX_DEVTOOLS, REACT_DEVELOPER_TOOLS])
    .then(([redux, react]) => console.log(`Added Extensions:  ${redux.name}, ${react.name}`))
    .catch((err) => console.log('An error occurred: ', err))

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialize the database before creating the window
  try {
    await initializeConfigDatabase()
    console.log('Database initialized successfully')
  } catch (error) {
    console.error('Failed to initialize database:', error)
    // Continue anyway - the app should still work without database persistence
  }

  // Initialize Xdebug status from database after database is ready
  try {
    await initializeXdebugStatus()
    console.log('Xdebug status initialized successfully')
  } catch (error) {
    console.error('Failed to initialize Xdebug status:', error)
    // Continue anyway - Xdebug will fall back to file-based status checking
  }

  // Create window after database initialization
  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
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
