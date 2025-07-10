import { exec } from 'child_process'
import { ipcMain } from 'electron'

export function registerWpCliHandlers(): void {
  ipcMain.handle('run-wp-cli', async (_, { site, command }) => {
    return new Promise((resolve) => {
      const dockerCmd = `docker exec devwp_php wp --path=/src/www/${site.name} ${command}`
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
