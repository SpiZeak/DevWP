import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execAsync = promisify(exec);
const COMMAND_TIMEOUT_MS = 3000;

async function tryExec(command: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(command, {
      timeout: COMMAND_TIMEOUT_MS,
    });
    return stdout;
  } catch {
    return null;
  }
}

describe('Docker Integration Tests', () => {
  it('should verify Docker is available', async () => {
    const stdout = await tryExec('docker --version');
    if (!stdout) {
      // Skip test if Docker is not available
      console.warn('Docker not available, skipping test');
      return;
    }

    expect(stdout).toContain('Docker version');
  });

  it('should verify Docker Compose is available', async () => {
    const stdout = await tryExec('docker compose version');
    if (!stdout) {
      // Skip test if Docker Compose is not available
      console.warn('Docker Compose not available, skipping test');
      return;
    }

    expect(stdout).toMatch(/Docker Compose version|docker-compose version/);
  });
});
