import { spawn } from 'child_process'
import { BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'

let xdebugEnabled = false

export async function getXdebugStatus(): Promise<boolean> {
  try {
    // Check if xdebug is currently enabled by examining the container
    const result = await new Promise<boolean>((resolve, reject) => {
      const process = spawn('docker', [
        'compose',
        'exec',
        'php',
        'sh',
        '-c',
        'php -r "echo extension_loaded(\'xdebug\') ? 1 : 0;"'
      ])

      let output = ''

      process.stdout.on('data', (data) => {
        output += data.toString()
      })

      process.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim() === '1')
        } else {
          reject(new Error(`Process exited with code ${code}`))
        }
      })
    })

    xdebugEnabled = result
    return result
  } catch (error) {
    console.error('Error checking Xdebug status:', error)
    return xdebugEnabled
  }
}

export async function toggleXdebug(mainWindow?: BrowserWindow): Promise<boolean> {
  try {
    const configPath = join(process.cwd(), 'config', 'php', 'conf.d', 'xdebug.ini')
    const currentStatus = await getXdebugStatus()

    // Toggle the state by renaming xdebug.ini to xdebug.ini.disabled or vice versa
    if (currentStatus) {
      // Disable Xdebug: Rename xdebug.ini to xdebug.ini.disabled
      await fs.rename(configPath, `${configPath}.disabled`)
    } else {
      // Enable Xdebug: If xdebug.ini.disabled exists, rename it back to xdebug.ini
      if ((await fs.stat(`${configPath}.disabled`)).isFile()) {
        await fs.rename(`${configPath}.disabled`, configPath)
      }
    }

    // Restart the PHP container to apply changes
    return new Promise<boolean>((resolve, reject) => {
      if (mainWindow) {
        mainWindow.webContents.send('xdebug-status', {
          status: 'restarting',
          enabled: !currentStatus
        })
      }

      const process = spawn('docker', ['compose', 'restart', 'php'])

      process.on('close', async (code) => {
        if (code === 0) {
          // Update the status after restart
          xdebugEnabled = !currentStatus

          if (mainWindow) {
            mainWindow.webContents.send('xdebug-status', {
              status: 'complete',
              enabled: xdebugEnabled
            })
          }

          resolve(xdebugEnabled)
        } else {
          if (mainWindow) {
            mainWindow.webContents.send('xdebug-status', {
              status: 'error',
              message: `Failed to restart PHP container: exited with code ${code}`
            })
          }
          reject(new Error(`Failed to restart PHP container: exited with code ${code}`))
        }
      })
    })
  } catch (error) {
    console.error('Error toggling Xdebug:', error)
    throw error
  }
}
