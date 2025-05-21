import { spawn, exec } from 'child_process'
import { platform } from 'os'
import { BrowserWindow } from 'electron'

// Function to start Docker Compose
export function startDockerCompose(mainWindow?: BrowserWindow): Promise<void> {
  return new Promise((resolve, reject) => {
    const isWin = platform() === 'win32'
    const command = isWin ? 'docker-compose.exe' : 'docker-compose'
    const dockerProcess = spawn(command, ['up', '-d', '--build', 'web'])

    // Send initial status if window exists
    if (mainWindow) {
      mainWindow.webContents.send('docker-status', {
        status: 'starting',
        message: 'Starting Docker containers...'
      })
    }

    dockerProcess.stdout.on('data', (data) => {
      const output = data.toString().trim()
      console.log(`Docker compose: ${output}`)
      if (mainWindow) {
        mainWindow.webContents.send('docker-status', {
          status: 'progress',
          message: output
        })
      }
    })

    dockerProcess.stderr.on('data', (data) => {
      const output = data.toString().trim()

      // Define progress keywords
      const progressKeywords = [
        'Pulling from',
        'Pulling fs layer',
        'Download complete',
        'Pull complete',
        'Digest:',
        'Status:',
        'Started',
        'Starting',
        'Running',
        'Built',
        'Creating',
        'Created',
        'Extracting',
        'Verifying Checksum',
        'Downloading',
        'Unpacking',
        'Waiting',
        'Removing'
      ]

      // Check if the output contains any of the progress keywords
      if (progressKeywords.some((keyword) => output.includes(keyword))) {
        console.log(`Docker compose progress (stderr): ${output}`)

        if (mainWindow) {
          mainWindow.webContents.send('docker-status', {
            status: 'progress',
            message: output
          })
        }
      } else {
        console.error(`Docker compose error: ${output}`)

        if (mainWindow) {
          mainWindow.webContents.send('docker-status', {
            status: 'error',
            message: output
          })
        }
      }
    })

    dockerProcess.on('close', (code) => {
      console.log(`Docker compose process exited with code ${code}`)

      if (mainWindow) {
        mainWindow.webContents.send('docker-status', {
          status: code === 0 ? 'complete' : 'error',
          message: `Process exited with code ${code}`
        })
      }

      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Docker compose exited with code ${code}`))
      }
    })
  })
}

// Function to stop Docker Compose
export function stopDockerCompose(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('Stopping Docker containers...')
    const dockerProcess = spawn('docker-compose', ['down'])

    dockerProcess.on('close', (code) => {
      if (code === 0) {
        console.log('Docker containers stopped successfully')
        resolve()
      } else {
        const errorMsg = `Docker compose down exited with code ${code}`
        console.error(errorMsg)
        reject(new Error(errorMsg))
      }
    })
  })
}

interface Container {
  id: string
  name: string
  state: string
  version?: string | undefined
}

export function getDockerContainers(): Promise<Container[]> {
  return new Promise((resolve, reject) => {
    exec('docker compose ps --format "{{.ID}}|{{.Names}}|{{.State}}" -a', async (error, stdout) => {
      if (error) {
        console.error('Error getting container status:', error)
        reject(error)
        return
      }

      const containers = stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [id, name, state] = line.split('|')
          return { id, name, state: state.toLowerCase(), version: undefined }
        }) as Container[]

      // Fetch version information for each container
      try {
        for (const container of containers) {
          const version = await getContainerVersion(container.id)
          container.version = version
        }
      } catch (versionError) {
        console.error('Error fetching container versions:', versionError)
      }

      resolve(containers)
    })
  })
}

// Helper function to get container version
function getContainerVersion(containerId: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    // Get the container name to identify special cases
    exec(`docker inspect --format='{{.Name}}' ${containerId}`, (nameError, nameStdout) => {
      if (nameError) {
        console.error(`Error getting container name for ${containerId}:`, nameError)
        resolve(undefined)
        return
      }

      const containerName = nameStdout.trim().replace(/^\//, '')

      switch (containerName) {
        case 'devwp_web':
          // Nginx outputs version to stderr
          exec(`docker exec ${containerId} nginx -v`, (nginxError, _stdout, nginxStderr) => {
            if (nginxError) {
              console.error(`Error getting Nginx version for container ${containerId}:`, nginxError)
              resolve(undefined)
              return
            }
            const output = nginxStderr
            const versionMatch = output.match(/nginx\/(\d+\.\d+\.\d+)/)
            resolve(versionMatch ? versionMatch[1] : undefined)
          })
          break

        case 'devwp_php':
          // PHP outputs version to stdout, extract only the version number
          exec(`docker exec ${containerId} php --version`, (phpError, phpStdout) => {
            if (phpError) {
              console.error(`Error getting PHP version for container ${containerId}:`, phpError)
              resolve(undefined)
              return
            }
            // Extract version number from the first line, e.g. "PHP 8.1.2 (cli) ..."
            const match = phpStdout.match(/PHP\s+(\d+\.\d+\.\d+)/)
            resolve(match ? match[1] : undefined)
          })
          break

        case 'devwp_database':
          // MySQL outputs version to stdout, extract only the version number
          exec(`docker exec ${containerId} mysql --version`, (mysqlError, mysqlStdout) => {
            if (mysqlError) {
              console.error(`Error getting MySQL version for container ${containerId}:`, mysqlError)
              resolve(undefined)
              return
            }
            // Example output: "mysql  Ver 8.0.32 for Linux on x86_64 (MySQL Community Server - GPL)"
            const match = mysqlStdout.match(/Ver\s+(\d+\.\d+\.\d+)/)
            resolve(match ? match[1] : undefined)
          })
          break

        case 'devwp_cache':
          // Redis outputs version to stdout, extract only the version number
          exec(`docker exec ${containerId} redis-server --version`, (redisError, redisStdout) => {
            if (redisError) {
              console.error(`Error getting Redis version for container ${containerId}:`, redisError)
              resolve(undefined)
              return
            }
            // Example output: "Redis server v=7.0.5 sha=... ..."
            const match = redisStdout.match(/v=([\d.]+)/)
            resolve(match ? match[1] : undefined)
          })
          break

        case 'devwp_sonarqube':
          // SonarQube outputs version to stdout with 'sonar-scanner --version'
          exec(
            `docker exec ${containerId} curl http://localhost:9000/api/server/version`,
            (sonarError, sonarStdout) => {
              if (sonarError) {
                console.error(
                  `Error getting SonarQube version for container ${containerId}:`,
                  sonarError
                )
                resolve(undefined)
                return
              }
              resolve(sonarStdout)
            }
          )
          break

        default:
          // For other containers, use the image tag
          exec(
            `docker inspect --format='{{index .Config.Image}}' ${containerId}`,
            (error, stdout) => {
              if (error) {
                console.error(`Error getting version for container ${containerId}:`, error)
                resolve(undefined)
                return
              }
              const image = stdout.trim()
              const versionMatch = image.match(/:([^:]+)$/)
              resolve(versionMatch ? versionMatch[1] : 'latest')
            }
          )
      }
    })
  })
}

// Function to restart a Docker container
export function restartContainer(containerId: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    exec(`docker restart ${containerId}`, (error, stdout) => {
      if (error) {
        console.error('Error restarting container:', error)
        reject(error)
        return
      }
      console.log('Container restart output:', stdout)
      resolve(true)
    })
  })
}
