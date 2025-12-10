/* eslint-disable @typescript-eslint/no-explicit-any */

import { dialog, ipcMain } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as database from '../services/database';
import { registerSettingsHandlers } from './settings';

// Mock modules
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
}));
vi.mock('../services/database');

describe('Settings IPC Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('registerSettingsHandlers', () => {
    it('should register all settings handlers', () => {
      registerSettingsHandlers();

      expect(ipcMain.handle).toHaveBeenCalledWith(
        'get-settings',
        expect.any(Function),
      );
      expect(ipcMain.handle).toHaveBeenCalledWith(
        'get-setting',
        expect.any(Function),
      );
      expect(ipcMain.handle).toHaveBeenCalledWith(
        'save-setting',
        expect.any(Function),
      );
      expect(ipcMain.handle).toHaveBeenCalledWith(
        'delete-setting',
        expect.any(Function),
      );
      expect(ipcMain.handle).toHaveBeenCalledWith(
        'get-webroot-path',
        expect.any(Function),
      );
      expect(ipcMain.handle).toHaveBeenCalledWith(
        'get-xdebug-enabled-setting',
        expect.any(Function),
      );
      expect(ipcMain.handle).toHaveBeenCalledWith(
        'pick-directory',
        expect.any(Function),
      );
    });
  });

  describe('get-settings handler', () => {
    it('should return all settings', async () => {
      const mockSettings = { key1: 'value1', key2: 'value2' };
      vi.mocked(database.getAllSettings).mockResolvedValue(mockSettings);

      registerSettingsHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'get-settings')?.[1];

      const result = await handler!({} as any);

      expect(database.getAllSettings).toHaveBeenCalled();
      expect(result).toEqual(mockSettings);
    });

    it('should return empty object on error', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      vi.mocked(database.getAllSettings).mockRejectedValue(
        new Error('Database error'),
      );

      registerSettingsHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'get-settings')?.[1];

      const result = await handler!({} as any);

      expect(result).toEqual({});
      expect(consoleError).toHaveBeenCalledWith(
        'Error getting settings:',
        expect.any(Error),
      );
      consoleError.mockRestore();
    });
  });

  describe('get-setting handler', () => {
    it('should return a specific setting', async () => {
      vi.mocked(database.getSetting).mockResolvedValue('test-value');

      registerSettingsHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'get-setting')?.[1];

      const result = await handler!({} as any, 'test-key');

      expect(database.getSetting).toHaveBeenCalledWith('test-key');
      expect(result).toBe('test-value');
    });

    it('should return null on error', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      vi.mocked(database.getSetting).mockRejectedValue(
        new Error('Database error'),
      );

      registerSettingsHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'get-setting')?.[1];

      const result = await handler!({} as any, 'test-key');

      expect(result).toBeNull();
      consoleError.mockRestore();
    });
  });

  describe('save-setting handler', () => {
    it('should save a setting successfully', async () => {
      vi.mocked(database.saveSetting).mockResolvedValue();

      registerSettingsHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'save-setting')?.[1];

      const result = await handler!({} as any, 'test-key', 'test-value');

      expect(database.saveSetting).toHaveBeenCalledWith(
        'test-key',
        'test-value',
      );
      expect(result).toEqual({ success: true });
    });

    it('should return error on failure', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      vi.mocked(database.saveSetting).mockRejectedValue(
        new Error('Save failed'),
      );

      registerSettingsHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'save-setting')?.[1];

      const result = await handler!({} as any, 'test-key', 'test-value');

      expect(result).toEqual({ success: false, error: 'Save failed' });
      consoleError.mockRestore();
    });
  });

  describe('delete-setting handler', () => {
    it('should delete a setting successfully', async () => {
      vi.mocked(database.deleteSetting).mockResolvedValue();

      registerSettingsHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'delete-setting')?.[1];

      const result = await handler!({} as any, 'test-key');

      expect(database.deleteSetting).toHaveBeenCalledWith('test-key');
      expect(result).toEqual({ success: true });
    });

    it('should return error on failure', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      vi.mocked(database.deleteSetting).mockRejectedValue(
        new Error('Delete failed'),
      );

      registerSettingsHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'delete-setting')?.[1];

      const result = await handler!({} as any, 'test-key');

      expect(result).toEqual({ success: false, error: 'Delete failed' });
      consoleError.mockRestore();
    });
  });

  describe('get-webroot-path handler', () => {
    it('should return webroot path', async () => {
      vi.mocked(database.getWebrootPath).mockResolvedValue('/home/user/www');

      registerSettingsHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'get-webroot-path')?.[1];

      const result = await handler!({} as any);

      expect(database.getWebrootPath).toHaveBeenCalled();
      expect(result).toBe('/home/user/www');
    });

    it('should return default path on error', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      vi.mocked(database.getWebrootPath).mockRejectedValue(
        new Error('Database error'),
      );

      registerSettingsHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'get-webroot-path')?.[1];

      const result = await handler!({} as any);

      expect(typeof result).toBe('string');
      expect(result).toContain('www');
      consoleError.mockRestore();
    });
  });

  describe('get-xdebug-enabled-setting handler', () => {
    it('should return Xdebug enabled status', async () => {
      vi.mocked(database.getXdebugEnabledSetting).mockResolvedValue(true);

      registerSettingsHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find(
          (call) => call[0] === 'get-xdebug-enabled-setting',
        )?.[1];

      const result = await handler!({} as any);

      expect(database.getXdebugEnabledSetting).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      vi.mocked(database.getXdebugEnabledSetting).mockRejectedValue(
        new Error('Database error'),
      );

      registerSettingsHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find(
          (call) => call[0] === 'get-xdebug-enabled-setting',
        )?.[1];

      const result = await handler!({} as any);

      expect(result).toBe(false);
      consoleError.mockRestore();
    });
  });

  describe('pick-directory handler', () => {
    it('should return selected directory path', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['/selected/path'],
      } as any);

      registerSettingsHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'pick-directory')?.[1];

      const result = await handler!({} as any, '/default/path');

      expect(dialog.showOpenDialog).toHaveBeenCalledWith({
        properties: ['openDirectory'],
        defaultPath: '/default/path',
        title: 'Select Webroot Directory',
      });
      expect(result).toBe('/selected/path');
    });

    it('should return null when dialog is canceled', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: true,
        filePaths: [],
      } as any);

      registerSettingsHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'pick-directory')?.[1];

      const result = await handler!({} as any);

      expect(result).toBeNull();
    });

    it('should return null when no files selected', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: [],
      } as any);

      registerSettingsHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'pick-directory')?.[1];

      const result = await handler!({} as any);

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      vi.mocked(dialog.showOpenDialog).mockRejectedValue(
        new Error('Dialog error'),
      );

      registerSettingsHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'pick-directory')?.[1];

      const result = await handler!({} as any);

      expect(result).toBeNull();
      consoleError.mockRestore();
    });

    it('should use undefined defaultPath when not provided', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['/selected/path'],
      } as any);

      registerSettingsHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'pick-directory')?.[1];

      await handler!({} as any);

      expect(dialog.showOpenDialog).toHaveBeenCalledWith({
        properties: ['openDirectory'],
        defaultPath: undefined,
        title: 'Select Webroot Directory',
      });
    });
  });
});
