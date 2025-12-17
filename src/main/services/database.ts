import { exec } from 'node:child_process';

export interface SiteConfiguration {
  domain: string;
  aliases?: string;
  webRoot?: string;
  multisite?: {
    enabled: boolean;
    type: 'subdomain' | 'subdirectory';
  };
  createdAt: Date;
  updatedAt: Date;
}

// Database name for DevWP configuration
const DEVWP_CONFIG_DB = 'devwp_config';

// Settings interface
export interface SettingsConfiguration {
  key: string;
  value: string;
  updatedAt: Date;
}

// Wait for MariaDB container to be ready
export async function waitForDatabase(
  maxRetries = 30,
  delayMs = 1000,
): Promise<void> {
  console.log('Waiting for MariaDB container to be ready...');

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const testCmd =
          'docker exec devwp_mariadb mariadb -u root -proot -e "SELECT 1"';
        exec(testCmd, (error, _stdout, stderr) => {
          if (error) {
            reject(new Error(`Database not ready: ${stderr || error.message}`));
            return;
          }
          console.log('MariaDB container is ready!');
          resolve();
        });
      });
      return; // Success, exit the retry loop
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.log(
        `Database connection attempt ${attempt}/${maxRetries} failed: ${errorMessage}`,
      );

      if (attempt === maxRetries) {
        throw new Error(
          `Failed to connect to database after ${maxRetries} attempts`,
        );
      }

      // Wait before next attempt
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

// Initialize the DevWP configuration database and tables
export async function initializeConfigDatabase(): Promise<void> {
  console.log('Initializing DevWP config database...');

  try {
    // First wait for MariaDB to be ready
    await waitForDatabase();

    // Create the DevWP configuration database
    const createDbCmd = `docker exec devwp_mariadb mariadb -u root -proot -e "CREATE DATABASE IF NOT EXISTS ${DEVWP_CONFIG_DB}"`;
    console.log('Creating DevWP config database...');

    await new Promise<void>((resolve, reject) => {
      exec(createDbCmd, (error, _stdout, stderr) => {
        if (error) {
          reject(
            new Error(`Failed to create database: ${stderr || error.message}`),
          );
          return;
        }
        console.log(`Created/verified config database: ${DEVWP_CONFIG_DB}`);
        resolve();
      });
    });

    // Create sites table if it doesn't exist
    const createSitesTableCmd = `docker exec devwp_mariadb mariadb -u root -proot -D ${DEVWP_CONFIG_DB} -e "
      CREATE TABLE IF NOT EXISTS sites (
        domain VARCHAR(255) PRIMARY KEY,
        aliases TEXT,
        web_root VARCHAR(255),
        multisite_enabled BOOLEAN DEFAULT FALSE,
        multisite_type ENUM('subdomain', 'subdirectory') DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )"`;

    console.log('Creating sites table...');
    await new Promise<void>((resolve, reject) => {
      exec(createSitesTableCmd, (error, _stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `Failed to create sites table: ${stderr || error.message}`,
            ),
          );
          return;
        }
        console.log('Created/verified sites configuration table');
        resolve();
      });
    });

    // Create settings table if it doesn't exist
    const createSettingsTableCmd = `docker exec devwp_mariadb mariadb -u root -proot -D ${DEVWP_CONFIG_DB} -e "
      CREATE TABLE IF NOT EXISTS settings (
        key_name VARCHAR(255) PRIMARY KEY,
        value_text TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )"`;

    console.log('Creating settings table...');
    await new Promise<void>((resolve, reject) => {
      exec(createSettingsTableCmd, (error, _stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `Failed to create settings table: ${stderr || error.message}`,
            ),
          );
          return;
        }
        console.log('Created/verified settings configuration table');
        resolve();
      });
    });

    // Initialize default settings
    try {
      await initializeDefaultSettings();
      console.log('DevWP config database initialized successfully');
    } catch (error) {
      console.warn(
        'Failed to initialize default settings, continuing anyway:',
        error,
      );
    }
  } catch (error) {
    console.error('Failed to initialize config database:', error);
    throw error;
  }
}

// Initialize default settings
async function initializeDefaultSettings(): Promise<void> {
  try {
    // Check if webroot_path setting exists
    const existingWebrootPath = await getSetting('webroot_path');

    if (!existingWebrootPath) {
      // Set default webroot path to $HOME/www
      const os = await import('node:os');
      const path = await import('node:path');
      const defaultWebrootPath = path.join(os.homedir(), 'www');

      await saveSetting('webroot_path', defaultWebrootPath);
    }

    // Check if xdebug_enabled setting exists
    const existingXdebugSetting = await getSetting('xdebug_enabled');

    if (!existingXdebugSetting) {
      // Set default Xdebug state to false (disabled for performance)
      await saveSetting('xdebug_enabled', 'false');
    }
  } catch (error) {
    console.warn('Failed to initialize default settings:', error);
    // Don't reject, just log warning - this is not critical
  }
}

// Save site configuration to database
export async function saveSiteConfiguration(
  site: SiteConfiguration,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const aliases = site.aliases || '';
    const webRoot = site.webRoot || '';
    const multisiteEnabled = site.multisite?.enabled ? 1 : 0;
    const multisiteType = site.multisite?.type || null;

    const domainEscaped = `'${escapeSqlString(site.domain)}'`;
    const aliasesEscaped = `'${escapeSqlString(aliases)}'`;
    const webRootEscaped = `'${escapeSqlString(webRoot)}'`;
    const multisiteTypeEscaped = multisiteType
      ? `'${escapeSqlString(multisiteType)}'`
      : 'NULL';

    const insertCmd = `docker exec devwp_mariadb mariadb -u root -proot -D ${DEVWP_CONFIG_DB} -e "
      INSERT INTO sites (domain, aliases, web_root, multisite_enabled, multisite_type)
      VALUES (${domainEscaped}, ${aliasesEscaped}, ${webRootEscaped}, ${multisiteEnabled}, ${multisiteTypeEscaped})
      ON DUPLICATE KEY UPDATE
        aliases = VALUES(aliases),
        web_root = VALUES(web_root),
        multisite_enabled = VALUES(multisite_enabled),
        multisite_type = VALUES(multisite_type),
        updated_at = CURRENT_TIMESTAMP"`;

    exec(insertCmd, (error, _, stderr) => {
      if (error) {
        console.error(`Error saving site configuration: ${stderr}`);
        reject(error);
        return;
      }

      console.log(`Saved site configuration for: ${site.domain}`);
      resolve();
    });
  });
}

// Get all site configurations from database
export async function getAllSiteConfigurations(): Promise<SiteConfiguration[]> {
  return new Promise((resolve, reject) => {
    const selectCmd = `docker exec devwp_mariadb mariadb -u root -proot -D ${DEVWP_CONFIG_DB} -e "
      SELECT domain, aliases, web_root, multisite_enabled, multisite_type, created_at, updated_at
      FROM sites
      ORDER BY created_at ASC" --batch --raw`;

    exec(selectCmd, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error fetching site configurations: ${stderr}`);
        reject(error);
        return;
      }

      if (!stdout.trim()) {
        resolve([]);
        return;
      }

      try {
        const lines = stdout.trim().split('\n');
        const sites: SiteConfiguration[] = [];

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split('\t');
          const site: SiteConfiguration = {
            domain: values[0],
            aliases: values[1] || undefined,
            webRoot: values[2] || undefined,
            multisite: {
              enabled: values[3] === '1',
              type:
                values[4] === 'subdomain' || values[4] === 'subdirectory'
                  ? (values[4] as 'subdomain' | 'subdirectory')
                  : 'subdomain',
            },
            createdAt: new Date(values[5]),
            updatedAt: new Date(values[6]),
          };

          // Only include multisite config if enabled
          if (!site.multisite?.enabled) {
            delete site.multisite;
          }

          sites.push(site);
        }

        resolve(sites);
      } catch (parseError) {
        console.error('Error parsing site configurations:', parseError);
        reject(parseError);
      }
    });
  });
}

// Get a specific site configuration
// Helper to escape SQL string literals (single quotes)
function escapeSqlString(str: string): string {
  return str.replace(/'/g, "''");
}

export async function getSiteConfiguration(
  domain: string,
): Promise<SiteConfiguration | null> {
  return new Promise((resolve, reject) => {
    const safeDomain = escapeSqlString(domain);
    const selectCmd = `docker exec devwp_mariadb mariadb -u root -proot -D ${DEVWP_CONFIG_DB} -e "
      SELECT domain, aliases, web_root, multisite_enabled, multisite_type, created_at, updated_at
      FROM sites
      WHERE domain = '${safeDomain}'" --batch --raw`;

    exec(selectCmd, (error, stdout, stderr) => {
      if (error) {
        console.error(
          `Error fetching site configuration for ${domain}: ${stderr}`,
        );
        reject(error);
        return;
      }

      if (!stdout.trim()) {
        resolve(null);
        return;
      }

      try {
        const lines = stdout.trim().split('\n');
        if (lines.length < 2) {
          resolve(null);
          return;
        }

        const values = lines[1].split('\t');
        const site: SiteConfiguration = {
          domain: values[0],
          aliases: values[1] || undefined,
          webRoot: values[2] || undefined,
          multisite: {
            enabled: values[3] === '1',
            type:
              values[4] && values[4] !== 'NULL'
                ? (values[4] as 'subdomain' | 'subdirectory')
                : 'subdomain',
          },
          createdAt: new Date(values[5]),
          updatedAt: new Date(values[6]),
        };

        // Only include multisite config if enabled
        if (!site.multisite?.enabled) {
          delete site.multisite;
        }

        resolve(site);
      } catch (parseError) {
        console.error(
          `Error parsing site configuration for ${domain}:`,
          parseError,
        );
        reject(parseError);
      }
    });
  });
}

// Delete site configuration from database
export async function deleteSiteConfiguration(domain: string): Promise<void> {
  // Escape single quotes in domain to prevent SQL injection
  function escapeSqlString(str: string): string {
    return str.replace(/'/g, "''");
  }
  return new Promise((resolve, reject) => {
    const safeDomain = escapeSqlString(domain);
    const deleteCmd = `docker exec devwp_mariadb mariadb -u root -proot -D ${DEVWP_CONFIG_DB} -e "
      DELETE FROM sites WHERE domain = '${safeDomain}'"`;

    exec(deleteCmd, (error, _, stderr) => {
      if (error) {
        console.error(
          `Error deleting site configuration for ${domain}: ${stderr}`,
        );
        reject(error);
        return;
      }

      console.log(`Deleted site configuration for: ${domain}`);
      resolve();
    });
  });
}

// Migrate existing sites from filesystem to database
export async function migrateExistingSites(): Promise<void> {
  const { promises: fs } = await import('node:fs');

  try {
    const webrootBase = await getWebrootPath();
    const entries = await fs.readdir(webrootBase, { withFileTypes: true });

    // Get only directories (existing sites)
    const siteDirs = entries
      .filter((entry) => entry.isDirectory())
      .filter((entry) => !['.', '..', '.git'].includes(entry.name))
      .map((entry) => entry.name);

    console.log(`Found ${siteDirs.length} existing sites to migrate`);

    for (const siteDomain of siteDirs) {
      // Check if site already exists in database
      const existing = await getSiteConfiguration(siteDomain);

      if (!existing) {
        // Create basic configuration for existing site
        const siteConfig: SiteConfiguration = {
          domain: siteDomain,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        try {
          await saveSiteConfiguration(siteConfig);
          console.log(`Migrated existing site: ${siteDomain}`);
        } catch (error) {
          console.warn(`Failed to migrate site ${siteDomain}:`, error);
        }
      }
    }

    console.log('Migration of existing sites completed');
  } catch (error) {
    console.error('Error during site migration:', error);
    throw error;
  }
}

// Settings functions

// Save a setting to the database
export async function saveSetting(key: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const keyEscaped = `'${escapeSqlString(key)}'`;
    const valueEscaped = `'${escapeSqlString(value)}'`;

    const insertCmd = `docker exec devwp_mariadb mariadb -u root -proot -D ${DEVWP_CONFIG_DB} -e "
      INSERT INTO settings (key_name, value_text)
      VALUES (${keyEscaped}, ${valueEscaped})
      ON DUPLICATE KEY UPDATE
        value_text = VALUES(value_text),
        updated_at = CURRENT_TIMESTAMP"`;

    exec(insertCmd, (error, _, stderr) => {
      if (error) {
        console.error(`Error saving setting ${key}: ${stderr}`);
        reject(error);
        return;
      }

      console.log(`Saved setting: ${key} = ${value}`);
      resolve();
    });
  });
}

// Get a setting from the database
export async function getSetting(key: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const safeKey = escapeSqlString(key);
    const selectCmd = `docker exec devwp_mariadb mariadb -u root -proot -D ${DEVWP_CONFIG_DB} -e "
      SELECT value_text
      FROM settings
      WHERE key_name = '${safeKey}'" --batch --raw`;

    exec(selectCmd, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error fetching setting ${key}: ${stderr}`);
        reject(error);
        return;
      }

      if (!stdout.trim()) {
        resolve(null);
        return;
      }

      try {
        const lines = stdout.trim().split('\n');
        if (lines.length < 2) {
          resolve(null);
          return;
        }

        resolve(lines[1]);
      } catch (parseError) {
        console.error(`Error parsing setting ${key}:`, parseError);
        reject(parseError);
      }
    });
  });
}

// Get all settings from the database
export async function getAllSettings(): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const selectCmd = `docker exec devwp_mariadb mariadb -u root -proot -D ${DEVWP_CONFIG_DB} -e "
      SELECT key_name, value_text
      FROM settings
      ORDER BY key_name ASC" --batch --raw`;

    exec(selectCmd, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error fetching all settings: ${stderr}`);
        reject(error);
        return;
      }

      if (!stdout.trim()) {
        resolve({});
        return;
      }

      try {
        const lines = stdout.trim().split('\n');
        const settings: Record<string, string> = {};

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split('\t');
          if (values.length >= 2) {
            settings[values[0]] = values[1];
          }
        }

        resolve(settings);
      } catch (parseError) {
        console.error('Error parsing settings:', parseError);
        reject(parseError);
      }
    });
  });
}

// Delete a setting from the database
export async function deleteSetting(key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const safeKey = escapeSqlString(key);
    const deleteCmd = `docker exec devwp_mariadb mariadb -u root -proot -D ${DEVWP_CONFIG_DB} -e "
      DELETE FROM settings WHERE key_name = '${safeKey}'"`;

    exec(deleteCmd, (error, _, stderr) => {
      if (error) {
        console.error(`Error deleting setting ${key}: ${stderr}`);
        reject(error);
        return;
      }

      console.log(`Deleted setting: ${key}`);
      resolve();
    });
  });
}

// Get webroot path setting with default fallback
export async function getWebrootPath(): Promise<string> {
  try {
    const webrootPath = await getSetting('webroot_path');
    if (webrootPath) {
      return webrootPath;
    }
  } catch (error) {
    console.warn('Failed to get webroot path from database:', error);
  }

  // Default fallback
  const os = await import('node:os');
  const path = await import('node:path');
  return path.join(os.homedir(), 'www');
}

// Get Xdebug enabled setting with default fallback
export async function getXdebugEnabledSetting(): Promise<boolean> {
  try {
    const xdebugEnabled = await getSetting('xdebug_enabled');
    if (xdebugEnabled !== null) {
      return xdebugEnabled === 'true';
    }
  } catch (error) {
    console.warn('Failed to get Xdebug setting from database:', error);
  }

  // Default fallback to disabled (performance mode)
  return false;
}
