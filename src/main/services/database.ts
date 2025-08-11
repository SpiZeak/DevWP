import { exec } from 'child_process'

export interface SiteConfiguration {
  domain: string
  aliases?: string
  webRoot?: string
  multisite?: {
    enabled: boolean
    type: 'subdomain' | 'subdirectory'
  }
  createdAt: Date
  updatedAt: Date
}

// Database name for DevWP configuration
const DEVWP_CONFIG_DB = 'devwp_config'

// Initialize the DevWP configuration database and tables
export async function initializeConfigDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Create the configuration database
    const createDbCmd = `docker exec devwp_mariadb mariadb -u root -proot -e "CREATE DATABASE IF NOT EXISTS ${DEVWP_CONFIG_DB}"`

    exec(createDbCmd, (error, _, stderr) => {
      if (error) {
        console.error(`Error creating config database: ${stderr}`)
        reject(error)
        return
      }

      console.log(`Created/verified config database: ${DEVWP_CONFIG_DB}`)

      // Create the sites table
      const createTableCmd = `docker exec devwp_mariadb mariadb -u root -proot -D ${DEVWP_CONFIG_DB} -e "
        CREATE TABLE IF NOT EXISTS sites (
          domain VARCHAR(255) PRIMARY KEY,
          aliases TEXT,
          web_root VARCHAR(255),
          multisite_enabled BOOLEAN DEFAULT FALSE,
          multisite_type ENUM('subdomain', 'subdirectory') DEFAULT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )"`

      exec(createTableCmd, (tableError, _, tableStderr) => {
        if (tableError) {
          console.error(`Error creating sites table: ${tableStderr}`)
          reject(tableError)
          return
        }

        console.log('Created/verified sites configuration table')
        resolve()
      })
    })
  })
}

// Save site configuration to database
export async function saveSiteConfiguration(site: SiteConfiguration): Promise<void> {
  return new Promise((resolve, reject) => {
    const aliases = site.aliases || ''
    const webRoot = site.webRoot || ''
    const multisiteEnabled = site.multisite?.enabled ? 1 : 0
    const multisiteType = site.multisite?.type || null

    const domainEscaped = `'${escapeSqlString(site.domain)}'`
    const aliasesEscaped = `'${escapeSqlString(aliases)}'`
    const webRootEscaped = `'${escapeSqlString(webRoot)}'`
    const multisiteTypeEscaped = multisiteType ? `'${escapeSqlString(multisiteType)}'` : 'NULL'

    const insertCmd = `docker exec devwp_mariadb mariadb -u root -proot -D ${DEVWP_CONFIG_DB} -e "
      INSERT INTO sites (domain, aliases, web_root, multisite_enabled, multisite_type)
      VALUES (${domainEscaped}, ${aliasesEscaped}, ${webRootEscaped}, ${multisiteEnabled}, ${multisiteTypeEscaped})
      ON DUPLICATE KEY UPDATE
        aliases = VALUES(aliases),
        web_root = VALUES(web_root),
        multisite_enabled = VALUES(multisite_enabled),
        multisite_type = VALUES(multisite_type),
        updated_at = CURRENT_TIMESTAMP"`

    exec(insertCmd, (error, _, stderr) => {
      if (error) {
        console.error(`Error saving site configuration: ${stderr}`)
        reject(error)
        return
      }

      console.log(`Saved site configuration for: ${site.domain}`)
      resolve()
    })
  })
}

// Get all site configurations from database
export async function getAllSiteConfigurations(): Promise<SiteConfiguration[]> {
  return new Promise((resolve, reject) => {
    const selectCmd = `docker exec devwp_mariadb mariadb -u root -proot -D ${DEVWP_CONFIG_DB} -e "
      SELECT domain, aliases, web_root, multisite_enabled, multisite_type, created_at, updated_at
      FROM sites
      ORDER BY created_at ASC" --batch --raw`

    exec(selectCmd, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error fetching site configurations: ${stderr}`)
        reject(error)
        return
      }

      if (!stdout.trim()) {
        resolve([])
        return
      }

      try {
        const lines = stdout.trim().split('\n')
        const headers = lines[0].split('\t')
        const sites: SiteConfiguration[] = []

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split('\t')
          const site: SiteConfiguration = {
            domain: values[0],
            aliases: values[1] || undefined,
            webRoot: values[2] || undefined,
            multisite: {
              enabled: values[3] === '1',
              type:
                values[4] === 'subdomain' || values[4] === 'subdirectory'
                  ? (values[4] as 'subdomain' | 'subdirectory')
                  : 'subdomain'
            },
            createdAt: new Date(values[5]),
            updatedAt: new Date(values[6])
          }

          // Only include multisite config if enabled
          if (!site.multisite?.enabled) {
            delete site.multisite
          }

          sites.push(site)
        }

        resolve(sites)
      } catch (parseError) {
        console.error('Error parsing site configurations:', parseError)
        reject(parseError)
      }
    })
  })
}

// Get a specific site configuration
// Helper to escape SQL string literals (single quotes)
function escapeSqlString(str: string): string {
  return str.replace(/'/g, "''")
}

export async function getSiteConfiguration(domain: string): Promise<SiteConfiguration | null> {
  return new Promise((resolve, reject) => {
    const safeDomain = escapeSqlString(domain)
    const selectCmd = `docker exec devwp_mariadb mariadb -u root -proot -D ${DEVWP_CONFIG_DB} -e "
      SELECT domain, aliases, web_root, multisite_enabled, multisite_type, created_at, updated_at
      FROM sites
      WHERE domain = '${safeDomain}'" --batch --raw`

    exec(selectCmd, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error fetching site configuration for ${domain}: ${stderr}`)
        reject(error)
        return
      }

      if (!stdout.trim()) {
        resolve(null)
        return
      }

      try {
        const lines = stdout.trim().split('\n')
        if (lines.length < 2) {
          resolve(null)
          return
        }

        const values = lines[1].split('\t')
        const site: SiteConfiguration = {
          domain: values[0],
          aliases: values[1] || undefined,
          webRoot: values[2] || undefined,
          multisite: {
            enabled: values[3] === '1',
            type:
              values[4] && values[4] !== 'NULL'
                ? (values[4] as 'subdomain' | 'subdirectory')
                : 'subdomain'
          },
          createdAt: new Date(values[5]),
          updatedAt: new Date(values[6])
        }

        // Only include multisite config if enabled
        if (!site.multisite?.enabled) {
          delete site.multisite
        }

        resolve(site)
      } catch (parseError) {
        console.error(`Error parsing site configuration for ${domain}:`, parseError)
        reject(parseError)
      }
    })
  })
}

// Delete site configuration from database
export async function deleteSiteConfiguration(domain: string): Promise<void> {
  // Escape single quotes in domain to prevent SQL injection
  function escapeSqlString(str: string): string {
    return str.replace(/'/g, "''")
  }
  return new Promise((resolve, reject) => {
    const safeDomain = escapeSqlString(domain)
    const deleteCmd = `docker exec devwp_mariadb mariadb -u root -proot -D ${DEVWP_CONFIG_DB} -e "
      DELETE FROM sites WHERE domain = '${safeDomain}'"`

    exec(deleteCmd, (error, _, stderr) => {
      if (error) {
        console.error(`Error deleting site configuration for ${domain}: ${stderr}`)
        reject(error)
        return
      }

      console.log(`Deleted site configuration for: ${domain}`)
      resolve()
    })
  })
}

// Migrate existing sites from filesystem to database
export async function migrateExistingSites(): Promise<void> {
  const { promises: fs } = await import('fs')
  const { join } = await import('path')

  try {
    const wwwPath = join(process.cwd(), 'www')
    const entries = await fs.readdir(wwwPath, { withFileTypes: true })

    // Get only directories (existing sites)
    const siteDirs = entries
      .filter((entry) => entry.isDirectory())
      .filter((entry) => !['.', '..', '.git'].includes(entry.name))
      .map((entry) => entry.name)

    console.log(`Found ${siteDirs.length} existing sites to migrate`)

    for (const siteDomain of siteDirs) {
      // Check if site already exists in database
      const existing = await getSiteConfiguration(siteDomain)

      if (!existing) {
        // Create basic configuration for existing site
        const siteConfig: SiteConfiguration = {
          domain: siteDomain,
          createdAt: new Date(),
          updatedAt: new Date()
        }

        try {
          await saveSiteConfiguration(siteConfig)
          console.log(`Migrated existing site: ${siteDomain}`)
        } catch (error) {
          console.warn(`Failed to migrate site ${siteDomain}:`, error)
        }
      }
    }

    console.log('Migration of existing sites completed')
  } catch (error) {
    console.error('Error during site migration:', error)
    throw error
  }
}
