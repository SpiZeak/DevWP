import { exec } from 'child_process';
import { constants, promises as fs } from 'fs'; // Import constants
import { join } from 'path';
import {
  deleteSiteConfiguration,
  getAllSiteConfigurations,
  getSiteConfiguration,
  getWebrootPath,
  initializeConfigDatabase,
  migrateExistingSites,
  type SiteConfiguration,
  saveSiteConfiguration,
} from './database';
import {
  generateFrankenphpConfig,
  reloadFrankenphpConfig,
  removeFrankenphpConfig,
} from './frankenphp';
import { modifyHostsFile } from './hosts';

export interface Site {
  name: string;
  path: string;
  url: string;
  status?: string;
  // Add configuration data from database
  aliases?: string;
  webRoot?: string;
  multisite?: {
    enabled: boolean;
    type: 'subdomain' | 'subdirectory';
  };
  createdAt?: Date;
  updatedAt?: Date;
}

// Sanitize a site domain to create a valid MySQL/MariaDB database name
function sanitizeDatabaseName(siteDomain: string): string {
  // MySQL/MariaDB database name rules:
  // - Can contain letters, digits, underscore (_), and dollar sign ($)
  // - Cannot contain hyphens, spaces, or other special characters
  // - Maximum length is 64 characters
  // - Should start with a letter or underscore

  let dbName = siteDomain
    .replace(/[^a-zA-Z0-9_$]/g, '_') // Replace invalid chars with underscore
    .replace(/_{2,}/g, '_') // Replace consecutive underscores with single
    .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores

  // Ensure it starts with a letter or underscore
  if (dbName && !/^[a-zA-Z_]/.test(dbName)) {
    dbName = 'db_' + dbName;
  }

  // Ensure it's not empty - abort if no valid database name can be created
  if (!dbName) {
    throw new Error(
      `Cannot create a valid database name from site domain: '${siteDomain}'`,
    );
  }

  // Limit to 64 characters (MySQL limit)
  if (dbName.length > 64) {
    dbName = dbName.substring(0, 64).replace(/_+$/, ''); // Remove trailing underscores after truncation
  }

  return dbName;
}

// Install WordPress in the newly created site
async function installWordPress(
  siteDomain: string,
  dbName: string,
  webRoot?: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const baseSiteDir = `/src/www/${siteDomain}`;
    const wpInstallPath = webRoot ? `${baseSiteDir}/${webRoot}` : baseSiteDir;

    // Command to download WordPress core
    const downloadCmd = `docker compose exec frankenphp wp core download --path=${wpInstallPath} --force`;

    // Command to create wp-config.php
    const configCmd = `docker compose exec frankenphp wp config create --path=${wpInstallPath} --dbname=${dbName} --dbuser=root --dbpass=root --dbhost=mariadb --force`;

    // Command to install WordPress
    const installCmd = `docker compose exec frankenphp wp core install --path=${wpInstallPath} --url=https://${siteDomain} --title="${siteDomain}" --admin_user=root --admin_password=root --admin_email=admin@${siteDomain}`;

    console.log(`Downloading WordPress to ${wpInstallPath}...`);
    exec(downloadCmd, (downloadError, _, downloadStderr) => {
      if (downloadError) {
        console.error(`Error downloading WordPress: ${downloadStderr}`);
        reject(downloadError);
        return;
      }

      console.log('Downloaded WordPress core');
      console.log('Creating wp-config.php...');

      exec(configCmd, (configError, _, configStderr) => {
        if (configError) {
          console.error(`Error creating wp-config.php: ${configStderr}`);
          reject(configError);
          return;
        }

        console.log('Created wp-config.php');
        console.log('Installing WordPress...');

        exec(installCmd, (installError, _, installStderr) => {
          if (installError) {
            console.error(`Error installing WordPress: ${installStderr}`);
            reject(installError);
            return;
          }

          console.log(`Successfully installed WordPress on ${siteDomain}`);
          resolve();
        });
      });
    });
  });
}

type CleanupTask = () => Promise<void> | void;

async function createSite(site: {
  domain: string;
  webRoot?: string;
  aliases?: string;
  multisite?: {
    enabled: boolean;
    type: 'subdomain' | 'subdirectory';
  };
}): Promise<boolean> {
  const siteDomain = site.domain;
  const siteAliases = site.aliases
    ? site.aliases.split(' ').filter(Boolean)
    : [];
  const allDomains = [siteDomain, ...siteAliases];
  const webrootBase = await getWebrootPath();
  const siteBasePath = join(webrootBase, siteDomain);
  const actualWebRootPath = site.webRoot
    ? join(siteBasePath, site.webRoot)
    : siteBasePath;
  const webRootDirective = `/src/www/${siteDomain}${site.webRoot ? '/' + site.webRoot : ''}`;

  let dbName: string;
  try {
    dbName = sanitizeDatabaseName(siteDomain);
  } catch (error: any) {
    throw new Error(`Invalid site domain: ${error.message}`);
  }

  const sonarProjectKey = dbName;
  const sonarProjectName = siteDomain;
  const cleanupTasks: CleanupTask[] = [];

  const runCleanup = async (): Promise<void> => {
    const tasks = [...cleanupTasks].reverse();
    for (const task of tasks) {
      try {
        await task();
      } catch (cleanupError: any) {
        console.error(`Cleanup step failed for ${siteDomain}:`, cleanupError);
      }
    }
  };

  try {
    await initializeConfigDatabase();

    const existingSite = await getSiteConfiguration(siteDomain);
    if (existingSite) {
      throw new Error(`Site '${siteDomain}' already exists in configuration.`);
    }

    try {
      await fs.access(siteBasePath, constants.F_OK);
      throw new Error(`Site directory '${siteBasePath}' already exists.`);
    } catch (error: any) {
      if (error.code && error.code !== 'ENOENT') {
        console.error(
          `Error checking site directory for ${siteDomain}:`,
          error,
        );
        throw new Error(`Error checking site directory: ${error.message}`);
      }
      console.log(`Site directory ${siteBasePath} does not exist. Creating...`);
    }

    await fs.mkdir(actualWebRootPath, { recursive: true });
    console.log(`Created directory structure: ${actualWebRootPath}`);
    cleanupTasks.push(async () => {
      await fs.rm(siteBasePath, { recursive: true, force: true });
      console.log(
        `Removed directory structure during cleanup: ${siteBasePath}`,
      );
    });

    const addedHosts: string[] = [];
    for (const domain of allDomains) {
      await modifyHostsFile(domain, 'add');
      addedHosts.push(domain);
    }
    cleanupTasks.push(async () => {
      for (const domain of addedHosts) {
        try {
          await modifyHostsFile(domain, 'remove');
        } catch (hostsError) {
          console.error(
            `Failed to rollback hosts entry for ${domain}:`,
            hostsError,
          );
        }
      }
    });

    await generateFrankenphpConfig(
      siteDomain,
      webRootDirective,
      site.aliases,
      site.multisite,
    );
    cleanupTasks.push(async () => {
      try {
        await removeFrankenphpConfig(siteDomain);
      } catch (frankenphpError) {
        console.error(
          `Failed to rollback FrankenPHP config for ${siteDomain}:`,
          frankenphpError,
        );
      }
    });

    await createDatabase(dbName);
    cleanupTasks.push(async () => {
      try {
        await dropDatabase(dbName);
      } catch (dbError) {
        console.error(
          `Failed to drop database ${dbName} during cleanup:`,
          dbError,
        );
      }
    });

    await installWordPress(siteDomain, dbName, site.webRoot);

    if (site.multisite?.enabled) {
      await convertToMultisite(siteDomain, site.multisite, site.webRoot);
    }

    const siteConfig: SiteConfiguration = {
      domain: siteDomain,
      aliases: site.aliases,
      webRoot: site.webRoot,
      multisite: site.multisite,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await saveSiteConfiguration(siteConfig);
    console.log(`Saved site configuration to database: ${siteDomain}`);

    cleanupTasks.length = 0; // Successful completion, no cleanup required

    try {
      await createSonarQubeProject(sonarProjectName, sonarProjectKey);
    } catch (sonarError: any) {
      console.warn(
        `Failed to create SonarQube project for ${site.domain}: ${sonarError.message}`,
      );
    }

    return true;
  } catch (error: any) {
    await runCleanup();
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Site provisioning failed: ${message}`);
  }
}

// Create a database for the site
async function createDatabase(dbName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const createDbCmd = `docker exec devwp_mariadb mariadb -u root -proot -e "CREATE DATABASE IF NOT EXISTS ${dbName}"`;

    exec(createDbCmd, (error, _, stderr) => {
      if (error) {
        console.error(`Error creating database: ${stderr}`);
        reject(error);
        return;
      }
      console.log(`Created database: ${dbName}`);
      resolve();
    });
  });
}

// Update generateIndexHtml to include database information
export async function generateIndexHtml(
  domain: string,
  siteFilesystemBasePath: string, // This is www/domain
  dbName?: string,
  webRoot?: string,
): Promise<void> {
  try {
    const actualWebRootOnHost = webRoot
      ? join(siteFilesystemBasePath, webRoot)
      : siteFilesystemBasePath;
    const webRootPath = `/src/www/${domain}${webRoot ? '/' + webRoot : ''}`;

    // Ensure the target directory for index.html exists
    await fs.mkdir(actualWebRootOnHost, { recursive: true });

    const dbInfoHtml = dbName
      ? `
        <div class="info-box">
            <h3 style="margin-top: 0;">Database Information</h3>
            <ul>
                <li><strong>Database Name:</strong> ${dbName}</li>
                <li><strong>Database User:</strong> user</li>
                <li><strong>Database Password:</strong> password</li>
                <li><strong>Database Host:</strong> mariadb</li>
            </ul>
        </div>`
      : '';

    const indexHtmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to ${domain}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
        }
        h1 {
            color: #0066cc;
        }
        .container {
            background-color: #f9f9f9;
            border-radius: 5px;
            padding: 2rem;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        code {
            background-color: #f0f0f0;
            padding: 0.2rem 0.4rem;
            border-radius: 3px;
            font-family: monospace;
        }
        .footer {
            margin-top: 2rem;
            font-size: 0.8rem;
            color: #666;
            text-align: center;
        }
        .info-box {
            background-color: #e8f4ff;
            border-left: 4px solid #0066cc;
            padding: 1rem;
            margin: 1.5rem 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Welcome to ${domain}!</h1>
        <p>Your new WordPress development site has been created successfully.</p>

        <h2>Getting Started</h2>
        <p>You can now:</p>
        <ul>
            <li>Install WordPress in this directory</li>
            <li>Upload your existing WordPress files</li>
            <li>Start building your custom theme or plugin</li>
        </ul>

        <h2>Site Information</h2>
        <ul>
            <li><strong>Site URL:</strong> https://${domain}</li>
            <li><strong>Site Root (FrankenPHP):</strong> ${webRootPath}</li>
            <li><strong>Filesystem Path:</strong> ${actualWebRootOnHost}</li>
        </ul>

        ${dbInfoHtml}

        <div class="info-box">
            <h3 style="margin-top: 0;">FrankenPHP Configuration</h3>
            <p>A FrankenPHP (Caddy) configuration file has been automatically generated for this site at:</p>
            <code>config/frankenphp/sites-enabled/${domain}.caddy</code>
            <p>You can customize this file if you need specific server configurations for this site.</p>
        </div>

        <h2>Next Steps</h2>
        <p>Replace this file with your WordPress installation or custom development files.</p>
    </div>
    <div class="footer">
        <p>Generated by DevWP - Your Local WordPress Development Environment.<br />Brought to you by <a href="https://trewhitt.se">Trewhitt</a></p>
    </div>
</body>
</html>`;

    const indexPath = join(actualWebRootOnHost, 'index.html');
    await fs.writeFile(indexPath, indexHtmlContent, 'utf8');
    await fs.chmod(indexPath, 0o766);
    console.log(`Created index.html for ${domain} at ${indexPath}`);
  } catch (error) {
    console.error(`Failed to generate index.html for ${domain}:`, error);
    throw error;
  }
}

// Drop a database when deleting a site
async function dropDatabase(dbName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const dropDbCmd = `docker exec devwp_mariadb mariadb -u root -proot -e "DROP DATABASE IF EXISTS ${dbName}"`;

    exec(dropDbCmd, (error, _, stderr) => {
      if (error) {
        console.error(`Error dropping database: ${stderr}`);
        reject(error);
        return;
      }
      console.log(`Dropped database: ${dbName}`);
      resolve();
    });
  });
}

// Clear Redis cache for a site
async function clearRedisCache(siteDomain: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Using wildcard pattern to match any keys related to this site
    // This command uses a Redis EVAL script to find and delete keys on the server-side,
    // avoiding shell-specific piping (like | and xargs) which is not compatible with Windows cmd.
    const clearCacheCmd = `docker exec devwp_redis redis-cli EVAL "local keys = redis.call('KEYS', ARGV[1]); if #keys > 0 then return redis.call('DEL', unpack(keys)) else return 0 end" 0 "*${siteDomain}*"`;

    exec(clearCacheCmd, (error, _, stderr) => {
      if (error) {
        console.error(`Error clearing Redis cache: ${stderr}`);
        reject(error);
        return;
      }
      console.log(`Cleared Redis cache for: ${siteDomain}`);
      resolve();
    });
  });
}

function deleteSite(site: { name: string }): Promise<boolean> {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        const webrootBase = await getWebrootPath();
        const sitePath = join(webrootBase, site.name);

        let dbName: string;
        try {
          dbName = sanitizeDatabaseName(site.name);
        } catch (error: any) {
          reject(new Error(`Invalid site name: ${error.message}`));
          return;
        }

        const sonarProjectKey = dbName; // Use the same key convention

        // Initialize database if not already done
        await initializeConfigDatabase();

        // Get site configuration before deleting it to retrieve aliases
        const siteConfig = await getSiteConfiguration(site.name);

        // Delete from database
        await deleteSiteConfiguration(site.name);
        console.log(`Removed site configuration from database: ${site.name}`);

        // Continue with file system cleanup
        await fs.rm(sitePath, { recursive: true, force: true });

        // Remove primary domain from hosts file
        await modifyHostsFile(site.name, 'remove');

        // Remove aliases from hosts file if they exist
        if (siteConfig?.aliases) {
          const aliases = siteConfig.aliases.split(' ').filter(Boolean);
          for (const alias of aliases) {
            await modifyHostsFile(alias, 'remove');
          }
          console.log(`Removed aliases from hosts file: ${aliases.join(', ')}`);
        }

        await removeFrankenphpConfig(site.name);
        await dropDatabase(dbName);
        await clearRedisCache(site.name);

        // Clear Redis cache for aliases if they exist
        if (siteConfig?.aliases) {
          const aliases = siteConfig.aliases.split(' ').filter(Boolean);
          for (const alias of aliases) {
            await clearRedisCache(alias);
          }
          console.log(`Cleared Redis cache for aliases: ${aliases.join(', ')}`);
        }

        // Attempt to delete SonarQube project
        try {
          await deleteSonarQubeProject(sonarProjectKey);
        } catch (sonarError: any) {
          console.warn(
            `Failed to delete SonarQube project ${sonarProjectKey}: ${sonarError.message}`,
          );
          // Log the error but don't fail the site deletion
        }

        resolve(true);
      } catch (cleanupError: any) {
        reject(`Error cleaning up site: ${cleanupError}`);
      }
    })();
  });
}

async function getSites(): Promise<Site[]> {
  try {
    // Note: Database should already be initialized during app startup
    // We don't call initializeConfigDatabase() here to avoid repeated docker calls

    // Migrate existing sites to database if needed
    try {
      await migrateExistingSites();
    } catch (migrationError: any) {
      console.warn(
        'Site migration failed (container may not be running):',
        migrationError.message,
      );
      // Continue - we'll try filesystem fallback
    }

    // Get sites from database first (if container is available)
    let siteConfigs: SiteConfiguration[] = [];
    try {
      siteConfigs = await getAllSiteConfigurations();
    } catch (dbError: any) {
      console.warn(
        'Failed to get sites from database (container may not be running):',
        dbError.message,
      );
      // Continue with empty siteConfigs - we'll use filesystem fallback
    }

    // Also check filesystem for any sites not in database (fallback)
    const webrootBase = await getWebrootPath();
    const wwwPath = webrootBase;
    let filesystemSites: string[] = [];

    try {
      const entries = await fs.readdir(wwwPath, { withFileTypes: true });
      filesystemSites = entries
        .filter((entry) => entry.isDirectory())
        .filter((entry) => !['.', '..', '.git'].includes(entry.name))
        .map((entry) => entry.name);
    } catch (fsError) {
      // If www directory doesn't exist, that's fine - no filesystem sites
      console.log('No www directory found, using database sites only');
    }

    // Combine database configurations with filesystem presence
    const dbSiteNames = siteConfigs.map((config) => config.domain);
    const allSiteNames = [...new Set([...dbSiteNames, ...filesystemSites])];

    const sites: Site[] = [];

    for (const siteName of allSiteNames) {
      const config = siteConfigs.find((c) => c.domain === siteName);

      const site: Site = {
        name: siteName,
        path: join('www', siteName),
        url: `https://${siteName}`,
        // Include configuration data if available
        aliases: config?.aliases,
        webRoot: config?.webRoot,
        multisite: config?.multisite,
        createdAt: config?.createdAt,
        updatedAt: config?.updatedAt,
      };

      sites.push(site);
    }

    return sites;
  } catch (error: any) {
    const errorMsg = error?.message || error?.stderr || String(error);
    console.error(`Error getting sites:`, errorMsg);
    console.error('Full error:', error);
    throw new Error(`Error getting sites: ${errorMsg}`);
  }
}

// Convert a site to multisite
async function convertToMultisite(
  siteDomain: string,
  multisite:
    | { enabled: boolean; type: 'subdomain' | 'subdirectory' }
    | undefined,
  webRoot?: string,
): Promise<void> {
  if (!multisite?.enabled) return;

  return new Promise((resolve, reject) => {
    const baseSiteDir = `/src/www/${siteDomain}`;
    const wpInstallPath = webRoot ? `${baseSiteDir}/${webRoot}` : baseSiteDir;
    const subdomains = multisite.type === 'subdomain' ? '--subdomains' : '';

    // Command to enable multisite in wp-config.php
    const enableMultisiteCmd = `docker compose exec frankenphp wp core multisite-convert ${subdomains} --path=${wpInstallPath} --base=/`;

    console.log(
      `Converting ${siteDomain} to multisite (${multisite.type} mode) at ${wpInstallPath}...`,
    );
    exec(enableMultisiteCmd, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error converting to multisite: ${stderr}`);
        reject(error);
        return;
      }

      console.log(
        `Successfully converted ${siteDomain} to multisite (${multisite.type})`,
      );
      console.log(stdout);
      resolve();
    });
  });
}

// Create a SonarQube project
async function createSonarQubeProject(
  projectName: string,
  projectKey: string,
): Promise<void> {
  // Use token-based authentication instead of deprecated login/password
  // For SonarQube Community Edition, the default admin token should be generated or configured
  // This uses the default admin token pattern for local development
  const sonarToken = process.env.SONAR_TOKEN || 'sqa_admin_token_placeholder';

  // Ensure curl is installed in the frankenphp container:
  // Add 'RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*' to config/php/Dockerfile if needed
  const createProjectCmd = `docker compose exec frankenphp curl -H 'Authorization: Bearer ${sonarToken}' -X POST 'http://sonarqube:9000/api/projects/create' -d 'name=${encodeURIComponent(projectName)}&project=${encodeURIComponent(projectKey)}'`;

  return new Promise((resolve, reject) => {
    console.log(
      `Creating SonarQube project: ${projectName} (Key: ${projectKey}) using token authentication...`,
    );
    exec(createProjectCmd, (error, stdout, stderr) => {
      // SonarQube API might return errors in stdout with a 200 OK status initially,
      // or non-200 status codes for auth errors etc.
      // A successful creation might return JSON data or just status 200.
      // A failure (e.g., project key exists) might return JSON with an error message in stdout and status 400.
      // Let's check stderr first, then potential error messages in stdout.

      if (error) {
        // This usually catches network errors or if curl command fails fundamentally
        console.error(
          `Error executing SonarQube project creation command: ${stderr}`,
        );
        // Check if the error is due to authentication failure (HTTP 401)
        if (
          stderr.includes('401') ||
          stdout.includes('Authentication required') ||
          stderr.includes('Not authorized')
        ) {
          console.error(
            'SonarQube authentication failed. Check the SONAR_TOKEN environment variable or configure a valid API token.',
          );
          reject(
            new Error(
              'SonarQube authentication failed. Check the SONAR_TOKEN environment variable or configure a valid API token in SonarQube (Administration > Security > Users > Tokens).',
            ),
          );
        } else {
          reject(new Error(`Failed to execute curl command: ${error.message}`));
        }
        return;
      }

      // Check stdout for specific SonarQube API error messages (often returned with non-error HTTP status)
      // Example error: {"errors":[{"msg":"Project key already exists: ..."}]}
      // Example auth error (sometimes in stdout): {"errors":[{"msg":"Authentication required"}]}
      if (stdout.includes('"errors":')) {
        if (
          stdout.includes('Authentication required') ||
          stdout.includes('Not authorized')
        ) {
          console.error(
            'SonarQube authentication failed. Check the SONAR_TOKEN environment variable or configure a valid API token.',
          );
          reject(
            new Error(
              'SonarQube authentication failed. Check the SONAR_TOKEN environment variable or configure a valid API token in SonarQube (Administration > Security > Users > Tokens).',
            ),
          );
        } else {
          console.error(
            `SonarQube API error creating project ${projectKey}: ${stdout}`,
          );
          reject(new Error(`SonarQube API error: ${stdout}`));
        }
        return;
      }

      // If stderr is present but no 'error' object, it might be informational from curl
      if (stderr) {
        console.warn(
          `SonarQube project creation stderr (may be informational): ${stderr}`,
        );
      }

      console.log(
        `Successfully initiated SonarQube project creation for: ${projectName}`,
      );
      // Note: API call is asynchronous on the SonarQube server side.
      // We resolve here assuming the API call was accepted.
      resolve();
    });
  });
}

// Delete a SonarQube project
async function deleteSonarQubeProject(projectKey: string): Promise<void> {
  // Use token-based authentication instead of deprecated login/password
  const sonarToken = process.env.SONAR_TOKEN || 'sqa_admin_token_placeholder';

  // Ensure curl is installed in the frankenphp container
  const deleteProjectCmd = `docker compose exec frankenphp curl -H 'Authorization: Bearer ${sonarToken}' -X POST 'http://sonarqube:9000/api/projects/delete' -d 'project=${encodeURIComponent(projectKey)}'`;

  return new Promise((resolve, reject) => {
    console.log(
      `Deleting SonarQube project (Key: ${projectKey}) using token authentication...`,
    );
    exec(deleteProjectCmd, (error, stdout, stderr) => {
      // Similar error handling as createSonarQubeProject

      if (error) {
        console.error(
          `Error executing SonarQube project deletion command: ${stderr}`,
        );
        if (
          stderr.includes('401') ||
          stdout.includes('Authentication required') ||
          stderr.includes('Not authorized')
        ) {
          console.error(
            'SonarQube authentication failed. Check the SONAR_TOKEN environment variable.',
          );
          reject(
            new Error(
              'SonarQube authentication failed. Check the SONAR_TOKEN environment variable.',
            ),
          );
        } else {
          reject(new Error(`Failed to execute curl command: ${error.message}`));
        }
        return;
      }

      // Check stdout for API errors (e.g., project not found might be here or indicated by status code handled by error object)
      // SonarQube might return 204 No Content on success, or errors in JSON.
      if (stdout.includes('"errors":')) {
        if (
          stdout.includes('Authentication required') ||
          stdout.includes('Not authorized')
        ) {
          console.error(
            'SonarQube authentication failed. Check the SONAR_TOKEN environment variable.',
          );
          reject(
            new Error(
              'SonarQube authentication failed. Check the SONAR_TOKEN environment variable.',
            ),
          );
        } else if (stdout.includes('not found')) {
          console.warn(
            `SonarQube project ${projectKey} not found for deletion (may have already been deleted).`,
          );
          resolve(); // Resolve successfully if project not found
        } else {
          console.error(
            `SonarQube API error deleting project ${projectKey}: ${stdout}`,
          );
          reject(new Error(`SonarQube API error: ${stdout}`));
        }
        return;
      }

      // Check stderr for potential issues not caught by 'error'
      if (stderr) {
        // Ignore "Empty reply from server" which can happen with 204 responses in some curl versions
        if (!stderr.includes('Empty reply from server')) {
          console.warn(
            `SonarQube project deletion stderr (may be informational): ${stderr}`,
          );
        }
      }

      console.log(
        `Successfully initiated SonarQube project deletion for: ${projectKey}`,
      );
      // API call is asynchronous on the SonarQube server side.
      resolve();
    });
  });
}

// Scan a site with SonarQube using token authentication
export async function scanSiteWithSonarQube(siteDomain: string): Promise<void> {
  let projectKey: string;
  try {
    projectKey = sanitizeDatabaseName(siteDomain);
  } catch (error: any) {
    throw new Error(`Invalid site domain for SonarQube scan: ${error.message}`);
  }
  // SonarQube scanner needs to know the webRoot if sources are there.
  // However, getSites doesn't know webRoot. This implies scanSiteWithSonarQube
  // might need to discover it or be passed it. For now, assuming webRoot is not
  // directly used by SonarQube path unless it's the *only* content.
  // Let's assume SonarQube scans the entire www/siteDomain directory for now.
  // If webRoot is consistently where all scannable code is, this path should be adjusted.
  const sourcePathInContainer = `/src/www/${siteDomain}`; // Path inside the scanner container
  const sonarHostUrl = 'http://sonarqube:9000';

  // Use token-based authentication instead of deprecated login/password
  const sonarToken = process.env.SONAR_TOKEN || 'sqa_admin_token_placeholder';

  // Construct the sonar-scanner command using token authentication
  // Note: Assumes the sonarqube-scanner service is running and has access to the source code volume
  const scanCmd = `docker compose run sonarqube-scanner sonar-scanner \
    -Dsonar.projectKey=${projectKey} \
    -Dsonar.sources=${sourcePathInContainer} \
    -Dsonar.host.url=${sonarHostUrl} \
    -Dsonar.token=${sonarToken}`;

  return new Promise((resolve, reject) => {
    console.log(
      `Starting SonarQube scan for project: ${projectKey} (Site: ${siteDomain}) using token authentication...`,
    );
    exec(scanCmd, (error, stdout, stderr) => {
      if (error) {
        console.error(
          `Error executing SonarQube scan command for ${siteDomain}: ${stderr}`,
        );
        // Provide more specific feedback if possible
        if (
          stderr.includes('Authentication failed') ||
          stderr.includes('Not authorized') ||
          stderr.includes('401')
        ) {
          reject(
            new Error(
              'SonarQube authentication failed. Check the SONAR_TOKEN environment variable or configure a valid API token in SonarQube (Administration > Security > Users > Tokens).',
            ),
          );
        } else if (stderr.includes('Project not found')) {
          reject(
            new Error(
              `SonarQube project '${projectKey}' not found. Ensure it was created successfully.`,
            ),
          );
        } else {
          reject(new Error(`SonarQube scan failed: ${error.message}`));
        }
        return;
      }

      // Log stdout and stderr for debugging purposes (scanner output)
      if (stdout) {
        console.log(`SonarQube scan stdout for ${siteDomain}:\n${stdout}`);
      }
      if (stderr) {
        console.warn(`SonarQube scan stderr for ${siteDomain}:\n${stderr}`); // Use warn as stderr might contain non-fatal info
      }

      // Check stdout for explicit success or failure messages if the exit code is 0 but scan failed
      if (stdout.includes('EXECUTION_FAILURE')) {
        console.error(
          `SonarQube scan for ${siteDomain} reported execution failure.`,
        );
        reject(
          new Error('SonarQube scan execution failed. Check scanner logs.'),
        );
        return;
      }

      // Check for authentication errors in stdout as well
      if (
        stdout.includes('Not authorized') ||
        stdout.includes('Authentication required')
      ) {
        reject(
          new Error(
            'SonarQube authentication failed. Check the SONAR_TOKEN environment variable or configure a valid API token in SonarQube (Administration > Security > Users > Tokens).',
          ),
        );
        return;
      }

      console.log(
        `Successfully completed SonarQube scan initiation for: ${siteDomain}`,
      );
      // Note: The scan itself runs asynchronously on the SonarQube server.
      // This promise resolves when the scanner CLI finishes its execution.
      resolve();
    });
  });
}

// Update site configuration
async function updateSite(
  site: Site,
  updateData: { aliases?: string; webRoot?: string },
): Promise<void> {
  console.log('updateSite called with:', { site, updateData });
  try {
    // Get current site configuration
    let currentConfig = await getSiteConfiguration(site.name);
    console.log('Current config:', currentConfig);

    if (!currentConfig) {
      // Create a basic configuration if it doesn't exist
      console.log(`Creating new configuration for site: ${site.name}`);
      currentConfig = {
        domain: site.name,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    // Update the configuration with new data
    const updatedConfig = {
      ...currentConfig,
      aliases:
        updateData.aliases !== undefined
          ? updateData.aliases
          : currentConfig.aliases,
      webRoot:
        updateData.webRoot !== undefined
          ? updateData.webRoot
          : currentConfig.webRoot,
      updatedAt: new Date(),
    };

    console.log('Updated config:', updatedConfig);

    // Save the updated configuration
    await saveSiteConfiguration(updatedConfig);
    console.log('Configuration saved successfully');

    // Regenerate FrankenPHP configuration with updated settings
    const webRootDirective = `/src/www/${site.name}${
      updatedConfig.webRoot ? '/' + updatedConfig.webRoot : ''
    }`;

    console.log('FrankenPHP root directive:', webRootDirective);

    // Regenerate FrankenPHP config
    await generateFrankenphpConfig(
      site.name,
      webRootDirective,
      updatedConfig.aliases,
      updatedConfig.multisite,
    );
    console.log('FrankenPHP config generated successfully');

    // Reload FrankenPHP to apply the new configuration
    await reloadFrankenphpConfig();
    console.log('FrankenPHP reloaded successfully');

    console.log(`Successfully updated site configuration for: ${site.name}`);
  } catch (error) {
    console.error(`Failed to update site ${site.name}:`, error);
    throw error;
  }
}

export { createSite, deleteSite, getSites, updateSite };
