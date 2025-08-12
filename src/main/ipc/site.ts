import { ipcMain } from 'electron'
import {
  createSite,
  deleteSite,
  getSites,
  scanSiteWithSonarQube,
  updateSite
} from '../services/site'

export function registerSiteHandlers(): void {
  ipcMain.handle('get-sites', async () => {
    return getSites()
  })

  ipcMain.handle(
    'create-site',
    async (
      _,
      site: {
        domain: string
        multisite?: {
          enabled: boolean
          type: 'subdomain' | 'subdirectory'
        }
      }
    ) => {
      return createSite(site)
    }
  )

  ipcMain.handle('delete-site', async (_, site) => {
    return deleteSite(site)
  })

  ipcMain.handle('update-site', async (_, site, updateData) => {
    console.log('IPC: update-site called with:', { site, updateData })
    try {
      await updateSite(site, updateData)
      console.log('IPC: updateSite completed successfully')
      return { success: true }
    } catch (error) {
      console.error('IPC: updateSite failed:', error)
      throw error
    }
  })

  // Add handler for SonarQube scan
  ipcMain.handle('scan-site-sonarqube', async (_, siteDomain: string) => {
    try {
      await scanSiteWithSonarQube(siteDomain)
      return { success: true }
    } catch (error: any) {
      console.error(`Error scanning site ${siteDomain} with SonarQube:`, error)
      return { success: false, error: error.message }
    }
  })
}
