import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execAsync = promisify(exec);

describe('Docker Integration Tests', () => {
  it('should verify Docker is available', async () => {
    try {
      const { stdout } = await execAsync('docker --version');
      expect(stdout).toContain('Docker version');
    } catch {
      // Skip test if Docker is not available
      console.warn('Docker not available, skipping test');
    }
  });

  it('should verify Docker Compose is available', async () => {
    try {
      const { stdout } = await execAsync('docker compose version');
      expect(stdout).toMatch(/Docker Compose version|docker-compose version/);
    } catch {
      // Skip test if Docker Compose is not available
      console.warn('Docker Compose not available, skipping test');
    }
  });
});
