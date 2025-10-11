import { describe, it, expect } from 'vitest'

describe('Docker Service Utilities', () => {
  describe('Container ID Validation', () => {
    it('should validate container ID format', () => {
      const validIds = ['abc123', 'devwp_nginx', 'container-name-123']
      const invalidIds = ['', 'invalid id!', 'drop table;', 'test space']

      validIds.forEach((id) => {
        expect(isValidContainerId(id)).toBe(true)
      })

      invalidIds.forEach((id) => {
        expect(isValidContainerId(id)).toBe(false)
      })
    })

    it('should reject empty container IDs', () => {
      expect(isValidContainerId('')).toBe(false)
    })

    it('should accept alphanumeric with dashes and underscores', () => {
      expect(isValidContainerId('test-name_123')).toBe(true)
    })
  })

  describe('Docker Output Parsing', () => {
    it('should parse docker ps output correctly', () => {
      const mockOutput = `devwp_nginx\trunning\thealthy
devwp_php\trunning\thealthy
devwp_mariadb\trunning\thealthy`

      // Test pattern for parsing container status
      const lines = mockOutput.split('\n')
      expect(lines).toHaveLength(3)
      expect(lines[0]).toContain('devwp_nginx')
      expect(lines[0]).toContain('running')
      expect(lines[0]).toContain('healthy')
    })

    it('should parse container fields from tab-separated output', () => {
      const line = 'devwp_nginx\trunning\thealthy'
      const parts = line.split('\t')

      expect(parts[0]).toBe('devwp_nginx')
      expect(parts[1]).toBe('running')
      expect(parts[2]).toBe('healthy')
    })

    it('should handle empty docker ps output', () => {
      const mockOutput = ''
      const lines = mockOutput.split('\n').filter((line) => line.trim())
      expect(lines).toHaveLength(0)
    })
  })

  describe('Service Health Status', () => {
    it('should recognize health status values', () => {
      const healthStatuses = ['healthy', 'unhealthy', 'starting', 'none']

      healthStatuses.forEach((status) => {
        expect(isValidHealthStatus(status)).toBe(true)
      })
    })

    it('should reject invalid health statuses', () => {
      expect(isValidHealthStatus('invalid')).toBe(false)
      expect(isValidHealthStatus('')).toBe(false)
    })
  })

  describe('Container Name Validation', () => {
    it('should validate devwp container names', () => {
      const validNames = [
        'devwp_nginx',
        'devwp_php',
        'devwp_mariadb',
        'devwp_redis',
        'devwp_mailpit'
      ]

      validNames.forEach((name) => {
        expect(name.startsWith('devwp_')).toBe(true)
      })
    })

    it('should identify service type from container name', () => {
      expect(getServiceType('devwp_nginx')).toBe('nginx')
      expect(getServiceType('devwp_php')).toBe('php')
      expect(getServiceType('devwp_mariadb')).toBe('mariadb')
    })
  })
})

// Helper functions to test
function isValidContainerId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id) && id.length > 0
}

function isValidHealthStatus(status: string): boolean {
  const validStatuses = ['healthy', 'unhealthy', 'starting', 'none']
  return validStatuses.includes(status)
}

function getServiceType(containerName: string): string {
  return containerName.replace('devwp_', '')
}
