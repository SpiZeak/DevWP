import { join } from 'node:path';
import { app, type IpcMainInvokeEvent, ipcMain } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerAppInfoHandlers } from './appInfo';

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
  app: {
    getVersion: vi.fn().mockReturnValue('1.2.3'),
    getPath: vi.fn().mockReturnValue('/tmp/devwp-userdata'),
  },
}));

describe('App Info IPC Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers the get-app-version handler', () => {
    registerAppInfoHandlers();

    expect(ipcMain.handle).toHaveBeenCalledWith(
      'get-app-version',
      expect.any(Function),
    );
  });

  it('returns the application version when invoked', async () => {
    registerAppInfoHandlers();

    const handleMock = ipcMain.handle as ReturnType<typeof vi.fn>;
    const handler = handleMock.mock.calls.find(
      (call) => call[0] === 'get-app-version',
    )?.[1];

    const result = await handler?.({} as IpcMainInvokeEvent);

    expect(app.getVersion).toHaveBeenCalled();
    expect(result).toBe('1.2.3');
  });

  it('registers the get-log-dir handler', () => {
    registerAppInfoHandlers();

    expect(ipcMain.handle).toHaveBeenCalledWith(
      'get-log-dir',
      expect.any(Function),
    );
  });

  it('returns the log directory when invoked', async () => {
    registerAppInfoHandlers();

    const handleMock = ipcMain.handle as ReturnType<typeof vi.fn>;
    const handler = handleMock.mock.calls.find(
      (call) => call[0] === 'get-log-dir',
    )?.[1];

    const result = await handler?.({} as IpcMainInvokeEvent);

    expect(app.getPath).toHaveBeenCalledWith('userData');
    expect(result).toBe(join('/tmp/devwp-userdata', 'logs'));
  });
});
