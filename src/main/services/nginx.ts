import { join } from 'path'
import { promises as fs } from 'fs'
import { exec } from 'child_process'

const nginxConfigPath = join(process.cwd(), 'config', 'nginx')
const sitesEnabledPath = join(nginxConfigPath, 'sites-enabled')
const templatePath = join(nginxConfigPath, 'template-site.conf')

export async function generateNginxConfig(
  domain: string,
  webRoot: string,
  aliases?: string,
  multisite?: {
    enabled: boolean
    type: 'subdomain' | 'subdirectory'
  }
): Promise<void> {
  try {
    const templateContent = await fs.readFile(templatePath, 'utf8')
    const allDomains = [domain, ...(aliases?.split(' ') || [])].filter(Boolean).join(' ')

    let finalConfig = templateContent
      .replace(/server_name example\.com;/g, `server_name ${allDomains};`)
      .replace(/root \/src\/www\/example\.com;/g, `root ${webRoot};`)

    if (multisite?.enabled) {
      if (multisite.type === 'subdirectory') {
        finalConfig = finalConfig.replace(
          '# include global/wordpress-ms-subdir.conf;',
          'include global/wordpress-ms-subdir.conf;'
        )
        finalConfig = finalConfig.replace(
          'include global/wordpress.conf;',
          '# include global/wordpress.conf;'
        )
      } else {
        // subdomain
        finalConfig = finalConfig.replace(
          '# include global/wordpress-ms-subdomain.conf;',
          'include global/wordpress-ms-subdomain.conf;'
        )
        finalConfig = finalConfig.replace(
          'include global/wordpress.conf;',
          '# include global/wordpress.conf;'
        )
      }
    }

    const newConfigPath = join(sitesEnabledPath, `${domain}.conf`)
    await fs.writeFile(newConfigPath, finalConfig, 'utf8')
    console.log(`Generated Nginx config for ${domain}`)
    await reloadNginx()
  } catch (error) {
    console.error(`Failed to generate Nginx config for ${domain}:`, error)
    throw error
  }
}

export async function removeNginxConfig(domain: string): Promise<void> {
  try {
    const configPath = join(sitesEnabledPath, `${domain}.conf`)
    await fs.unlink(configPath)
    console.log(`Removed Nginx config for ${domain}`)
    await reloadNginx()
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.log(`Nginx config for ${domain} not found, skipping removal.`)
      return
    }
    console.error(`Failed to remove Nginx config for ${domain}:`, error)
    throw error
  }
}

async function reloadNginx(): Promise<void> {
  return new Promise((resolve, reject) => {
    exec('docker compose exec nginx nginx -s reload', (error, stdout, stderr) => {
      if (error) {
        console.error(`Error reloading Nginx: ${stderr}`)
        reject(error)
        return
      }
      console.log('Nginx reloaded successfully.')
      resolve()
    })
  })
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
