/* eslint-disable @typescript-eslint/no-explicit-any */

import { ipcMain } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as docker from '../services/docker';
import {
  registerContainerHandlers,
  startContainerMonitoring,
  stopContainerMonitoring,
} from './container';

// Mock modules
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
  BrowserWindow: vi.fn(),
  app: {
    getPath: vi.fn(() => '/tmp/devwp'),
  },
}));
vi.mock('../services/docker');

describe('Container IPC Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('registerContainerHandlers', () => {
    it('should register get-container-status handler', () => {
      registerContainerHandlers();

      expect(ipcMain.handle).toHaveBeenCalledWith(
        'get-container-status',
        expect.any(Function),
      );
    });

    it('should register restart-container handler', () => {
      registerContainerHandlers();

      expect(ipcMain.handle).toHaveBeenCalledWith(
        'restart-container',
        expect.any(Function),
      );
    });
  });

  describe('get-container-status handler', () => {
    it('should call getDockerContainers and return result', async () => {
      const mockContainers = [
        { id: 'abc123', name: 'devwp_nginx', status: 'running' },
        { id: 'def456', name: 'devwp_php', status: 'running' },
      ];
      vi.mocked(docker.getDockerContainers).mockResolvedValue(
        mockContainers as any,
      );

      registerContainerHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'get-container-status')?.[1];

      const result = await handler!({} as any);

      expect(docker.getDockerContainers).toHaveBeenCalled();
      expect(result).toEqual(mockContainers);
    });

    it('should handle errors from getDockerContainers', async () => {
      const error = new Error('Docker daemon not running');
      vi.mocked(docker.getDockerContainers).mockRejectedValue(error);

      registerContainerHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'get-container-status')?.[1];

      await expect(handler!({} as any)).rejects.toThrow(
        'Docker daemon not running',
      );
    });

    it('should return empty array when no containers found', async () => {
      vi.mocked(docker.getDockerContainers).mockResolvedValue([]);

      registerContainerHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'get-container-status')?.[1];

      const result = await handler!({} as any);

      expect(result).toEqual([]);
    });
  });

  describe('restart-container handler', () => {
    it('should call restartContainer with container id', async () => {
      vi.mocked(docker.restartContainer).mockResolvedValue({
        success: true,
      } as any);

      registerContainerHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'restart-container')?.[1];

      const result = await handler!({} as any, 'abc123');

      expect(docker.restartContainer).toHaveBeenCalledWith('abc123');
      expect(result).toEqual({ success: true });
    });

    it('should handle restart failures', async () => {
      const error = new Error('Container not found');
      vi.mocked(docker.restartContainer).mockRejectedValue(error);

      registerContainerHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'restart-container')?.[1];

      await expect(handler!({} as any, 'invalid-id')).rejects.toThrow(
        'Container not found',
      );
    });

    it('should pass through container restart result', async () => {
      const mockResult = {
        success: true,
        message: 'Container restarted successfully',
      };
      vi.mocked(docker.restartContainer).mockResolvedValue(mockResult as any);

      registerContainerHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'restart-container')?.[1];

      const result = await handler!({} as any, 'nginx_container');

      expect(result).toEqual(mockResult);
    });
  });

  describe('startContainerMonitoring', () => {
    let mockWindow: any;

    beforeEach(() => {
      mockWindow = {
        webContents: {
          send: vi.fn(),
        },
      };
    });

    it('should perform initial container check', async () => {
      const mockContainers = [{ id: '123', name: 'nginx', status: 'running' }];
      vi.mocked(docker.getDockerContainers).mockResolvedValue(
        mockContainers as any,
      );

      startContainerMonitoring(mockWindow);

      await vi.waitFor(() => {
        expect(docker.getDockerContainers).toHaveBeenCalled();
      });
    });

    it('should send initial container status to renderer', async () => {
      const mockContainers = [{ id: '123', name: 'nginx', status: 'running' }];
      vi.mocked(docker.getDockerContainers).mockResolvedValue(
        mockContainers as any,
      );

      startContainerMonitoring(mockWindow);

      await vi.waitFor(() => {
        expect(mockWindow.webContents.send).toHaveBeenCalledWith(
          'container-status',
          mockContainers,
        );
      });
    });

    it('should handle initial check errors gracefully', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      vi.mocked(docker.getDockerContainers).mockRejectedValue(
        new Error('Docker error'),
      );

      startContainerMonitoring(mockWindow);

      await vi.waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(
          'Error checking containers:',
          expect.any(Error),
        );
      });

      consoleError.mockRestore();
    });

    it('should set up periodic container checks', async () => {
      const mockContainers = [{ id: '123', name: 'nginx', status: 'running' }];
      vi.mocked(docker.getDockerContainers).mockResolvedValue(
        mockContainers as any,
      );

      startContainerMonitoring(mockWindow);

      // Wait for initial call
      await vi.waitFor(() => {
        expect(docker.getDockerContainers).toHaveBeenCalledTimes(1);
      });

      // Advance time by 5 seconds
      await vi.advanceTimersByTimeAsync(5000);

      expect(docker.getDockerContainers).toHaveBeenCalledTimes(2);
    });

    it('should check containers every 5 seconds', async () => {
      const mockContainers = [{ id: '123', name: 'nginx', status: 'running' }];
      vi.mocked(docker.getDockerContainers).mockResolvedValue(
        mockContainers as any,
      );

      startContainerMonitoring(mockWindow);

      await vi.waitFor(() => {
        expect(docker.getDockerContainers).toHaveBeenCalledTimes(1);
      });

      // Advance time by 15 seconds (3 intervals)
      await vi.advanceTimersByTimeAsync(15000);

      expect(docker.getDockerContainers).toHaveBeenCalledTimes(4); // Initial + 3 intervals
    });

    it('should send container status on each interval', async () => {
      const mockContainers = [{ id: '123', name: 'nginx', status: 'running' }];
      vi.mocked(docker.getDockerContainers).mockResolvedValue(
        mockContainers as any,
      );

      startContainerMonitoring(mockWindow);

      await vi.waitFor(() => {
        expect(mockWindow.webContents.send).toHaveBeenCalledTimes(1);
      });

      await vi.advanceTimersByTimeAsync(10000);

      expect(mockWindow.webContents.send).toHaveBeenCalledTimes(3);
      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'container-status',
        mockContainers,
      );
    });

    it('should clear existing interval before starting new one', async () => {
      const mockContainers = [{ id: '123', name: 'nginx', status: 'running' }];
      vi.mocked(docker.getDockerContainers).mockResolvedValue(
        mockContainers as any,
      );

      // Start first monitoring
      startContainerMonitoring(mockWindow);

      await vi.waitFor(() => {
        expect(docker.getDockerContainers).toHaveBeenCalledTimes(1);
      });

      // Start second monitoring (should clear first)
      startContainerMonitoring(mockWindow);

      await vi.waitFor(() => {
        expect(docker.getDockerContainers).toHaveBeenCalledTimes(2);
      });

      // Advance time to verify only one interval is active
      await vi.advanceTimersByTimeAsync(5000);

      // Should be 3 (2 initial + 1 interval), not 4 (if both intervals were active)
      expect(docker.getDockerContainers).toHaveBeenCalledTimes(3);
    });

    it('should handle errors during periodic checks', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      vi.mocked(docker.getDockerContainers)
        .mockResolvedValueOnce([{ id: '123' } as any])
        .mockRejectedValueOnce(new Error('Network error'));

      startContainerMonitoring(mockWindow);

      await vi.waitFor(() => {
        expect(docker.getDockerContainers).toHaveBeenCalledTimes(1);
      });

      await vi.advanceTimersByTimeAsync(5000);

      expect(consoleError).toHaveBeenCalledWith(
        'Error checking containers:',
        expect.any(Error),
      );
      consoleError.mockRestore();
    });
  });

  describe('stopContainerMonitoring', () => {
    let mockWindow: any;

    beforeEach(() => {
      mockWindow = {
        webContents: {
          send: vi.fn(),
        },
      };
      vi.mocked(docker.getDockerContainers).mockResolvedValue([]);
    });

    it('should clear the monitoring interval', async () => {
      startContainerMonitoring(mockWindow);

      await vi.waitFor(() => {
        expect(docker.getDockerContainers).toHaveBeenCalled();
      });

      stopContainerMonitoring();

      const callsBefore = vi.mocked(docker.getDockerContainers).mock.calls
        .length;

      await vi.advanceTimersByTimeAsync(10000);

      // Should not have any new calls
      expect(docker.getDockerContainers).toHaveBeenCalledTimes(callsBefore);
    });

    it('should handle stopping when no monitoring is active', () => {
      expect(() => stopContainerMonitoring()).not.toThrow();
    });

    it('should allow restarting after stop', async () => {
      startContainerMonitoring(mockWindow);

      await vi.waitFor(() => {
        expect(docker.getDockerContainers).toHaveBeenCalled();
      });

      stopContainerMonitoring();

      const callsAfterStop = vi.mocked(docker.getDockerContainers).mock.calls
        .length;

      // Start again
      startContainerMonitoring(mockWindow);

      await vi.waitFor(() => {
        expect(docker.getDockerContainers).toHaveBeenCalledTimes(
          callsAfterStop + 1,
        );
      });

      await vi.advanceTimersByTimeAsync(5000);

      expect(docker.getDockerContainers).toHaveBeenCalledTimes(
        callsAfterStop + 2,
      );
    });
  });
});
