import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { exec, spawn } from 'child_process'
import sudo from 'sudo-prompt'
import { promises as fs } from 'fs'

function startDockerCompose(mainWindow?: BrowserWindow): Promise<void> {
  return new Promise((resolve, reject) => {
    // Start docker compose containers with real-time logging
    const dockerProcess = spawn('docker-compose', ['up', '-d', '--build'])

    // Send initial status if window exists
    if (mainWindow) {
      mainWindow.webContents.send('docker-status', {
        status: 'starting',
        message: 'Starting Docker containers...'
      })
    }

    dockerProcess.stdout.on('data', (data) => {
      const output = data.toString().trim()
      console.log(`Docker compose: ${output}`)
      if (mainWindow) {
        mainWindow.webContents.send('docker-status', {
          status: 'progress',
          message: output
        })
      }
    })

    dockerProcess.stderr.on('data', (data) => {
      const output = data.toString().trim()
      console.error(`Docker compose error: ${output}`)
      if (mainWindow) {
        mainWindow.webContents.send('docker-status', {
          status: 'error',
          message: output
        })
      }
    })

    dockerProcess.on('close', (code) => {
      console.log(`Docker compose process exited with code ${code}`)
      if (mainWindow) {
        mainWindow.webContents.send('docker-status', {
          status: code === 0 ? 'complete' : 'error',
          message: `Process exited with code ${code}`
        })
      }

      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Docker compose exited with code ${code}`))
      }
    })
  })
}

async function modifyHostsFile(domain: string, action: 'add' | 'remove'): Promise<void> {
  const hostsPath = '/etc/hosts'
  const hostsEntry = `127.0.0.1 ${domain}`
  try {
    let hostsContent = await fs.readFile(hostsPath, 'utf8')
    if (action === 'add') {
      if (!hostsContent.includes(hostsEntry)) {
        hostsContent += `\n${hostsEntry}`
      }
    } else if (action === 'remove') {
      hostsContent = hostsContent
        .split('\n')
        .filter((line) => !line.includes(domain))
        .join('\n')
    }
    const command = `echo "${hostsContent}" > ${hostsPath}`
    await new Promise<void>((resolve, reject) => {
      sudo.exec(command, { name: 'DevWP' }, (error) => {
        if (error) {
          console.error(`Failed to modify hosts file: ${error}`)
          reject(error)
        } else {
          resolve()
        }
      })
    })
  } catch (error) {
    console.error(`Failed to modify hosts file: ${error}`)
    throw error
  }
}

function createWindow(): BrowserWindow {
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

  // Add this new IPC handler for sites
  ipcMain.handle('get-sites', async () => {
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
        const dirs: string[] = []
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
          path: `www/${domain}`,
          url: `https://${domain}`,
          active: dirs.includes(domain)
        }))

        resolve(sites)
      })
    })
  })

  ipcMain.handle('create-site', async (_, site) => {
    return new Promise((resolve, reject) => {
      exec(`mkdir -p ./www/${site.domain}`, async (error, _, stderr) => {
        if (error) {
          console.error(`Error creating site directory: ${stderr}`)
          reject(`Error creating site directory: ${stderr}`)
          return
        }
        try {
          await modifyHostsFile(site.domain, 'add')
          resolve(true) // Return a value to the renderer
        } catch (hostsError) {
          reject(`Error modifying hosts file: ${hostsError}`)
        }
      })
    })
  })

  ipcMain.handle('delete-site', async (_, site) => {
    return new Promise((resolve, reject) => {
      exec(`rm -rf ./www/${site.name}`, async (error, _, stderr) => {
        if (error) {
          console.error(`Error deleting site directory: ${stderr}`)
          reject(`Error deleting site directory: ${stderr}`)
          return
        }
        try {
          await modifyHostsFile(site.name, 'remove')
          resolve(true) // Return a value to the renderer
        } catch (hostsError) {
          reject(`Error modifying hosts file: ${hostsError}`)
        }
      })
    })
  })

  // Add this with your other IPC handlers
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

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
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

  // Create window first
  const mainWindow = createWindow()

  // Default open or close DevTools by F12 in development
  // ...existing code...

  // Start docker compose after window is created and loaded
  mainWindow.webContents.on('did-finish-load', () => {
    startDockerCompose(mainWindow).catch((err) => {
      console.error('Docker compose failed:', err)
    })
  })

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
