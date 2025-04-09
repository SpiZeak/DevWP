import { ipcMain, BrowserWindow } from 'electron'
import { getXdebugStatus, toggleXdebug } from '../services/xdebug'

let mainWindow: BrowserWindow | null = null

export function registerXdebugHandlers(window: BrowserWindow): void {
  mainWindow = window

  ipcMain.handle('get-xdebug-status', async () => {
    return getXdebugStatus()
  })

  ipcMain.handle('toggle-xdebug', async () => {
    return toggleXdebug(mainWindow!)
  })
}
