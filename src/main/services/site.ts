import { join } from 'path'
import { promises as fs } from 'fs'
import { exec } from 'child_process'
import { generateNginxConfig, removeNginxConfig } from './nginx'
import { modifyHostsFile } from './hosts'

export interface Site {
  name: string
  path: string
  url: string
  active: boolean
}

// Install WordPress in the newly created site
async function installWordPress(siteDomain: string, dbName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const siteDir = `/src/www/${siteDomain}`

    // Command to download WordPress core
    const downloadCmd = `docker compose exec php wp core download --path=${siteDir} --force`

    // Command to create wp-config.php
    const configCmd = `docker compose exec php wp config create --path=${siteDir} --dbname=${dbName} --dbuser=root --dbpass=root --dbhost=database --force`

    // Command to install WordPress
    const installCmd = `docker compose exec php wp core install --path=${siteDir} --url=https://${siteDomain} --title="${siteDomain}" --admin_user=root --admin_password=root --admin_email=admin@${siteDomain}`

    console.log('Downloading WordPress...')
    exec(downloadCmd, (downloadError, _, downloadStderr) => {
      if (downloadError) {
        console.error(`Error downloading WordPress: ${downloadStderr}`)
        reject(downloadError)
        return
      }

      console.log('Downloaded WordPress core')
      console.log('Creating wp-config.php...')

      exec(configCmd, (configError, _, configStderr) => {
        if (configError) {
          console.error(`Error creating wp-config.php: ${configStderr}`)
          reject(configError)
          return
        }

        console.log('Created wp-config.php')
        console.log('Installing WordPress...')

        exec(installCmd, (installError, _, installStderr) => {
          if (installError) {
            console.error(`Error installing WordPress: ${installStderr}`)
            reject(installError)
            return
          }

          console.log(`Successfully installed WordPress on ${siteDomain}`)
          resolve()
        })
      })
    })
  })
}

export function createSite(site: { domain: string }): Promise<boolean> {
  return new Promise((resolve, reject) => {
    // Use path.join for cross-platform path handling
    const sitePath = join(process.cwd(), 'www', site.domain)
    const dbName = site.domain.replace(/\./g, '_') // Convert domain to valid db name

    // Use fs.mkdir instead of exec for cross-platform directory creation
    fs.mkdir(sitePath, { recursive: true })
      .then(async () => {
        try {
          await modifyHostsFile(site.domain, 'add')
          await generateNginxConfig(site.domain)
          await createDatabase(dbName)
          await installWordPress(site.domain, dbName) // Add this new line to install WordPress
          resolve(true)
        } catch (configError) {
          // If WordPress installation fails, still create the basic site with the HTML template
          console.warn(
            `WordPress installation failed: ${configError}. Creating basic site instead.`
          )
          try {
            await generateIndexHtml(site.domain, sitePath, dbName)
            resolve(true)
          } catch (htmlError) {
            reject(`Error setting up site: ${htmlError}`)
          }
        }
      })
      .catch((error) => {
        console.error(`Error creating site directory:`, error)
        reject(`Error creating site directory: ${error.message}`)
      })
  })
}

// Create a database for the site
async function createDatabase(dbName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const createDbCmd = `docker exec devwp_database mysql -u root -proot -e "CREATE DATABASE IF NOT EXISTS ${dbName}"`

    exec(createDbCmd, (error, _, stderr) => {
      if (error) {
        console.error(`Error creating database: ${stderr}`)
        reject(error)
        return
      }
      console.log(`Created database: ${dbName}`)
      resolve()
    })
  })
}

// Update generateIndexHtml to include database information
export async function generateIndexHtml(
  domain: string,
  sitePath: string,
  dbName?: string
): Promise<void> {
  try {
    // Include database information in the generated HTML
    const dbInfoHtml = dbName
      ? `
        <div class="info-box">
            <h3 style="margin-top: 0;">Database Information</h3>
            <ul>
                <li><strong>Database Name:</strong> ${dbName}</li>
                <li><strong>Database User:</strong> user</li>
                <li><strong>Database Password:</strong> password</li>
                <li><strong>Database Host:</strong> database</li>
            </ul>
        </div>`
      : ''

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
            <li><strong>Site Root:</strong> ${sitePath}</li>
        </ul>

        ${dbInfoHtml}

        <div class="info-box">
            <h3 style="margin-top: 0;">Nginx Configuration</h3>
            <p>An Nginx configuration file has been automatically generated for this site at:</p>
            <code>config/nginx/sites-enabled/${domain}.conf</code>
            <p>You can customize this file if you need specific server configurations for this site.</p>
        </div>

        <h2>Next Steps</h2>
        <p>Replace this file with your WordPress installation or custom development files.</p>
    </div>
    <div class="footer">
        <p>Generated by DevWP - Your Local WordPress Development Environment</p>
    </div>
</body>
</html>`

    const indexPath = join(sitePath, 'index.html')
    await fs.writeFile(indexPath, indexHtmlContent, 'utf8')
    await fs.chmod(indexPath, 0o766)
    console.log(`Created index.html for ${domain}`)
  } catch (error) {
    console.error(`Failed to generate index.html for ${domain}:`, error)
    throw error
  }
}

// Drop a database when deleting a site
async function dropDatabase(dbName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const dropDbCmd = `docker exec devwp_database mysql -u root -proot -e "DROP DATABASE IF EXISTS ${dbName}"`

    exec(dropDbCmd, (error, _, stderr) => {
      if (error) {
        console.error(`Error dropping database: ${stderr}`)
        reject(error)
        return
      }
      console.log(`Dropped database: ${dbName}`)
      resolve()
    })
  })
}

// Clear Redis cache for a site
async function clearRedisCache(siteDomain: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Using wildcard pattern to match any keys related to this site
    const clearCacheCmd = `docker exec devwp_cache redis-cli KEYS "*${siteDomain}*" | xargs -r docker exec -i devwp_cache redis-cli DEL`

    exec(clearCacheCmd, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error clearing Redis cache: ${stderr}`)
        reject(error)
        return
      }
      console.log(`Cleared Redis cache for: ${siteDomain}`)
      resolve()
    })
  })
}

export function deleteSite(site: { name: string }): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const sitePath = join(process.cwd(), 'www', site.name)
    const dbName = site.name.replace(/\./g, '_')

    fs.rm(sitePath, { recursive: true, force: true })
      .then(async () => {
        try {
          await modifyHostsFile(site.name, 'remove')
          await removeNginxConfig(site.name)
          await dropDatabase(dbName)
          await clearRedisCache(site.name)
          resolve(true)
        } catch (hostsError) {
          reject(`Error cleaning up site: ${hostsError}`)
        }
      })
      .catch((error) => {
        console.error(`Error deleting site directory:`, error)
        reject(`Error deleting site directory: ${error.message}`)
      })
  })
}

export function getSites(): Promise<Site[]> {
  return new Promise((resolve, reject) => {
    const wwwPath = join(process.cwd(), 'www')

    // Use fs.readdir instead of 'ls' command
    fs.readdir(wwwPath, { withFileTypes: true })
      .then(async (entries) => {
        // Get only directories
        const dirs = entries
          .filter((entry) => entry.isDirectory())
          .filter((entry) => !['.', '..', '.git'].includes(entry.name))
          .map((entry) => entry.name)

        // Combine both sources and create site objects
        const allDomains = [...new Set([...dirs])]

        const sites = allDomains.map((domain) => ({
          name: domain,
          path: join('www', domain),
          url: `https://${domain}`,
          active: dirs.includes(domain)
        }))

        resolve(sites)
      })
      .catch((error) => {
        console.error(`Error reading sites directory:`, error)
        reject(`Error reading sites directory: ${error.message}`)
      })
  })
}
