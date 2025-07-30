import { join } from 'path'
import { promises as fs, constants } from 'fs' // Import constants
import { exec } from 'child_process'
import { generateNginxConfig, removeNginxConfig } from './nginx'
import { modifyHostsFile } from './hosts'

export interface Site {
  name: string
  path: string
  url: string
  status?: string
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
    .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
  
  // Ensure it starts with a letter or underscore
  if (dbName && !/^[a-zA-Z_]/.test(dbName)) {
    dbName = 'db_' + dbName
  }
  
  // Ensure it's not empty - abort if no valid database name can be created
  if (!dbName) {
    throw new Error(`Cannot create a valid database name from site domain: '${siteDomain}'`)
  }
  
  // Limit to 64 characters (MySQL limit)
  if (dbName.length > 64) {
    dbName = dbName.substring(0, 64).replace(/_+$/, '') // Remove trailing underscores after truncation
  }
  
  return dbName
}

// Install WordPress in the newly created site
async function installWordPress(
  siteDomain: string,
  dbName: string,
  webRoot?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const baseSiteDir = `/src/www/${siteDomain}`
    const wpInstallPath = webRoot ? `${baseSiteDir}/${webRoot}` : baseSiteDir

    // Command to download WordPress core
    const downloadCmd = `docker compose exec php wp core download --path=${wpInstallPath} --force`

    // Command to create wp-config.php
    const configCmd = `docker compose exec php wp config create --path=${wpInstallPath} --dbname=${dbName} --dbuser=root --dbpass=root --dbhost=mariadb --force`

    // Command to install WordPress
    const installCmd = `docker compose exec php wp core install --path=${wpInstallPath} --url=https://${siteDomain} --title="${siteDomain}" --admin_user=root --admin_password=root --admin_email=admin@${siteDomain}`

    console.log(`Downloading WordPress to ${wpInstallPath}...`)
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

export function createSite(site: {
  domain: string
  webRoot?: string
  aliases?: string
  multisite?: {
    enabled: boolean
    type: 'subdomain' | 'subdirectory'
  }
}): Promise<boolean> {
  return new Promise((resolve, reject) => {
    ;(async () => {
      const siteDomain = site.domain
      const siteAliases = site.aliases ? site.aliases.split(' ').filter(Boolean) : []
      const allDomains = [siteDomain, ...siteAliases]
      const siteBasePath = join(process.cwd(), 'www', siteDomain)
      const actualWebRootPath = site.webRoot ? join(siteBasePath, site.webRoot) : siteBasePath
      const nginxRootDirective = `/src/www/${siteDomain}${site.webRoot ? '/' + site.webRoot : ''}`
      
      let dbName: string
      try {
        dbName = sanitizeDatabaseName(siteDomain)
      } catch (error: any) {
        reject(new Error(`Invalid site domain: ${error.message}`))
        return
      }
      
      const sonarProjectKey = dbName
      const sonarProjectName = siteDomain

      try {
        // Check if the base directory already exists
        await fs.access(siteBasePath, constants.F_OK)
        // If access doesn't throw, the directory exists
        reject(new Error(`Site directory '${siteBasePath}' already exists.`))
        return // Stop execution
      } catch (error: any) {
        // If the error code is ENOENT, the directory doesn't exist, which is expected
        if (error.code !== 'ENOENT') {
          // For any other error during access check, reject
          console.error(`Error checking site directory:`, error)
          reject(`Error checking site directory: ${error.message}`)
          return
        }
        // Directory does not exist, proceed to create it
        console.log(`Site directory ${siteBasePath} does not exist. Creating...`)
      }

      // Directory doesn't exist, proceed with creation and setup
      try {
        // Create the actual web root path, which includes base path
        // fs.mkdir with recursive will create parent directories if they don't exist.
        await fs.mkdir(actualWebRootPath, { recursive: true })
        console.log(`Created directory structure: ${actualWebRootPath}`)

        // Proceed with the rest of the site setup
        for (const domain of allDomains) {
          await modifyHostsFile(domain, 'add')
        }
        await generateNginxConfig(siteDomain, nginxRootDirective, site.aliases, site.multisite)
        await createDatabase(dbName)
        await installWordPress(siteDomain, dbName, site.webRoot) // Attempt WP install

        // Convert to multisite if enabled
        if (site.multisite?.enabled) {
          await convertToMultisite(siteDomain, site.multisite, site.webRoot)
        }

        // Attempt to create SonarQube project
        try {
          await createSonarQubeProject(sonarProjectName, sonarProjectKey)
        } catch (sonarError: any) {
          console.warn(
            `Failed to create SonarQube project for ${site.domain}: ${sonarError.message}`
          )
          // Log the error but don't fail the site creation
        }

        resolve(true)
      } catch (setupError: any) {
        // Catch errors during setup
        // Handle WordPress installation failure or other setup errors
        if (
          setupError.message.includes('installWordPress') ||
          setupError.message.includes('multisite-convert')
        ) {
          // Check if it's a WP install or multisite conversion error specifically if needed
          console.warn(`WordPress setup failed: ${setupError}. Creating basic site instead.`)
          try {
            await generateIndexHtml(siteDomain, siteBasePath, dbName, site.webRoot)

            // Attempt to create SonarQube project even if WP install failed
            try {
              await createSonarQubeProject(sonarProjectName, sonarProjectKey)
            } catch (sonarError: any) {
              console.warn(
                `Failed to create SonarQube project for ${site.domain} after WP failure: ${sonarError.message}`
              )
              // Log the error but don't fail the site creation
            }

            resolve(true) // Resolve even if WP setup failed but index.html was created
          } catch (htmlError: any) {
            reject(`Error setting up site after WP failure: ${htmlError.message}`)
          }
        } else {
          // Handle other setup errors (mkdir, hosts, nginx, db, etc.)
          console.error(`Error setting up site:`, setupError)
          // Attempt cleanup? (Optional, depends on desired behavior)
          // e.g., await fs.rm(siteBasePath, { recursive: true, force: true });
          //      await modifyHostsFile(site.domain, 'remove'); ... etc.
          reject(`Error setting up site: ${setupError.message}`)
        }
      }
    })()
  })
}

// Create a database for the site
async function createDatabase(dbName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const createDbCmd = `docker exec devwp_mariadb mariadb -u root -proot -e "CREATE DATABASE IF NOT EXISTS ${dbName}"`

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
  siteFilesystemBasePath: string, // This is www/domain
  dbName?: string,
  webRoot?: string
): Promise<void> {
  try {
    const actualWebRootOnHost = webRoot
      ? join(siteFilesystemBasePath, webRoot)
      : siteFilesystemBasePath
    const nginxWebRootPath = `/src/www/${domain}${webRoot ? '/' + webRoot : ''}`

    // Ensure the target directory for index.html exists
    await fs.mkdir(actualWebRootOnHost, { recursive: true })

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
            <li><strong>Site Root (Nginx):</strong> ${nginxWebRootPath}</li>
            <li><strong>Filesystem Path:</strong> ${actualWebRootOnHost}</li>
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
        <p>Generated by DevWP - Your Local WordPress Development Environment.<br />Brought to you by <a href="https://trewhitt.se">Trewhitt</a></p>
    </div>
</body>
</html>`

    const indexPath = join(actualWebRootOnHost, 'index.html')
    await fs.writeFile(indexPath, indexHtmlContent, 'utf8')
    await fs.chmod(indexPath, 0o766)
    console.log(`Created index.html for ${domain} at ${indexPath}`)
  } catch (error) {
    console.error(`Failed to generate index.html for ${domain}:`, error)
    throw error
  }
}

// Drop a database when deleting a site
async function dropDatabase(dbName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const dropDbCmd = `docker exec devwp_mariadb mariadb -u root -proot -e "DROP DATABASE IF EXISTS ${dbName}"`

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
    // This command uses a Redis EVAL script to find and delete keys on the server-side,
    // avoiding shell-specific piping (like | and xargs) which is not compatible with Windows cmd.
    const clearCacheCmd = `docker exec devwp_redis redis-cli EVAL "local keys = redis.call('KEYS', ARGV[1]); if #keys > 0 then return redis.call('DEL', unpack(keys)) else return 0 end" 0 "*${siteDomain}*"`

    exec(clearCacheCmd, (error, _, stderr) => {
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
    
    let dbName: string
    try {
      dbName = sanitizeDatabaseName(site.name)
    } catch (error: any) {
      reject(new Error(`Invalid site name: ${error.message}`))
      return
    }
    
    const sonarProjectKey = dbName // Use the same key convention

    fs.rm(sitePath, { recursive: true, force: true })
      .then(async () => {
        try {
          // Note: This doesn't know about aliases. Deleting a site will only remove the primary domain from hosts/nginx.
          // This could be improved by storing site metadata (like aliases) in a file.
          await modifyHostsFile(site.name, 'remove')
          await removeNginxConfig(site.name)
          await dropDatabase(dbName)
          await clearRedisCache(site.name)

          // Attempt to delete SonarQube project
          try {
            await deleteSonarQubeProject(sonarProjectKey)
          } catch (sonarError: any) {
            console.warn(
              `Failed to delete SonarQube project ${sonarProjectKey}: ${sonarError.message}`
            )
            // Log the error but don't fail the site deletion
          }

          resolve(true)
        } catch (cleanupError: any) {
          reject(`Error cleaning up site: ${cleanupError}`)
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
          url: `https://${domain}`
        }))

        resolve(sites)
      })
      .catch((error) => {
        console.error(`Error reading sites directory:`, error)
        reject(`Error reading sites directory: ${error.message}`)
      })
  })
}

// Convert a site to multisite
async function convertToMultisite(
  siteDomain: string,
  multisite: { enabled: boolean; type: 'subdomain' | 'subdirectory' } | undefined,
  webRoot?: string
): Promise<void> {
  if (!multisite?.enabled) return

  return new Promise((resolve, reject) => {
    const baseSiteDir = `/src/www/${siteDomain}`
    const wpInstallPath = webRoot ? `${baseSiteDir}/${webRoot}` : baseSiteDir
    const subdomains = multisite.type === 'subdomain' ? '--subdomains' : ''

    // Command to enable multisite in wp-config.php
    const enableMultisiteCmd = `docker compose exec php wp core multisite-convert ${subdomains} --path=${wpInstallPath} --base=/`

    console.log(
      `Converting ${siteDomain} to multisite (${multisite.type} mode) at ${wpInstallPath}...`
    )
    exec(enableMultisiteCmd, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error converting to multisite: ${stderr}`)
        reject(error)
        return
      }

      console.log(`Successfully converted ${siteDomain} to multisite (${multisite.type})`)
      console.log(stdout)
      resolve()
    })
  })
}

// Create a SonarQube project
async function createSonarQubeProject(projectName: string, projectKey: string): Promise<void> {
  // WARNING: Using default SonarQube admin credentials (admin:admin).
  // This is insecure if the default password has been changed or for non-local environments.
  // Consider generating a specific API token in SonarQube (Administration > Security > Users > Tokens)
  // and storing it securely (e.g., using environment variables) for improved security and practice.
  const sonarUser = 'admin'
  const sonarPassword = 'newAdminPassword1<'

  // Ensure curl is installed in the php container:
  // Add 'RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*' to config/php/Dockerfile if needed
  const createProjectCmd = `docker compose exec php curl -u '${sonarUser}:${sonarPassword}' -X POST 'http://sonarqube:9000/api/projects/create' -d 'name=${encodeURIComponent(projectName)}&project=${encodeURIComponent(projectKey)}'` // Added single quotes around -u argument

  return new Promise((resolve, reject) => {
    console.log(
      `Creating SonarQube project: ${projectName} (Key: ${projectKey}) using default credentials...`
    )
    exec(createProjectCmd, (error, stdout, stderr) => {
      // SonarQube API might return errors in stdout with a 200 OK status initially,
      // or non-200 status codes for auth errors etc.
      // A successful creation might return JSON data or just status 200.
      // A failure (e.g., project key exists) might return JSON with an error message in stdout and status 400.
      // Let's check stderr first, then potential error messages in stdout.

      if (error) {
        // This usually catches network errors or if curl command fails fundamentally
        console.error(`Error executing SonarQube project creation command: ${stderr}`)
        // Check if the error is due to authentication failure (HTTP 401)
        if (stderr.includes('401') || stdout.includes('Authentication required')) {
          console.error(
            'SonarQube authentication failed. Check default credentials or configure an API token.'
          )
          reject(
            new Error(
              'SonarQube authentication failed. Check default credentials (admin:admin) or configure an API token.'
            )
          )
        } else {
          reject(new Error(`Failed to execute curl command: ${error.message}`))
        }
        return
      }

      // Check stdout for specific SonarQube API error messages (often returned with non-error HTTP status)
      // Example error: {"errors":[{"msg":"Project key already exists: ..."}]}
      // Example auth error (sometimes in stdout): {"errors":[{"msg":"Authentication required"}]}
      if (stdout.includes('"errors":')) {
        if (stdout.includes('Authentication required')) {
          console.error(
            'SonarQube authentication failed. Check default credentials or configure an API token.'
          )
          reject(
            new Error(
              'SonarQube authentication failed. Check default credentials (admin:admin) or configure an API token.'
            )
          )
        } else {
          console.error(`SonarQube API error creating project ${projectKey}: ${stdout}`)
          reject(new Error(`SonarQube API error: ${stdout}`))
        }
        return
      }

      // If stderr is present but no 'error' object, it might be informational from curl
      if (stderr) {
        console.warn(`SonarQube project creation stderr (may be informational): ${stderr}`)
      }

      console.log(`Successfully initiated SonarQube project creation for: ${projectName}`)
      // Note: API call is asynchronous on the SonarQube server side.
      // We resolve here assuming the API call was accepted.
      resolve()
    })
  })
}

// Delete a SonarQube project
async function deleteSonarQubeProject(projectKey: string): Promise<void> {
  // WARNING: Using default SonarQube admin credentials (admin:admin). See createSonarQubeProject warning.
  const sonarUser = 'admin'
  const sonarPassword = 'newAdminPassword1<' // Ensure this matches the password used/set

  // Ensure curl is installed in the php container
  const deleteProjectCmd = `docker compose exec php curl -u '${sonarUser}:${sonarPassword}' -X POST 'http://sonarqube:9000/api/projects/delete' -d 'project=${encodeURIComponent(projectKey)}'` // Added single quotes around -u argument

  return new Promise((resolve, reject) => {
    console.log(`Deleting SonarQube project (Key: ${projectKey}) using default credentials...`)
    exec(deleteProjectCmd, (error, stdout, stderr) => {
      // Similar error handling as createSonarQubeProject

      if (error) {
        console.error(`Error executing SonarQube project deletion command: ${stderr}`)
        if (stderr.includes('401') || stdout.includes('Authentication required')) {
          console.error('SonarQube authentication failed. Check credentials or token.')
          reject(new Error('SonarQube authentication failed.'))
        } else {
          reject(new Error(`Failed to execute curl command: ${error.message}`))
        }
        return
      }

      // Check stdout for API errors (e.g., project not found might be here or indicated by status code handled by error object)
      // SonarQube might return 204 No Content on success, or errors in JSON.
      if (stdout.includes('"errors":')) {
        if (stdout.includes('Authentication required')) {
          console.error('SonarQube authentication failed. Check credentials or token.')
          reject(new Error('SonarQube authentication failed.'))
        } else if (stdout.includes('not found')) {
          console.warn(
            `SonarQube project ${projectKey} not found for deletion (may have already been deleted).`
          )
          resolve() // Resolve successfully if project not found
        } else {
          console.error(`SonarQube API error deleting project ${projectKey}: ${stdout}`)
          reject(new Error(`SonarQube API error: ${stdout}`))
        }
        return
      }

      // Check stderr for potential issues not caught by 'error'
      if (stderr) {
        // Ignore "Empty reply from server" which can happen with 204 responses in some curl versions
        if (!stderr.includes('Empty reply from server')) {
          console.warn(`SonarQube project deletion stderr (may be informational): ${stderr}`)
        }
      }

      console.log(`Successfully initiated SonarQube project deletion for: ${projectKey}`)
      // API call is asynchronous on the SonarQube server side.
      resolve()
    })
  })
}

// Scan a site with SonarQube using user/password
export async function scanSiteWithSonarQube(siteDomain: string): Promise<void> {
  let projectKey: string
  try {
    projectKey = sanitizeDatabaseName(siteDomain)
  } catch (error: any) {
    throw new Error(`Invalid site domain for SonarQube scan: ${error.message}`)
  }
  // SonarQube scanner needs to know the webRoot if sources are there.
  // However, getSites doesn't know webRoot. This implies scanSiteWithSonarQube
  // might need to discover it or be passed it. For now, assuming webRoot is not
  // directly used by SonarQube path unless it's the *only* content.
  // Let's assume SonarQube scans the entire www/siteDomain directory for now.
  // If webRoot is consistently where all scannable code is, this path should be adjusted.
  const sourcePathInContainer = `/src/www/${siteDomain}` // Path inside the scanner container
  const sonarHostUrl = 'http://sonarqube:9000'

  // Use the same credentials as for project creation/deletion
  // WARNING: Using default SonarQube admin credentials. See createSonarQubeProject warning.
  const sonarUser = 'admin'
  const sonarPassword = 'newAdminPassword1<'

  // Construct the sonar-scanner command using user/password
  // Note: Assumes the sonarqube-scanner service is running and has access to the source code volume
  const scanCmd = `docker compose run sonarqube-scanner sonar-scanner \
    -Dsonar.projectKey=${projectKey} \
    -Dsonar.sources=${sourcePathInContainer} \
    -Dsonar.host.url=${sonarHostUrl} \
    -Dsonar.login=${sonarUser} \
    -Dsonar.password='${sonarPassword}'` // Added single quotes around the password value

  return new Promise((resolve, reject) => {
    console.log(
      `Starting SonarQube scan for project: ${projectKey} (Site: ${siteDomain}) using user/password...`
    )
    exec(scanCmd, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing SonarQube scan command for ${siteDomain}: ${stderr}`)
        // Provide more specific feedback if possible
        if (stderr.includes('Authentication failed')) {
          reject(new Error('SonarQube authentication failed. Check the provided credentials.'))
        } else if (stderr.includes('Project not found')) {
          reject(
            new Error(
              `SonarQube project '${projectKey}' not found. Ensure it was created successfully.`
            )
          )
        } else {
          reject(new Error(`SonarQube scan failed: ${error.message}`))
        }
        return
      }

      // Log stdout and stderr for debugging purposes (scanner output)
      if (stdout) {
        console.log(`SonarQube scan stdout for ${siteDomain}:\n${stdout}`)
      }
      if (stderr) {
        console.warn(`SonarQube scan stderr for ${siteDomain}:\n${stderr}`) // Use warn as stderr might contain non-fatal info
      }

      // Check stdout for explicit success or failure messages if the exit code is 0 but scan failed
      if (stdout.includes('EXECUTION_FAILURE')) {
        console.error(`SonarQube scan for ${siteDomain} reported execution failure.`)
        reject(new Error('SonarQube scan execution failed. Check scanner logs.'))
        return
      }

      console.log(`Successfully completed SonarQube scan initiation for: ${siteDomain}`)
      // Note: The scan itself runs asynchronously on the SonarQube server.
      // This promise resolves when the scanner CLI finishes its execution.
      resolve()
    })
  })
}
