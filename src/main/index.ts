import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { exec } from 'child_process'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  ipcMain.on('start-service', (_, serviceName) => {
    exec(`docker-compose up ${serviceName}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error starting service: ${stderr}`)
        return
      }
      console.log(`Service started: ${stdout}`)
    })
  })

  ipcMain.on('stop-service', (_, serviceName) => {
    exec(`docker-compose down ${serviceName}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error stopping service: ${stderr}`)
        return
      }
      console.log(`Service stopped: ${stdout}`)
    })
  })

  ipcMain.on('get-status', async () => {
    return new Promise<string>((resolve, reject) => {
      exec('docker-compose ps', (error, stdout, stderr) => {
        if (error) {
          console.error(`Error getting status: ${stderr}`)
          reject(`Error getting status: ${stderr}`)
        } else {
          console.log(`Status: ${stdout}`)
          resolve(stdout)
        }
      })
    })
  })

  // Add this new IPC handler for sites
  ipcMain.handle('get-sites', async (event) => {
    return new Promise((resolve, reject) => {
      // Read domains from environment variable or from the file system
      const domainsStr = process.env.DOMAINS || ''

      // Read sites directory content
      exec('ls -la ./www', (error, stdout, stderr) => {
        if (error) {
          console.error(`Error reading sites directory: ${stderr}`)
          reject(`Error reading sites directory: ${stderr}`)
          return
        }

        // Parse domains from env and actual directories
        const envDomains = domainsStr
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean)

        // Get directories from the output
        const dirRegex = /\s(\S+)$/gm
        const dirs = []
        let match

        const lines = stdout.split('\n')
        for (const line of lines) {
          if (line.startsWith('d')) {
            match = dirRegex.exec(line)
            if (match && !['.', '..', '.git'].includes(match[1])) {
              dirs.push(match[1])
            }
            dirRegex.lastIndex = 0 // Reset regex state
          }
        }

        // Combine both sources and create site objects
        const allDomains = [...new Set([...envDomains, ...dirs])]

        const sites = allDomains.map((domain) => ({
          name: domain,
          path: `/src/www/${domain}`,
          url: `https://${domain}`,
          active: dirs.includes(domain)
        }))

        resolve(sites)
      })
    })
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

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
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
