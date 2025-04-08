import { ipcMain } from 'electron'
import { createSite, deleteSite, getSites } from '../services/site'

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
}
