import { join } from 'path'
import { spawn } from 'child_process'
import { promises as fs } from 'fs'

export async function generateNginxConfig(domain: string): Promise<void> {
  try {
    // Read the template config
    const templatePath = join(__dirname, '../../config/nginx/template-site.conf')
    let templateContent = await fs.readFile(templatePath, 'utf8')

    // Replace placeholders with site-specific values
    templateContent = templateContent.replace(/example\.com/g, domain)

    // Ensure the sites-enabled directory exists
    await fs.mkdir(join(__dirname, '../../config/nginx/sites-enabled'), { recursive: true })

    // Write the new config file
    const configPath = join(__dirname, '../../config/nginx/sites-enabled', `${domain}.conf`)
    await fs.writeFile(configPath, templateContent, 'utf8')

    console.log(`Created Nginx config for ${domain} at ${configPath}`)

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
