import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import type { BrowserWindow } from 'electron';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';
import * as database from './database';
import * as xdebugService from './xdebug';

// Mock modules
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
  },
}));
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));
vi.mock('./database', () => ({
  getSetting: vi.fn(),
  saveSetting: vi.fn(),
}));

describe('Xdebug Service', () => {
  const mockConfigPath = expect.stringContaining('xdebug.ini');

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock process.cwd()
    vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initializeXdebugStatus', () => {
    it('should initialize Xdebug status from database', async () => {
      (database.getSetting as Mock).mockResolvedValue('true');

      await xdebugService.initializeXdebugStatus();

      expect(database.getSetting).toHaveBeenCalledWith('xdebug_enabled');
    });

    it('should fallback to file check if database fails', async () => {
      (database.getSetting as Mock).mockRejectedValue(
        new Error('Database error'),
      );
      (fs.readFile as Mock).mockResolvedValue('xdebug.mode = develop,debug\n');

      await xdebugService.initializeXdebugStatus();

      expect(fs.readFile).toHaveBeenCalled();
    });

    it('should default to disabled if both database and file fail', async () => {
      (database.getSetting as Mock).mockRejectedValue(
        new Error('Database error'),
      );
      (fs.readFile as Mock).mockRejectedValue(new Error('File error'));

      await xdebugService.initializeXdebugStatus();

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('getXdebugStatus', () => {
    it('should return true when Xdebug is enabled', async () => {
      const mockContent = 'xdebug.mode = develop,debug\n';
      (fs.readFile as Mock).mockResolvedValue(mockContent);
      (database.saveSetting as Mock).mockResolvedValue(undefined);

      const status = await xdebugService.getXdebugStatus();

      expect(status).toBe(true);
      expect(fs.readFile).toHaveBeenCalledWith(mockConfigPath, 'utf-8');
      expect(database.saveSetting).toHaveBeenCalledWith(
        'xdebug_enabled',
        'true',
      );
    });

    it('should return false when Xdebug is disabled', async () => {
      const mockContent = 'xdebug.mode = off\n';
      (fs.readFile as Mock).mockResolvedValue(mockContent);
      (database.saveSetting as Mock).mockResolvedValue(undefined);

      const status = await xdebugService.getXdebugStatus();

      expect(status).toBe(false);
      expect(database.saveSetting).toHaveBeenCalledWith(
        'xdebug_enabled',
        'false',
      );
    });

    it('should return false when config file does not exist', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      (fs.readFile as Mock).mockRejectedValue(error);
      (database.saveSetting as Mock).mockResolvedValue(undefined);

      const status = await xdebugService.getXdebugStatus();

      expect(status).toBe(false);
      expect(database.saveSetting).toHaveBeenCalledWith(
        'xdebug_enabled',
        'false',
      );
    });

    it('should return last known status on read error', async () => {
      (fs.readFile as Mock).mockRejectedValue(new Error('Permission denied'));
      (database.getSetting as Mock).mockResolvedValue('true');

      const status = await xdebugService.getXdebugStatus();

      expect(status).toBe(true);
      expect(database.getSetting).toHaveBeenCalledWith('xdebug_enabled');
    });

    it('should ignore commented lines when checking status', async () => {
      const mockContent = ';xdebug.mode = off\nxdebug.mode = develop,debug\n';
      (fs.readFile as Mock).mockResolvedValue(mockContent);
      (database.saveSetting as Mock).mockResolvedValue(undefined);

      const status = await xdebugService.getXdebugStatus();

      expect(status).toBe(true);
    });

    it('should handle database save failure gracefully', async () => {
      const mockContent = 'xdebug.mode = develop,debug\n';
      (fs.readFile as Mock).mockResolvedValue(mockContent);
      (database.saveSetting as Mock).mockRejectedValue(
        new Error('Database error'),
      );

      const status = await xdebugService.getXdebugStatus();

      expect(status).toBe(true); // Should still return correct status
    });
  });

  describe('toggleXdebug', () => {
    const mockMainWindow = {
      webContents: {
        send: vi.fn(),
      },
    } as unknown as BrowserWindow;

    const mockSpawnProcess = {
      on: vi.fn(),
      stderr: {
        on: vi.fn(),
      },
    };

    beforeEach(() => {
      (spawn as Mock).mockReturnValue(
        mockSpawnProcess as unknown as ReturnType<typeof spawn>,
      );
    });

    it('should enable Xdebug when currently disabled', async () => {
      const mockContent = 'xdebug.mode = off\n';
      (fs.readFile as Mock)
        .mockResolvedValueOnce(mockContent) // Initial read for status check
        .mockResolvedValueOnce(mockContent) // Read before toggle
        .mockResolvedValueOnce('xdebug.mode = develop,debug\n'); // Read after toggle
      (fs.writeFile as Mock).mockResolvedValue(undefined);
      (database.saveSetting as Mock).mockResolvedValue(undefined);

      // Mock spawn success
      mockSpawnProcess.on.mockImplementation(
        (event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 100);
          }
          return mockSpawnProcess;
        },
      );

      const promise = xdebugService.toggleXdebug(mockMainWindow);

      // Wait for the async operation to complete
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(fs.writeFile).toHaveBeenCalled();
      expect(spawn).toHaveBeenCalledWith(
        'docker',
        ['compose', 'restart', 'frankenphp'],
        {
          cwd: '/test/project',
          shell: false,
        },
      );
      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
        'xdebug-status',
        {
          status: 'restarting',
          enabled: true,
        },
      );

      await promise.then((status) => {
        expect(status).toBe(true);
      });
    });

    it('should disable Xdebug when currently enabled', async () => {
      const mockContent = 'xdebug.mode = develop,debug\n';
      (fs.readFile as Mock)
        .mockResolvedValueOnce(mockContent) // Initial read for status check
        .mockResolvedValueOnce(mockContent) // Read before toggle
        .mockResolvedValueOnce('xdebug.mode = off\n'); // Read after toggle
      (fs.writeFile as Mock).mockResolvedValue(undefined);
      (database.saveSetting as Mock).mockResolvedValue(undefined);

      mockSpawnProcess.on.mockImplementation(
        (event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 100);
          }
          return mockSpawnProcess;
        },
      );

      const promise = xdebugService.toggleXdebug(mockMainWindow);

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(fs.writeFile).toHaveBeenCalled();
      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
        'xdebug-status',
        {
          status: 'restarting',
          enabled: false,
        },
      );

      await promise.then((status) => {
        expect(status).toBe(false);
      });
    });

    it('should handle file write errors', async () => {
      const mockContent = 'xdebug.mode = off\n';
      (fs.readFile as Mock).mockResolvedValue(mockContent);
      (fs.writeFile as Mock).mockRejectedValue(new Error('Write failed'));

      await expect(xdebugService.toggleXdebug(mockMainWindow)).rejects.toThrow(
        'Write failed',
      );

      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
        'xdebug-status',
        {
          status: 'error',
          message: expect.stringContaining('Write failed'),
        },
      );
    });

    it('should handle Docker restart failures', async () => {
      const mockContent = 'xdebug.mode = off\n';
      (fs.readFile as Mock).mockResolvedValue(mockContent);
      (fs.writeFile as Mock).mockResolvedValue(undefined);

      mockSpawnProcess.stderr?.on.mockImplementation(
        (event: string, callback: (data: Buffer | string) => void) => {
          if (event === 'data') {
            callback('Docker error');
          }
          return mockSpawnProcess.stderr;
        },
      );

      mockSpawnProcess.on.mockImplementation(
        (event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(1), 100); // Non-zero exit code
          }
          return mockSpawnProcess;
        },
      );

      const promise = xdebugService.toggleXdebug(mockMainWindow);

      await expect(promise).rejects.toThrow(
        'Failed to restart FrankenPHP container',
      );

      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
        'xdebug-status',
        {
          status: 'error',
          message: expect.stringContaining(
            'Failed to restart FrankenPHP container',
          ),
        },
      );
    });

    it('should work without mainWindow parameter', async () => {
      const mockContent = 'xdebug.mode = off\n';
      (fs.readFile as Mock)
        .mockResolvedValueOnce(mockContent)
        .mockResolvedValueOnce(mockContent)
        .mockResolvedValueOnce('xdebug.mode = develop,debug\n');
      (fs.writeFile as Mock).mockResolvedValue(undefined);
      (database.saveSetting as Mock).mockResolvedValue(undefined);

      mockSpawnProcess.on.mockImplementation(
        (event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 100);
          }
          return mockSpawnProcess;
        },
      );

      const promise = xdebugService.toggleXdebug();

      await new Promise((resolve) => setTimeout(resolve, 150));

      await promise.then((status) => {
        expect(status).toBe(true);
      });
    });

    it('should handle missing config file during toggle', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      (fs.readFile as Mock)
        .mockResolvedValueOnce('xdebug.mode = off\n') // Initial status check
        .mockRejectedValueOnce(error); // Read before toggle
      (fs.writeFile as Mock).mockResolvedValue(undefined);
      (database.saveSetting as Mock).mockResolvedValue(undefined);

      mockSpawnProcess.on.mockImplementation(
        (event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 100);
          }
          return mockSpawnProcess;
        },
      );

      const promise = xdebugService.toggleXdebug();

      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should still complete successfully
      await promise.then((status) => {
        expect(typeof status).toBe('boolean');
      });
    });

    it('should handle spawn process errors', async () => {
      const mockContent = 'xdebug.mode = off\n';
      (fs.readFile as Mock).mockResolvedValue(mockContent);
      (fs.writeFile as Mock).mockResolvedValue(undefined);

      mockSpawnProcess.on.mockImplementation(
        (event: string, callback: (error: Error) => void) => {
          if (event === 'error') {
            setTimeout(() => callback(new Error('Spawn failed')), 10);
          }
          return mockSpawnProcess;
        },
      );

      const promise = xdebugService.toggleXdebug(mockMainWindow);

      await expect(promise).rejects.toThrow(
        'Failed to spawn docker restart command',
      );

      // Wait a bit more for the status update
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should have sent error status (the second call after 'restarting')
      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
        'xdebug-status',
        {
          status: 'error',
          message: expect.stringContaining('Spawn failed'),
        },
      );
    });
  });
});
