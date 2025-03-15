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

async function generateNginxConfig(domain: string): Promise<void> {
  try {
    // Read the template config
    const templatePath = join(__dirname, '../../config/nginx/template-site.conf')
    let templateContent = await fs.readFile(templatePath, 'utf8')

    // Replace placeholders with site-specific values
    templateContent = templateContent.replace(/example\.com/g, domain)

    // Ensure the sites-enabled directory exists
    await fs.mkdir(join(__dirname, '../../config/nginx/sites-enabled'), { recursive: true })

    // Write the new config file
    const configPath = join(__dirname, '../../config/nginx/sites-enabled', `${domain}.conf`)
    await fs.writeFile(configPath, templateContent, 'utf8')

    console.log(`Created Nginx config for ${domain} at ${configPath}`)
  } catch (error) {
    console.error(`Failed to generate Nginx config for ${domain}:`, error)
    throw error
  }
}

async function removeNginxConfig(domain: string): Promise<void> {
  try {
    const configPath = join(__dirname, '../../config/nginx/sites-enabled', `${domain}.conf`)

    // Check if the file exists before trying to delete it
    try {
      await fs.access(configPath)
      // If no error is thrown, file exists and we can delete it
      await fs.unlink(configPath)
      console.log(`Removed Nginx config for ${domain}`)
    } catch (_) {
      // File doesn't exist, so no need to delete it
      console.log(`Nginx config for ${domain} does not exist or is not accessible`)
    }
  } catch (error) {
    console.error(`Failed to remove Nginx config for ${domain}:`, error)
    throw error
  }
}

async function generateIndexHtml(domain: string, sitePath: string): Promise<void> {
  try {
    const indexHtmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to ${domain}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
        }
        h1 {
            color: #0066cc;
        }
        .container {
            background-color: #f9f9f9;
            border-radius: 5px;
            padding: 2rem;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        code {
            background-color: #f0f0f0;
            padding: 0.2rem 0.4rem;
            border-radius: 3px;
            font-family: monospace;
        }
        .footer {
            margin-top: 2rem;
            font-size: 0.8rem;
            color: #666;
            text-align: center;
        }
        .info-box {
            background-color: #e8f4ff;
            border-left: 4px solid #0066cc;
            padding: 1rem;
            margin: 1.5rem 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Welcome to ${domain}!</h1>
        <p>Your new WordPress development site has been created successfully.</p>

        <h2>Getting Started</h2>
        <p>You can now:</p>
        <ul>
            <li>Install WordPress in this directory</li>
            <li>Upload your existing WordPress files</li>
            <li>Start building your custom theme or plugin</li>
        </ul>

        <h2>Site Information</h2>
        <ul>
            <li><strong>Site URL:</strong> https://${domain}</li>
            <li><strong>Site Root:</strong> ${sitePath}</li>
        </ul>

        <div class="info-box">
            <h3 style="margin-top: 0;">Nginx Configuration</h3>
            <p>An Nginx configuration file has been automatically generated for this site at:</p>
            <code>config/nginx/sites-enabled/${domain}.conf</code>
            <p>You can customize this file if you need specific server configurations for this site.</p>
        </div>

        <h2>Next Steps</h2>
        <p>Replace this file with your WordPress installation or custom development files.</p>
    </div>
    <div class="footer">
        <p>Generated by DevWP - Your Local WordPress Development Environment</p>
    </div>
</body>
</html>`

    const indexPath = join(sitePath, 'index.html')
    await fs.writeFile(indexPath, indexHtmlContent, 'utf8')
    console.log(`Created index.html for ${domain}`)
  } catch (error) {
    console.error(`Failed to generate index.html for ${domain}:`, error)
    throw error
  }
}

// Add this function after your other utility functions
function stopDockerCompose(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('Stopping Docker containers...')
    const dockerProcess = spawn('docker-compose', ['down'])

    dockerProcess.on('close', (code) => {
      if (code === 0) {
        console.log('Docker containers stopped successfully')
        resolve()
      } else {
        const errorMsg = `Docker compose down exited with code ${code}`
        console.error(errorMsg)
        reject(new Error(errorMsg))
      }
    })
  })
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
      const sitePath = `./www/${site.domain}`
      exec(`mkdir -p ${sitePath}`, async (error, _, stderr) => {
        if (error) {
          console.error(`Error creating site directory: ${stderr}`)
          reject(`Error creating site directory: ${stderr}`)
          return
        }
        try {
          await modifyHostsFile(site.domain, 'add')
          await generateNginxConfig(site.domain)
          await generateIndexHtml(site.domain, sitePath)
          resolve(true) // Return a value to the renderer
        } catch (configError) {
          reject(`Error setting up site: ${configError}`)
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
          await removeNginxConfig(site.name)
          resolve(true) // Return a value to the renderer
        } catch (hostsError) {
          reject(`Error cleaning up site: ${hostsError}`)
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

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
