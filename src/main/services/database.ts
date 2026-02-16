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

// Get the docker command based on platform
function getDockerCommand(): string {
  return process.platform === 'win32' ? 'docker.exe' : 'docker';
}

// Helper to execute docker commands with proper environment
function execDocker(
  command: string,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const dockerCmd = getDockerCommand();
    const fullCommand = command.replace(/^docker\s/, `${dockerCmd} `);

    exec(fullCommand, (error, stdout, stderr) => {
      if (error) {
        // Create a proper error object with all details
        const execError = new Error(
          stderr || error.message || 'Docker command failed',
        );
        (execError as any).stderr = stderr;
        (execError as any).stdout = stdout;
        (execError as any).code = error.code;
        (execError as any).command = fullCommand;
        reject(execError);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

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
      const testCmd =
        'docker exec devwp_mariadb mariadb -u root -proot -e "SELECT 1"';
      await execDocker(testCmd);
      console.log('MariaDB container is ready!');
      return; // Success, exit the retry loop
    } catch (err: any) {
      const errorMessage = err.message || err.stderr || String(err);
      console.log(
        `Database connection attempt ${attempt}/${maxRetries} failed: ${errorMessage}`,
      );

      if (attempt === maxRetries) {
        throw new Error(
          `Failed to connect to database after ${maxRetries} attempts. Last error: ${errorMessage}`,
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

    try {
      await execDocker(createDbCmd);
      console.log(`Created/verified config database: ${DEVWP_CONFIG_DB}`);
    } catch (err: any) {
      throw new Error(
        `Failed to create database: ${err.message || err.stderr || err}`,
      );
    }

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
    try {
      await execDocker(createSitesTableCmd);
      console.log('Created/verified sites configuration table');
    } catch (err: any) {
      throw new Error(
        `Failed to create sites table: ${err.message || err.stderr || err}`,
      );
    }

    // Create settings table if it doesn't exist
    const createSettingsTableCmd = `docker exec devwp_mariadb mariadb -u root -proot -D ${DEVWP_CONFIG_DB} -e "
      CREATE TABLE IF NOT EXISTS settings (
        key_name VARCHAR(255) PRIMARY KEY,
        value_text TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )"`;

    console.log('Creating settings table...');
    try {
      await execDocker(createSettingsTableCmd);
      console.log('Created/verified settings configuration table');
    } catch (err: any) {
      throw new Error(
        `Failed to create settings table: ${err.message || err.stderr || err}`,
      );
    }

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

  try {
    await execDocker(insertCmd);
    console.log(`Saved site configuration for: ${site.domain}`);
  } catch (err: any) {
    const errorMsg = `Error saving site configuration: ${err.message || err.stderr || err}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
}

// Get all site configurations from database
export async function getAllSiteConfigurations(): Promise<SiteConfiguration[]> {
  try {
    const selectCmd = `docker exec devwp_mariadb mariadb -u root -proot -D ${DEVWP_CONFIG_DB} -e "
      SELECT domain, aliases, web_root, multisite_enabled, multisite_type, created_at, updated_at
      FROM sites
      ORDER BY created_at ASC" --batch --raw`;

    const { stdout } = await execDocker(selectCmd);

    if (!stdout.trim()) {
      return [];
    }

    const lines = stdout.trim().split('\n');
    const sites: SiteConfiguration[] = [];

    // Skip header row, start from index 1
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

    return sites;
  } catch (err: any) {
    const errorMsg = `Error fetching site configurations: ${err.message || err.stderr || err}`;
    console.error(errorMsg);
    console.error('Command:', err.command);
    console.error('Error details:', err);
    throw new Error(errorMsg);
  }
}

// Get a specific site configuration
// Helper to escape SQL string literals (single quotes)
function escapeSqlString(str: string): string {
  return str.replace(/'/g, "''");
}

export async function getSiteConfiguration(
  domain: string,
): Promise<SiteConfiguration | null> {
  try {
    const safeDomain = escapeSqlString(domain);
    const selectCmd = `docker exec devwp_mariadb mariadb -u root -proot -D ${DEVWP_CONFIG_DB} -e "
      SELECT domain, aliases, web_root, multisite_enabled, multisite_type, created_at, updated_at
      FROM sites
      WHERE domain = '${safeDomain}'" --batch --raw`;

    const { stdout } = await execDocker(selectCmd);

    if (!stdout.trim()) {
      return null;
    }

    const lines = stdout.trim().split('\n');
    if (lines.length < 2) {
      return null;
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

    return site;
  } catch (err: any) {
    const errorMsg = `Error fetching site configuration for ${domain}: ${err.message || err.stderr || err}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
}

// Delete site configuration from database
export async function deleteSiteConfiguration(domain: string): Promise<void> {
  try {
    const safeDomain = escapeSqlString(domain);
    const deleteCmd = `docker exec devwp_mariadb mariadb -u root -proot -D ${DEVWP_CONFIG_DB} -e "
      DELETE FROM sites WHERE domain = '${safeDomain}'"`;

    await execDocker(deleteCmd);
    console.log(`Deleted site configuration for: ${domain}`);
  } catch (err: any) {
    const errorMsg = `Error deleting site configuration for ${domain}: ${err.message || err.stderr || err}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
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
  try {
    const keyEscaped = `'${escapeSqlString(key)}'`;
    const valueEscaped = `'${escapeSqlString(value)}'`;

    const insertCmd = `docker exec devwp_mariadb mariadb -u root -proot -D ${DEVWP_CONFIG_DB} -e "
      INSERT INTO settings (key_name, value_text)
      VALUES (${keyEscaped}, ${valueEscaped})
      ON DUPLICATE KEY UPDATE
        value_text = VALUES(value_text),
        updated_at = CURRENT_TIMESTAMP"`;

    await execDocker(insertCmd);
    console.log(`Saved setting: ${key} = ${value}`);
  } catch (err: any) {
    const errorMsg = `Error saving setting ${key}: ${err.message || err.stderr || err}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
}

// Get a setting from the database
export async function getSetting(key: string): Promise<string | null> {
  try {
    const safeKey = escapeSqlString(key);
    const selectCmd = `docker exec devwp_mariadb mariadb -u root -proot -D ${DEVWP_CONFIG_DB} -e "
      SELECT value_text
      FROM settings
      WHERE key_name = '${safeKey}'" --batch --raw`;

    const { stdout } = await execDocker(selectCmd);

    if (!stdout.trim()) {
      return null;
    }

    const lines = stdout.trim().split('\n');
    if (lines.length < 2) {
      return null;
    }

    return lines[1];
  } catch (err: any) {
    const errorMsg = `Error fetching setting ${key}: ${err.message || err.stderr || err}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
}

// Get all settings from the database
export async function getAllSettings(): Promise<Record<string, string>> {
  try {
    const selectCmd = `docker exec devwp_mariadb mariadb -u root -proot -D ${DEVWP_CONFIG_DB} -e "
      SELECT key_name, value_text
      FROM settings
      ORDER BY key_name ASC" --batch --raw`;

    const { stdout } = await execDocker(selectCmd);

    if (!stdout.trim()) {
      return {};
    }

    const lines = stdout.trim().split('\n');
    const settings: Record<string, string> = {};

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split('\t');
      if (values.length >= 2) {
        settings[values[0]] = values[1];
      }
    }

    return settings;
  } catch (err: any) {
    const errorMsg = `Error fetching all settings: ${err.message || err.stderr || err}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
}

// Delete a setting from the database
export async function deleteSetting(key: string): Promise<void> {
  try {
    const safeKey = escapeSqlString(key);
    const deleteCmd = `docker exec devwp_mariadb mariadb -u root -proot -D ${DEVWP_CONFIG_DB} -e "
      DELETE FROM settings WHERE key_name = '${safeKey}'"`;

    await execDocker(deleteCmd);
    console.log(`Deleted setting: ${key}`);
  } catch (err: any) {
    const errorMsg = `Error deleting setting ${key}: ${err.message || err.stderr || err}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
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
