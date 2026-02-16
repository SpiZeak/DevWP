import { join } from 'node:path';
import { app, type IpcMainInvokeEvent, ipcMain } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerAppInfoHandlers } from './appInfo';

const mockIsUpdateReadyToInstall = vi.fn().mockReturnValue(false);
const mockInstallDownloadedUpdate = vi.fn().mockReturnValue({
  success: false,
  message: 'No downloaded update is ready to install.',
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
  app: {
    getVersion: vi.fn().mockReturnValue('1.2.3'),
    getPath: vi.fn().mockReturnValue('/tmp/devwp-userdata'),
  },
}));

vi.mock('../services/updates', () => ({
  isUpdateReadyToInstall: mockIsUpdateReadyToInstall,
  installDownloadedUpdate: mockInstallDownloadedUpdate,
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

  it('registers the get-update-ready handler', () => {
    registerAppInfoHandlers();

    expect(ipcMain.handle).toHaveBeenCalledWith(
      'get-update-ready',
      expect.any(Function),
    );
  });

  it('returns update ready status when invoked', async () => {
    mockIsUpdateReadyToInstall.mockReturnValue(true);
    registerAppInfoHandlers();

    const handleMock = ipcMain.handle as ReturnType<typeof vi.fn>;
    const handler = handleMock.mock.calls.find(
      (call) => call[0] === 'get-update-ready',
    )?.[1];

    const result = await handler?.({} as IpcMainInvokeEvent);

    expect(mockIsUpdateReadyToInstall).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('registers the install-update-now handler', () => {
    registerAppInfoHandlers();

    expect(ipcMain.handle).toHaveBeenCalledWith(
      'install-update-now',
      expect.any(Function),
    );
  });

  it('invokes install update when requested', async () => {
    const installResult = {
      success: true,
      message: 'Installing update and restarting DevWP...',
    };
    mockInstallDownloadedUpdate.mockReturnValue(installResult);
    registerAppInfoHandlers();

    const handleMock = ipcMain.handle as ReturnType<typeof vi.fn>;
    const handler = handleMock.mock.calls.find(
      (call) => call[0] === 'install-update-now',
    )?.[1];

    const result = await handler?.({} as IpcMainInvokeEvent);

    expect(mockInstallDownloadedUpdate).toHaveBeenCalled();
    expect(result).toEqual(installResult);
  });
});
