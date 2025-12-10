/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';

// Mock modules
const BrowserWindowMock = vi.fn();

class BrowserWindowConstructor {
  constructor(...args: any[]) {
    return BrowserWindowMock(...args);
  }
}
const shellMock = {
  openExternal: vi.fn(),
  openPath: vi.fn(),
};
const ipcMainMock = {
  handle: vi.fn(),
};
const appMock = {
  getAppPath: vi.fn(),
};
const dockerModuleMock = {
  startDockerCompose: vi.fn(),
};
const containerIpcModuleMock = {
  startContainerMonitoring: vi.fn(),
};
const xdebugIpcModuleMock = {
  registerXdebugHandlers: vi.fn(),
};
const wpCliIpcModuleMock = {
  registerWpCliHandlers: vi.fn(),
};

vi.mock('electron', () => ({
  BrowserWindow: BrowserWindowConstructor,
  shell: shellMock,
  ipcMain: ipcMainMock,
  app: appMock,
}));
vi.mock('./services/docker', () => dockerModuleMock);
vi.mock('./ipc/container', () => containerIpcModuleMock);
vi.mock('./ipc/xdebug', () => xdebugIpcModuleMock);
vi.mock('./ipc/wpCli', () => wpCliIpcModuleMock);
vi.mock('@electron-toolkit/utils', () => ({
  is: {
    dev: false,
  },
}));

const docker = await import('./services/docker');
const containerIpc = await import('./ipc/container');
const xdebugIpc = await import('./ipc/xdebug');
const wpCliIpc = await import('./ipc/wpCli');
const { createWindow } = await import('./window');

describe('Window Creation', () => {
  let mockWindow: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockWindow = {
      show: vi.fn(),
      on: vi.fn(),
      loadFile: vi.fn(),
      loadURL: vi.fn(),
      webContents: {
        setWindowOpenHandler: vi.fn(),
        on: vi.fn(),
        send: vi.fn(),
      },
    };

    BrowserWindowMock.mockImplementation(() => mockWindow as any);

    appMock.getAppPath.mockReturnValue('/app/path');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createWindow', () => {
    it('should create a browser window with correct configuration', () => {
      createWindow();

      expect(BrowserWindowMock).toHaveBeenCalledWith(
        expect.objectContaining({
          width: 1200,
          height: 800,
          minWidth: 800,
          minHeight: 600,
          show: false,
          autoHideMenuBar: true,
          titleBarStyle: 'default',
        }),
      );
    });

    it('should configure web preferences with security settings', () => {
      createWindow();

      expect(BrowserWindowMock).toHaveBeenCalledWith(
        expect.objectContaining({
          webPreferences: expect.objectContaining({
            sandbox: false,
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true,
            allowRunningInsecureContent: false,
            experimentalFeatures: false,
          }),
        }),
      );
    });

    it('should register IPC handlers for external links', () => {
      createWindow();

      expect(ipcMainMock.handle).toHaveBeenCalledWith(
        'open-external',
        expect.any(Function),
      );
    });

    it('should register IPC handler for directory opening', () => {
      createWindow();

      expect(ipcMainMock.handle).toHaveBeenCalledWith(
        'open-directory',
        expect.any(Function),
      );
    });

    it('should show window on ready-to-show event', () => {
      createWindow();

      const readyToShowHandler = mockWindow.on.mock.calls.find(
        (call: any) => call[0] === 'ready-to-show',
      )?.[1];

      expect(readyToShowHandler).toBeDefined();
      readyToShowHandler();
      expect(mockWindow.show).toHaveBeenCalled();
    });

    it('should set window open handler to open external links', () => {
      createWindow();

      expect(mockWindow.webContents.setWindowOpenHandler).toHaveBeenCalledWith(
        expect.any(Function),
      );

      const handler =
        mockWindow.webContents.setWindowOpenHandler.mock.calls[0][0];
      const result = handler({ url: 'https://example.com' });

      expect(shellMock.openExternal).toHaveBeenCalledWith(
        'https://example.com',
      );
      expect(result).toEqual({ action: 'deny' });
    });

    it('should start Docker compose on did-finish-load', async () => {
      (docker.startDockerCompose as Mock).mockResolvedValue(undefined);

      createWindow();

      const didFinishLoadHandler = mockWindow.webContents.on.mock.calls.find(
        (call: any) => call[0] === 'did-finish-load',
      )?.[1];

      expect(didFinishLoadHandler).toBeDefined();
      didFinishLoadHandler();

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(docker.startDockerCompose).toHaveBeenCalledWith(mockWindow);
    });

    it('should start container monitoring on did-finish-load', () => {
      createWindow();

      const didFinishLoadHandler = mockWindow.webContents.on.mock.calls.find(
        (call: any) => call[0] === 'did-finish-load',
      )?.[1];

      didFinishLoadHandler();

      expect(containerIpc.startContainerMonitoring).toHaveBeenCalledWith(
        mockWindow,
      );
    });

    it('should register Xdebug handlers on did-finish-load', () => {
      createWindow();

      const didFinishLoadHandler = mockWindow.webContents.on.mock.calls.find(
        (call: any) => call[0] === 'did-finish-load',
      )?.[1];

      didFinishLoadHandler();

      expect(xdebugIpc.registerXdebugHandlers).toHaveBeenCalledWith(mockWindow);
    });

    it('should register WP-CLI handlers on did-finish-load', () => {
      createWindow();

      const didFinishLoadHandler = mockWindow.webContents.on.mock.calls.find(
        (call: any) => call[0] === 'did-finish-load',
      )?.[1];

      didFinishLoadHandler();

      expect(wpCliIpc.registerWpCliHandlers).toHaveBeenCalled();
    });

    it('should handle Docker compose errors gracefully', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      (docker.startDockerCompose as Mock).mockRejectedValue(
        new Error('Docker failed'),
      );

      createWindow();

      const didFinishLoadHandler = mockWindow.webContents.on.mock.calls.find(
        (call: any) => call[0] === 'did-finish-load',
      )?.[1];

      didFinishLoadHandler();

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(consoleError).toHaveBeenCalledWith(
        'Docker compose failed:',
        expect.any(Error),
      );
      consoleError.mockRestore();
    });

    it('should load file in production mode', () => {
      createWindow();

      expect(mockWindow.loadFile).toHaveBeenCalledWith(
        expect.stringContaining('renderer/index.html'),
      );
    });

    it('should return the created window', () => {
      const window = createWindow();

      expect(window).toBe(mockWindow);
    });
  });

  describe('IPC Handlers', () => {
    it('should handle open-external requests', async () => {
      shellMock.openExternal.mockResolvedValue(undefined);

      createWindow();

      const handler = ipcMainMock.handle.mock.calls.find(
        (call) => call[0] === 'open-external',
      )?.[1];

      expect(handler).toBeDefined();
      const result = await handler!({} as any, 'https://example.com');

      expect(shellMock.openExternal).toHaveBeenCalledWith(
        'https://example.com',
      );
      expect(result).toBe(true);
    });

    it('should handle open-directory requests successfully', async () => {
      appMock.getAppPath.mockReturnValue('/app');
      shellMock.openPath.mockResolvedValue('');

      createWindow();

      const handler = ipcMainMock.handle.mock.calls.find(
        (call) => call[0] === 'open-directory',
      )?.[1];

      expect(handler).toBeDefined();
      const result = await handler!({} as any, 'www');

      expect(shellMock.openPath).toHaveBeenCalledWith('/app/www');
      expect(result).toBe(true);
    });

    it('should handle open-directory errors', async () => {
      appMock.getAppPath.mockReturnValue('/app');
      shellMock.openPath.mockResolvedValue('Error opening path');

      createWindow();

      const handler = ipcMainMock.handle.mock.calls.find(
        (call) => call[0] === 'open-directory',
      )?.[1];

      await expect(handler!({} as any, 'www')).rejects.toThrow(
        'Failed to open directory',
      );
    });
  });
});
