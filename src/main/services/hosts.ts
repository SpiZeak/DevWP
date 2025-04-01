import sudo from 'sudo-prompt'
import { platform } from 'os'
import { writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { promises as fs } from 'fs'

export async function modifyHostsFile(domain: string, action: 'add' | 'remove'): Promise<void> {
  // Cross-platform hosts file path
  const isWin = platform() === 'win32'
  const hostsPath = isWin
    ? join('C:', 'Windows', 'System32', 'drivers', 'etc', 'hosts')
    : '/etc/hosts'

  const hostsEntry = `127.0.0.1 ${domain}`

  try {
    let hostsContent = await fs.readFile(hostsPath, 'utf8')

    if (action === 'add') {
      if (!hostsContent.includes(hostsEntry)) {
        hostsContent += `\n${hostsEntry}`
      }
    } else if (action === 'remove') {
      hostsContent = hostsContent
        .split('\n')
        .filter((line) => !line.includes(domain))
        .join('\n')
    }

    // Windows has issues with direct echo to system files through sudo
    if (isWin) {
      // Create a temp file for the new hosts content
      const tempFile = join(tmpdir(), 'hosts_temp')
      await writeFile(tempFile, hostsContent, 'utf8')

      const command = `copy "${tempFile}" "${hostsPath}" /Y`

      await new Promise<void>((resolve, reject) => {
        sudo.exec(command, { name: 'DevWP' }, (error) => {
          if (error) {
            console.error(`Failed to modify hosts file: ${error}`)
            reject(error)
          } else {
            resolve()
          }
        })
      })
    } else {
      // Unix approach
      const command = `echo "${hostsContent}" > ${hostsPath}`
      await new Promise<void>((resolve, reject) => {
        sudo.exec(command, { name: 'DevWP' }, (error) => {
          if (error) {
            console.error(`Failed to modify hosts file: ${error}`)
            reject(error)
          } else {
            resolve()
          }
        })
      })
    }
  } catch (error) {
    console.error(`Failed to modify hosts file: ${error}`)
    throw error
  }
}
