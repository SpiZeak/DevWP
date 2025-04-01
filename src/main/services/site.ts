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

export async function generateIndexHtml(domain: string, sitePath: string): Promise<void> {
  try {
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

export function createSite(site: { domain: string }): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const sitePath = `./www/${site.domain}`
    exec(`mkdir -p ${sitePath}`, async (error, _, stderr) => {
      if (error) {
        console.error(`Error creating site directory: ${stderr}`)
        reject(`Error creating site directory: ${stderr}`)
        return
      }
      try {
        await modifyHostsFile(site.domain, 'add')
        await generateNginxConfig(site.domain)
        await generateIndexHtml(site.domain, sitePath)
        resolve(true)
      } catch (configError) {
        reject(`Error setting up site: ${configError}`)
      }
    })
  })
}

export function deleteSite(site: { name: string }): Promise<boolean> {
  return new Promise((resolve, reject) => {
    exec(`rm -rf ./www/${site.name}`, async (error, _, stderr) => {
      if (error) {
        console.error(`Error deleting site directory: ${stderr}`)
        reject(`Error deleting site directory: ${stderr}`)
        return
      }
      try {
        await modifyHostsFile(site.name, 'remove')
        await removeNginxConfig(site.name)
        resolve(true)
      } catch (hostsError) {
        reject(`Error cleaning up site: ${hostsError}`)
      }
    })
  })
}

export function getSites(): Promise<Site[]> {
  return new Promise((resolve, reject) => {
    // Read domains from environment variable or from the file system
    const domainsStr = process.env.DOMAINS || ''

    // Read sites directory content
    exec('ls -la ./www', (error, stdout, stderr) => {
      if (error) {
        console.error(`Error reading sites directory: ${stderr}`)
        reject(`Error reading sites directory: ${stderr}`)
        return
      }

      // Parse domains from env and actual directories
      const envDomains = domainsStr
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean)

      // Get directories from the output
      const dirRegex = /\s(\S+)$/gm
      const dirs: string[] = []
      let match

      const lines = stdout.split('\n')
      for (const line of lines) {
        if (line.startsWith('d')) {
          match = dirRegex.exec(line)
          if (match && !['.', '..', '.git'].includes(match[1])) {
            dirs.push(match[1])
          }
          dirRegex.lastIndex = 0 // Reset regex state
        }
      }

      // Combine both sources and create site objects
      const allDomains = [...new Set([...envDomains, ...dirs])]

      const sites = allDomains.map((domain) => ({
        name: domain,
        path: `www/${domain}`,
        url: `https://${domain}`,
        active: dirs.includes(domain)
      }))

      resolve(sites)
    })
  })
}
