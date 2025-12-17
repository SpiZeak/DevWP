/* biome-ignore-all lint/suspicious/noExplicitAny: test mocks rely on any for flexibility */

import { type BrowserWindow, ipcMain } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as xdebugService from '../services/xdebug';
import { registerXdebugHandlers } from './xdebug';

// Mock modules
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
  },
  BrowserWindow: vi.fn(),
}));
vi.mock('../services/xdebug');

describe('Xdebug IPC Handlers', () => {
  let mockWindow: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWindow = {} as BrowserWindow;
  });

  describe('registerXdebugHandlers', () => {
    it('should remove existing handlers before registering new ones', () => {
      registerXdebugHandlers(mockWindow);

      expect(ipcMain.removeHandler).toHaveBeenCalledWith('get-xdebug-status');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('toggle-xdebug');
    });

    it('should register get-xdebug-status handler', () => {
      registerXdebugHandlers(mockWindow);

      expect(ipcMain.handle).toHaveBeenCalledWith(
        'get-xdebug-status',
        expect.any(Function),
      );
    });

    it('should register toggle-xdebug handler', () => {
      registerXdebugHandlers(mockWindow);

      expect(ipcMain.handle).toHaveBeenCalledWith(
        'toggle-xdebug',
        expect.any(Function),
      );
    });

    it('should log confirmation message', () => {
      const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

      registerXdebugHandlers(mockWindow);

      expect(consoleLog).toHaveBeenCalledWith('Xdebug handlers registered');
      consoleLog.mockRestore();
    });
  });

  describe('get-xdebug-status handler', () => {
    it('should call getXdebugStatus and return result', async () => {
      vi.mocked(xdebugService.getXdebugStatus).mockResolvedValue(true);

      registerXdebugHandlers(mockWindow);

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'get-xdebug-status')?.[1];

      const result = await handler?.({} as any);

      expect(xdebugService.getXdebugStatus).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should log request handling', async () => {
      const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.mocked(xdebugService.getXdebugStatus).mockResolvedValue(false);

      registerXdebugHandlers(mockWindow);

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'get-xdebug-status')?.[1];

      await handler?.({} as any);

      expect(consoleLog).toHaveBeenCalledWith(
        'Handling get-xdebug-status request',
      );
      consoleLog.mockRestore();
    });

    it('should handle errors from getXdebugStatus', async () => {
      const error = new Error('Failed to get status');
      vi.mocked(xdebugService.getXdebugStatus).mockRejectedValue(error);

      registerXdebugHandlers(mockWindow);

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'get-xdebug-status')?.[1];

      await expect(handler?.({} as any)).rejects.toThrow(
        'Failed to get status',
      );
    });
  });

  describe('toggle-xdebug handler', () => {
    it('should call toggleXdebug with window reference', async () => {
      vi.mocked(xdebugService.toggleXdebug).mockResolvedValue(true);

      registerXdebugHandlers(mockWindow);

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'toggle-xdebug')?.[1];

      const result = await handler?.({} as any);

      expect(xdebugService.toggleXdebug).toHaveBeenCalledWith(mockWindow);
      expect(result).toBe(true);
    });

    it('should log request handling', async () => {
      const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.mocked(xdebugService.toggleXdebug).mockResolvedValue(false);

      registerXdebugHandlers(mockWindow);

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'toggle-xdebug')?.[1];

      await handler?.({} as any);

      expect(consoleLog).toHaveBeenCalledWith('Handling toggle-xdebug request');
      consoleLog.mockRestore();
    });

    it('should handle errors from toggleXdebug', async () => {
      const error = new Error('Failed to toggle Xdebug');
      vi.mocked(xdebugService.toggleXdebug).mockRejectedValue(error);

      registerXdebugHandlers(mockWindow);

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'toggle-xdebug')?.[1];

      await expect(handler?.({} as any)).rejects.toThrow(
        'Failed to toggle Xdebug',
      );
    });

    it('should persist window reference across multiple toggles', async () => {
      vi.mocked(xdebugService.toggleXdebug).mockResolvedValue(true);

      registerXdebugHandlers(mockWindow);

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'toggle-xdebug')?.[1];

      await handler?.({} as any);
      await handler?.({} as any);

      expect(xdebugService.toggleXdebug).toHaveBeenCalledTimes(2);
      expect(xdebugService.toggleXdebug).toHaveBeenNthCalledWith(1, mockWindow);
      expect(xdebugService.toggleXdebug).toHaveBeenNthCalledWith(2, mockWindow);
    });
  });

  describe('handler re-registration', () => {
    it('should allow re-registration with different window', () => {
      const window1 = { id: 1 } as any;
      const window2 = { id: 2 } as any;

      registerXdebugHandlers(window1);
      registerXdebugHandlers(window2);

      // Should have removed handlers twice
      expect(ipcMain.removeHandler).toHaveBeenCalledTimes(4); // 2 handlers x 2 registrations
    });

    it('should use latest window reference after re-registration', async () => {
      const window1 = { id: 1 } as any;
      const window2 = { id: 2 } as any;
      vi.mocked(xdebugService.toggleXdebug).mockResolvedValue(true);

      registerXdebugHandlers(window1);
      registerXdebugHandlers(window2);

      // Get the latest registered handler
      const handleCalls = vi.mocked(ipcMain.handle).mock.calls;
      const handler = handleCalls
        .filter((call) => call[0] === 'toggle-xdebug')
        .pop()?.[1];

      await handler?.({} as any);

      expect(xdebugService.toggleXdebug).toHaveBeenCalledWith(window2);
    });
  });
});
