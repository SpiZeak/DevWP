import { spawn, exec } from 'child_process'
import { platform } from 'os'
import { BrowserWindow } from 'electron'

// Function to start Docker Compose
export function startDockerCompose(mainWindow?: BrowserWindow): Promise<void> {
  return new Promise((resolve, reject) => {
    // Cross-platform Docker Compose command
    const isWin = platform() === 'win32'
    const command = isWin ? 'docker-compose.exe' : 'docker-compose'

    const dockerProcess = spawn(command, ['up', '-d', '--build'])

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
    // First, get the container name to identify if it's the web/nginx container
    exec(`docker inspect --format='{{.Name}}' ${containerId}`, (nameError, nameStdout) => {
      if (nameError) {
        console.error(`Error getting container name for ${containerId}:`, nameError)
        resolve(undefined)
        return
      }

      const containerName = nameStdout.trim().replace(/^\//, '') // Remove leading slash if present

      // Special handling for nginx (web) container
      if (containerName === 'devwp_web') {
        // Execute nginx -v inside the container to get its version
        exec(`docker exec ${containerId} nginx -v`, (nginxError, nginxStderr, stderr) => {
          if (nginxError) {
            console.error(`Error getting Nginx version for container ${containerId}:`, nginxError)
            resolve(undefined)
            return
          }

          // Nginx outputs version to stderr
          const output = stderr || nginxStderr
          const versionMatch = output.match(/nginx\/(\d+\.\d+\.\d+)/)
          const version = versionMatch ? versionMatch[1] : undefined

          resolve(version)
        })
      } else {
        // For other containers, use the original image tag extraction method
        exec(
          `docker inspect --format='{{index .Config.Image}}' ${containerId}`,
          (error, stdout) => {
            if (error) {
              console.error(`Error getting version for container ${containerId}:`, error)
              resolve(undefined)
              return
            }

            const image = stdout.trim()
            // Parse version from image tag if available
            const versionMatch = image.match(/:([^:]+)$/)
            const version = versionMatch ? versionMatch[1] : 'latest'

            resolve(version)
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
