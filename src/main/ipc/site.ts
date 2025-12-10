import { ipcMain } from 'electron';
import { logError, logger } from '../services/logger';
import {
  createSite,
  deleteSite,
  getSites,
  scanSiteWithSonarQube,
  updateSite,
} from '../services/site';
import { SiteConfigSchema } from '../validation/schemas';

export function registerSiteHandlers(): void {
  ipcMain.handle('get-sites', async () => {
    try {
      return await getSites();
    } catch (error) {
      logError('get-sites', error as Error);
      throw error;
    }
  });

  ipcMain.handle(
    'create-site',
    async (
      _,
      site: {
        domain: string;
        multisite?: {
          enabled: boolean;
          type: 'subdomain' | 'subdirectory';
        };
      },
    ) => {
      try {
        // Validate input data
        const validatedData = SiteConfigSchema.parse(site);

        // Transform to match createSite expected type
        const siteData = {
          domain: validatedData.domain,
          webRoot: validatedData.webRoot,
          aliases: validatedData.aliases,
          multisite: validatedData.multisite?.enabled
            ? {
                enabled: validatedData.multisite.enabled,
                type: validatedData.multisite.type || 'subdomain',
              }
            : undefined,
        };

        return await createSite(siteData);
      } catch (error) {
        logError('create-site', error as Error, { domain: site.domain });
        throw error;
      }
    },
  );

  ipcMain.handle('delete-site', async (_, site) => {
    try {
      return await deleteSite(site);
    } catch (error) {
      logError('delete-site', error as Error, { site });
      throw error;
    }
  });

  ipcMain.handle('update-site', async (_, site, updateData) => {
    logger.info('IPC: update-site called', { site, updateData });
    try {
      // Validate update data
      const updateSchema = SiteConfigSchema.partial();
      const validatedData = updateSchema.parse(updateData);

      await updateSite(site, validatedData);
      logger.info('IPC: updateSite completed successfully');
      return { success: true };
    } catch (error) {
      logError('update-site', error as Error, { site });
      throw error;
    }
  });

  // Add handler for SonarQube scan
  ipcMain.handle('scan-site-sonarqube', async (_, siteDomain: string) => {
    try {
      await scanSiteWithSonarQube(siteDomain);
      return { success: true };
    } catch (error: unknown) {
      const err = error as Error;
      logError('scan-site-sonarqube', err, { siteDomain });
      return { success: false, error: err.message };
    }
  });
}
