import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeTauriBridge } from './tauriBridge';

const { mockInvoke, mockGetVersion, mockListen } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockGetVersion: vi.fn(),
  mockListen: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: mockGetVersion,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: mockListen,
}));

describe('initializeTauriBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetVersion.mockResolvedValue('0.1.1');
    mockInvoke.mockResolvedValue(undefined);
    mockListen.mockResolvedValue(() => undefined);
  });

  it('maps legacy invoke channels to Tauri commands', async () => {
    initializeTauriBridge();

    await window.electron.ipcRenderer.invoke(
      'open-external',
      'https://example.test',
    );

    expect(mockInvoke).toHaveBeenCalledWith('open_external', {
      url: 'https://example.test',
    });
  });

  it('maps scan channel args to snake_case command params', async () => {
    initializeTauriBridge();

    await window.electron.ipcRenderer.invoke(
      'scan-site-sonarqube',
      'alpha.test',
    );

    expect(mockInvoke).toHaveBeenCalledWith('scan_site_sonarqube', {
      site_name: 'alpha.test',
    });
  });

  it('exposes app version through Tauri API', async () => {
    initializeTauriBridge();

    await expect(window.electronAPI.getAppVersion()).resolves.toBe('0.1.1');
    expect(mockGetVersion).toHaveBeenCalled();
  });

  it('maps restartContainer API args to snake_case command params', async () => {
    initializeTauriBridge();

    await window.electronAPI.restartContainer('container-id');

    expect(mockInvoke).toHaveBeenCalledWith('restart_container', {
      container_id: 'container-id',
    });
  });
});
