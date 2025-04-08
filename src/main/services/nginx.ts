import { join } from 'path'
import { spawn } from 'child_process'
import { promises as fs } from 'fs'

export async function generateNginxConfig(
  domain: string,
  multisite?: { enabled: boolean; type: 'subdomain' | 'subdirectory' }
): Promise<void> {
  try {
    // Read the template file
    const templatePath = join(process.cwd(), 'config', 'nginx', 'template-site.conf')
    let configContent = await fs.readFile(templatePath, 'utf8')

    // Replace the domain placeholder
    configContent = configContent.replace(/example\.com/g, domain)

    // Replace the include directive based on multisite configuration
    if (multisite?.enabled) {
      const includeDirective =
        multisite.type === 'subdomain'
          ? 'include global/wordpress-ms-subdomain.conf;'
          : 'include global/wordpress-ms-subdir.conf;'

      // Replace the WordPress include directive
      configContent = configContent.replace(
        '# include global/wordpress-ms-subdir.conf;',
        '# include global/wordpress-ms-subdir.conf;'
      )
      configContent = configContent.replace(
        '# include global/wordpress-ms-subdomain.conf;',
        '# include global/wordpress-ms-subdomain.conf;'
      )
      configContent = configContent.replace('include global/wordpress.conf;', includeDirective)
    }

    // Write the configuration file
    const sitesEnabledPath = join(process.cwd(), 'config', 'nginx', 'sites-enabled')
    await fs.mkdir(sitesEnabledPath, { recursive: true })
    await fs.writeFile(join(sitesEnabledPath, `${domain}.conf`), configContent, 'utf8')

    console.log(`Created Nginx configuration for ${domain}`)

    // For subdomain multisite, we need to add wildcard entry to hosts file
    if (multisite?.enabled && multisite.type === 'subdomain') {
      await modifyHostsFile(`*.${domain}`, 'add')
    }

    console.log(`Reloading Nginx configuration...`)

    await reloadNginxConfig()
  } catch (error) {
    console.error(`Failed to generate Nginx config for ${domain}:`, error)
    throw error
  }
}

export async function removeNginxConfig(domain: string): Promise<void> {
  try {
    const configPath = join(__dirname, '../../config/nginx/sites-enabled', `${domain}.conf`)

    // Check if the file exists before trying to delete it
    try {
      await fs.access(configPath)
      // If no error is thrown, file exists and we can delete it
      await fs.unlink(configPath)
      console.log(`Removed Nginx config for ${domain}`)
    } catch (_) {
      // File doesn't exist, so no need to delete it
      console.log(`Nginx config for ${domain} does not exist or is not accessible`)
    }
  } catch (error) {
    console.error(`Failed to remove Nginx config for ${domain}:`, error)
    throw error
  }
}

export async function reloadNginxConfig(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const reloadProcess = spawn('docker', ['compose', 'exec', 'web', 'nginx', '-s', 'reload'])

    reloadProcess.on('close', (code) => {
      if (code === 0) {
        console.log('Nginx configuration reloaded successfully')
        resolve()
      } else {
        console.error(`Failed to reload Nginx configuration: exited with code ${code}`)
        reject(new Error(`Failed to reload Nginx configuration: exited with code ${code}`))
      }
    })
  })
}
