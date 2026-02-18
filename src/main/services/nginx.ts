import { exec, spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import {
  getAllSiteConfigurations,
  getWebrootPath,
  type SiteConfiguration,
} from './database';

const nginxConfigPath = join(process.cwd(), 'config', 'nginx');
const sitesEnabledPath = join(nginxConfigPath, 'sites-enabled');
const templatePath = join(nginxConfigPath, 'template-site.conf');

type SiteConfigLookup = Record<string, SiteConfiguration | undefined>;

export async function generateNginxConfig(
  domain: string,
  webRoot: string,
  aliases?: string,
  multisite?: {
    enabled: boolean;
    type: 'subdomain' | 'subdirectory';
  },
): Promise<void> {
  try {
    const templateContent = await fs.readFile(templatePath, 'utf8');
    const allDomains = [domain, ...(aliases?.split(' ') || [])]
      .filter(Boolean)
      .join(' ');

    let finalConfig = templateContent
      .replace(/server_name example\.com;/g, `server_name ${allDomains};`)
      .replace(/root \/src\/www\/example\.com;/g, `root ${webRoot};`);

    if (multisite?.enabled) {
      if (multisite.type === 'subdirectory') {
        finalConfig = finalConfig.replace(
          '# include global/wordpress-ms-subdir.conf;',
          'include global/wordpress-ms-subdir.conf;',
        );
        finalConfig = finalConfig.replace(
          'include global/wordpress.conf;',
          '# include global/wordpress.conf;',
        );
      } else {
        // subdomain
        finalConfig = finalConfig.replace(
          '# include global/wordpress-ms-subdomain.conf;',
          'include global/wordpress-ms-subdomain.conf;',
        );
        finalConfig = finalConfig.replace(
          'include global/wordpress.conf;',
          '# include global/wordpress.conf;',
        );
      }
    }

    const newConfigPath = join(sitesEnabledPath, `${domain}.conf`);
    await fs.writeFile(newConfigPath, finalConfig, 'utf8');
    console.log(`Generated Nginx config for ${domain}`);
    await reloadNginx();
  } catch (error) {
    console.error(`Failed to generate Nginx config for ${domain}:`, error);
    throw error;
  }
}

export async function removeNginxConfig(domain: string): Promise<void> {
  try {
    const configPath = join(sitesEnabledPath, `${domain}.conf`);
    await fs.unlink(configPath);
    console.log(`Removed Nginx config for ${domain}`);
    await reloadNginx();
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      console.log(`Nginx config for ${domain} not found, skipping removal.`);
      return;
    }
    console.error(`Failed to remove Nginx config for ${domain}:`, error);
    throw error;
  }
}

async function reloadNginx(): Promise<void> {
  return new Promise((resolve, reject) => {
    exec('docker compose exec nginx nginx -s reload', (error, _, stderr) => {
      if (error) {
        console.error(`Error reloading Nginx: ${stderr}`);
        reject(error);
        return;
      }
      console.log('Nginx reloaded successfully.');
      resolve();
    });
  });
}

export async function reloadNginxConfig(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const reloadProcess = spawn('docker', [
      'compose',
      'exec',
      'nginx',
      'nginx',
      '-s',
      'reload',
    ]);

    reloadProcess.on('close', (code) => {
      if (code === 0) {
        console.log('Nginx configuration reloaded successfully');
        resolve();
      } else {
        console.error(
          `Failed to reload Nginx configuration: exited with code ${code}`,
        );
        reject(
          new Error(
            `Failed to reload Nginx configuration: exited with code ${code}`,
          ),
        );
      }
    });
  });
}

async function readTemplate(): Promise<string> {
  return fs.readFile(templatePath, 'utf8');
}

async function loadSiteConfigs(): Promise<SiteConfigLookup> {
  let configs: SiteConfiguration[] = [];

  try {
    configs = await getAllSiteConfigurations();
  } catch (error) {
    console.warn('Failed to load site configs from database:', error);
  }

  return configs.reduce<SiteConfigLookup>((acc, config) => {
    acc[config.domain] = config;
    return acc;
  }, {});
}

async function listFilesystemSites(): Promise<string[]> {
  try {
    const webrootBase = await getWebrootPath();
    const entries = await fs.readdir(webrootBase, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .filter((entry) => !['.', '..', '.git'].includes(entry.name))
      .map((entry) => entry.name);
  } catch (error) {
    console.warn('Failed to read filesystem sites:', error);
    return [];
  }
}

function buildNginxConfig(
  templateContent: string,
  domain: string,
  webRoot: string,
  aliases?: string,
  multisite?: {
    enabled: boolean;
    type: 'subdomain' | 'subdirectory';
  },
): string {
  const allDomains = [domain, ...(aliases?.split(' ') || [])]
    .filter(Boolean)
    .join(' ');

  let finalConfig = templateContent
    .replace(/server_name example\.com;/g, `server_name ${allDomains};`)
    .replace(/root \/src\/www\/example\.com;/g, `root ${webRoot};`);

  if (multisite?.enabled) {
    if (multisite.type === 'subdirectory') {
      finalConfig = finalConfig.replace(
        '# include global/wordpress-ms-subdir.conf;',
        'include global/wordpress-ms-subdir.conf;',
      );
      finalConfig = finalConfig.replace(
        'include global/wordpress.conf;',
        '# include global/wordpress.conf;',
      );
    } else {
      // subdomain
      finalConfig = finalConfig.replace(
        '# include global/wordpress-ms-subdomain.conf;',
        'include global/wordpress-ms-subdomain.conf;',
      );
      finalConfig = finalConfig.replace(
        'include global/wordpress.conf;',
        '# include global/wordpress.conf;',
      );
    }
  }

  return finalConfig;
}

export async function regenerateMissingNginxConfigs(): Promise<string[]> {
  const templateContent = await readTemplate();
  const configLookup = await loadSiteConfigs();
  const filesystemSites = await listFilesystemSites();

  const siteNames = Array.from(
    new Set([...Object.keys(configLookup), ...filesystemSites]),
  ).filter(Boolean);

  if (siteNames.length === 0) {
    return [];
  }

  await fs.mkdir(sitesEnabledPath, { recursive: true });

  const created: string[] = [];
  for (const domain of siteNames) {
    const configPath = join(sitesEnabledPath, `${domain}.conf`);

    try {
      await fs.access(configPath);
      continue;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    const siteConfig = configLookup[domain];
    const webRoot = `/src/www/${domain}${
      siteConfig?.webRoot ? '/' + siteConfig.webRoot : ''
    }`;

    const configContent = buildNginxConfig(
      templateContent,
      domain,
      webRoot,
      siteConfig?.aliases,
      siteConfig?.multisite,
    );

    await fs.writeFile(configPath, configContent, 'utf8');
    created.push(domain);
  }

  return created;
}
