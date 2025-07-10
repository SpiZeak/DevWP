import { exec } from 'child_process'
import { ipcMain } from 'electron'

export function registerWpCliHandlers(): void {
  // Remove existing handlers before registering new ones
  ipcMain.removeHandler('run-wp-cli')

  ipcMain.handle('run-wp-cli', async (_, { site, command }) => {
    return new Promise((resolve) => {
      const dockerCmd = `docker exec -w /src/www/${site.name} devwp_php php -d error_reporting="E_ALL & ~E_DEPRECATED & ~E_WARNING" /usr/local/bin/wp ${command} 2>/dev/null`
      exec(dockerCmd, (error, stdout, stderr) => {
        if (error) {
          resolve({ success: false, error: stderr || error.message })
        } else {
          resolve({ success: true, output: stdout })
        }
      })
    })
  })
}
