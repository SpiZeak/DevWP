import { exec } from 'child_process'
import { ipcMain } from 'electron'

export function registerIpcHandlers(): void {
  ipcMain.handle('run-wp-cli', async (_, { site, command }) => {
    return new Promise((resolve) => {
      // Adjust container name as needed
      const container = `devwp_php`
      // Compose the docker exec command
      const dockerCmd = `docker exec ${container} wp --path=${site.name} ${command}`
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
