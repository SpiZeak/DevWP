import { ipcMain } from 'electron'
import { createSite, deleteSite, getSites, scanSiteWithSonarQube } from '../services/site' // Import scanSiteWithSonarQube

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
