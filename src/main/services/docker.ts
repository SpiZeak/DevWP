import { spawn, exec } from 'child_process'
import { platform } from 'os'

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

      // Check if this is a progress message (like image pull) rather than an actual error
      if (
        output.includes('Pulling from') ||
        output.includes('Pulling fs layer') ||
        output.includes('Download complete') ||
        output.includes('Pull complete') ||
        output.includes('Digest:') ||
        output.includes('Status:') ||
        output.includes('Started') ||
        output.includes('Starting') ||
        output.includes('Running') ||
        output.includes('Built') ||
        output.includes('Creating') ||
        output.includes('Created')
      ) {
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

// Function to get Docker container information
export function getDockerContainers(): Promise<Container[]> {
  return new Promise((resolve, reject) => {
    exec('docker compose ps --format "{{.ID}}|{{.Names}}|{{.State}}" -a', (error, stdout) => {
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
          return { id, name, state: state.toLowerCase() }
        })

      resolve(containers)
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
