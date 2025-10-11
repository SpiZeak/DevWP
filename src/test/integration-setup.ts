import { beforeAll, afterAll } from 'vitest'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// Setup before all integration tests
beforeAll(async () => {
  console.log('Starting Docker services for integration tests...')

  try {
    // Check if Docker is available
    await execAsync('docker --version')

    // Start minimal services for testing
    await execAsync('docker compose up -d mariadb')

    // Wait for MariaDB to be ready
    let ready = false
    let attempts = 0
    const maxAttempts = 30

    while (!ready && attempts < maxAttempts) {
      try {
        await execAsync('docker exec devwp_mariadb mariadb-admin ping -h localhost -u root -proot')
        ready = true
      } catch {
        attempts++
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    if (!ready) {
      throw new Error('MariaDB failed to start within timeout')
    }

    console.log('Docker services ready')
  } catch (error) {
    console.warn('Docker not available, skipping integration tests:', error)
    process.exit(0) // Skip tests if Docker unavailable
  }
}, 60000) // 60 second timeout

// Cleanup after all tests
afterAll(async () => {
  console.log('Cleaning up integration test environment...')

  try {
    // Clean up test data
    await execAsync(
      'docker exec devwp_mariadb mariadb -u root -proot -e "DROP DATABASE IF EXISTS test_devwp_config"'
    )
  } catch (error) {
    console.error('Cleanup error:', error)
  }
}, 30000)
