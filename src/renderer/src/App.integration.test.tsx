import * as tauriEvent from '@tauri-apps/api/event';
import { clearMocks, mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './components/App';

// We mock the tauri event plugin listener to prevent errors during component unmount
// because mockIPC doesn't easily emulate the backend event emitting loop by default.
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
  emit: vi.fn(),
}));

describe('App Integration with Tauri API mocks', () => {
  let invokedCommands: string[] = [];

  beforeEach(() => {
    invokedCommands = [];

    // Return a dummy unlisten function when components call listen
    (tauriEvent.listen as any).mockResolvedValue(() => {});

    mockWindows('main');
    mockIPC((cmd, args) => {
      invokedCommands.push(cmd);

      switch (cmd) {
        case 'get_sites':
          return [
            {
              id: 'site-1',
              name: 'Integration Site',
              domain: 'integration.test',
              path: '/var/www',
              phpVersion: '8.2',
            },
          ];
        case 'get_container_status':
          return [
            { id: '1', name: 'devwp_nginx', state: 'running', version: '1.2' },
            { id: '2', name: 'devwp_php', state: 'running', version: '8.2' },
          ];
        case 'get_xdebug_status':
          return { success: true, enabled: true };
        case 'toggle_xdebug':
          return { success: true, enabled: false };
        case 'get_log_dir':
          return '/var/log/devwp';
        case 'get_webroot_path':
          return '/var/www/html';
        case 'pick_directory':
          return '/selected/path';
        case 'get_update_ready':
          return true;
        case 'scan_site_sonarqube':
          return { success: true, url: 'http://localhost:9000/dashboard' };
        case 'restart_container':
        case 'run_wp_cli':
        case 'open_directory':
        case 'open_external':
        case 'create_site':
        case 'delete_site':
        case 'update_site':
          return { success: true };
        case 'plugin:event|listen':
          return Promise.resolve(Math.random());
        default:
          return null;
      }
    });
  });

  afterEach(() => {
    clearMocks();
    vi.restoreAllMocks();
  });

  it('loads and displays initial components via mockIPC', async () => {
    render(<App />);

    // Check if the site appears from API
    await waitFor(
      () => {
        expect(screen.getByText('Integration Site')).toBeInTheDocument();
      },
      { timeout: 2000 },
    );

    // Verify basic initial commands were called
    expect(invokedCommands).toContain('get_sites');
    expect(invokedCommands).toContain('get_container_status');
    expect(invokedCommands).toContain('get_xdebug_status');
  });

  it('handles mocked interactions successfully', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Check settings mock triggers
    await waitFor(() => {
      expect(screen.getByTitle('Settings')).toBeInTheDocument();
    });

    const settingsBtn = screen.getByTitle('Settings');
    await user.click(settingsBtn);

    // App lazy loads settings modal, so wait for it and specific path element
    await waitFor(() => {
      expect(invokedCommands).toContain('get_webroot_path');
    });
  });
});
