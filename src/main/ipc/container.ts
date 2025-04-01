import { ipcMain, BrowserWindow } from 'electron'
import { getDockerContainers, restartContainer as restartDockerContainer } from '../services/docker'

// Set up interval to check containers periodically
let containerCheckInterval: NodeJS.Timeout | null = null

export function registerContainerHandlers(): void {
  // Add IPC handler for container status
  ipcMain.handle('get-container-status', async () => {
    return getDockerContainers()
  })

  // Add IPC handler for container restart
  ipcMain.handle('restart-container', async (_, containerId) => {
    return restartDockerContainer(containerId)
  })
}

export function startContainerMonitoring(window: BrowserWindow): void {
  // Clear any existing interval
  if (containerCheckInterval) {
    clearInterval(containerCheckInterval)
  }

  // Initial check
  getDockerContainers()
    .then((containers) => {
      window.webContents.send('container-status', containers)
    })
    .catch((error) => console.error('Error checking containers:', error))

  // Set up interval (check every 5 seconds)
  containerCheckInterval = setInterval(() => {
    getDockerContainers()
      .then((containers) => {
        window.webContents.send('container-status', containers)
      })
      .catch((error) => console.error('Error checking containers:', error))
  }, 5000)
}

export function stopContainerMonitoring(): void {
  if (containerCheckInterval) {
    clearInterval(containerCheckInterval)
    containerCheckInterval = null
  }
}
