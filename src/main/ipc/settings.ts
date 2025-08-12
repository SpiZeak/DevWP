import { ipcMain } from 'electron'
import {
  saveSetting,
  getSetting,
  getAllSettings,
  deleteSetting,
  getWebrootPath
} from '../services/database'

export function registerSettingsHandlers(): void {
  // Get all settings
  ipcMain.handle('get-settings', async () => {
    try {
      return await getAllSettings()
    } catch (error) {
      console.error('Error getting settings:', error)
      return {}
    }
  })

  // Get a specific setting
  ipcMain.handle('get-setting', async (_, key: string) => {
    try {
      return await getSetting(key)
    } catch (error) {
      console.error(`Error getting setting ${key}:`, error)
      return null
    }
  })

  // Save a setting
  ipcMain.handle('save-setting', async (_, key: string, value: string) => {
    try {
      await saveSetting(key, value)
      return { success: true }
    } catch (error) {
      console.error(`Error saving setting ${key}:`, error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  // Delete a setting
  ipcMain.handle('delete-setting', async (_, key: string) => {
    try {
      await deleteSetting(key)
      return { success: true }
    } catch (error) {
      console.error(`Error deleting setting ${key}:`, error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  // Get webroot path with default fallback
  ipcMain.handle('get-webroot-path', async () => {
    try {
      return await getWebrootPath()
    } catch (error) {
      console.error('Error getting webroot path:', error)
      // Return default fallback
      const os = await import('os')
      const path = await import('path')
      return path.join(os.homedir(), 'www')
    }
  })
}
