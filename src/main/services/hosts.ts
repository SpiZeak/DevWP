import sudo from 'sudo-prompt'
import { promises as fs } from 'fs'

export async function modifyHostsFile(domain: string, action: 'add' | 'remove'): Promise<void> {
  const hostsPath = '/etc/hosts'
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
  } catch (error) {
    console.error(`Failed to modify hosts file: ${error}`)
    throw error
  }
}
