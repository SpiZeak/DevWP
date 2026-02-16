import type { Site } from '@renderer/env';
import { act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '../../test/test-utils';
import SiteList from './index';

vi.mock('./SiteItem', () => ({
  default: ({
    site,
    onScan,
    onOpenUrl,
    onOpenWpCli,
    onEditSite,
    scanningSite,
  }: {
    site: Site;
    onScan: (site: Site) => void;
    onOpenUrl: (url: string) => void;
    onOpenWpCli: (site: Site) => void;
    onEditSite: (site: Site) => void;
    scanningSite: string | null;
  }) => (
    <li data-testid={`site-item-${site.name}`}>
      <span>{site.name}</span>
      <button type="button" onClick={() => onScan(site)}>
        Scan {site.name}
      </button>
      <button type="button" onClick={() => onOpenUrl(site.url)}>
        Open {site.name}
      </button>
      <button type="button" onClick={() => onOpenWpCli(site)}>
        WP-CLI {site.name}
      </button>
      <button type="button" onClick={() => onEditSite(site)}>
        Edit {site.name}
      </button>
      <span>{scanningSite === site.name ? 'scanning' : 'idle'}</span>
    </li>
  ),
}));

describe('SiteList', () => {
  const baseSites: Site[] = [
    {
      name: 'alpha.test',
      path: '/www/alpha.test',
      url: 'https://alpha.test',
      status: 'active',
    },
    {
      name: 'beta.test',
      path: '/www/beta.test',
      url: 'https://beta.test',
      status: 'active',
    },
  ];

  const mockGetSites = vi.fn<() => Promise<Site[]>>();
  const mockCreateSite = vi.fn();
  const mockDeleteSite = vi.fn();
  const mockUpdateSite = vi.fn();
  const mockInvoke = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetSites.mockResolvedValue(baseSites);
    mockCreateSite.mockResolvedValue(undefined);
    mockDeleteSite.mockResolvedValue(undefined);
    mockUpdateSite.mockResolvedValue(undefined);
    mockInvoke.mockResolvedValue({ success: true });

    globalThis.alert = vi.fn();
    globalThis.confirm = vi.fn(() => true);

    window.electronAPI = {
      getSites: mockGetSites,
      createSite: mockCreateSite,
      deleteSite: mockDeleteSite,
      updateSite: mockUpdateSite,
      onWpCliStream: vi.fn(() => vi.fn()),
      onDockerStatus: vi.fn(() => vi.fn()),
      onContainerStatus: vi.fn(() => vi.fn()),
      onNotification: vi.fn(() => vi.fn()),
      getContainerStatus: vi.fn(),
      restartContainer: vi.fn(),
      getSettings: vi.fn(),
      getSetting: vi.fn(),
      saveSetting: vi.fn(),
      deleteSetting: vi.fn(),
      getWebrootPath: vi.fn(),
      getXdebugEnabledSetting: vi.fn(),
      getXdebugStatus: vi.fn(),
      toggleXdebug: vi.fn(),
      onXdebugStatus: vi.fn(() => vi.fn()),
      pickDirectory: vi.fn(),
      getLogDir: vi.fn(),
      getAppVersion: vi.fn(),
    } as unknown as typeof window.electronAPI;

    window.electron = {
      ipcRenderer: {
        invoke: mockInvoke,
      },
    } as unknown as typeof window.electron;

    window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
      cb(0);
      return 1;
    };
  });

  it('loads and displays sites from getSites', async () => {
    renderWithProviders(<SiteList />);

    expect(await screen.findByText('alpha.test')).toBeInTheDocument();
    expect(screen.getByText('beta.test')).toBeInTheDocument();
    expect(mockGetSites).toHaveBeenCalledTimes(1);
  });

  it('shows loading state while fetching sites', async () => {
    let resolveSites: ((value: Site[]) => void) | null = null;
    const pendingSites = new Promise<Site[]>((resolve) => {
      resolveSites = resolve;
    });
    mockGetSites.mockReturnValueOnce(pendingSites);

    renderWithProviders(<SiteList />);

    expect(await screen.findByText('Loading sites...')).toBeInTheDocument();

    await act(async () => {
      resolveSites?.(baseSites);
      await pendingSites;
    });

    expect(await screen.findByText('alpha.test')).toBeInTheDocument();
  });

  it('handles fetch sites errors gracefully', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    mockGetSites.mockRejectedValueOnce(new Error('Fetch failed'));

    renderWithProviders(<SiteList />);

    expect(await screen.findByText('No sites yet')).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to fetch sites:',
      expect.any(Error),
    );

    consoleError.mockRestore();
  });

  it('shows empty state when no sites exist', async () => {
    mockGetSites.mockResolvedValueOnce([]);
    renderWithProviders(<SiteList />);

    expect(await screen.findByText('No sites yet')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Create your first WordPress development site to get started',
      ),
    ).toBeInTheDocument();
  });

  it('filters sites by search query and clears search', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SiteList />);

    await screen.findByText('alpha.test');
    const search = screen.getByPlaceholderText(
      'Search sites by name, path, or URL...',
    );

    await user.type(search, 'gamma');

    expect(screen.getByText('No sites found')).toBeInTheDocument();
    expect(screen.getByText('Clear search')).toBeInTheDocument();

    await user.click(screen.getByText('Clear search'));
    expect(screen.getByText('alpha.test')).toBeInTheDocument();
    expect(screen.getByText('beta.test')).toBeInTheDocument();
  });

  it('submits create site and refreshes list', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SiteList />);

    await screen.findByText('alpha.test');

    await user.click(screen.getByTitle('Create a new site'));
    expect(await screen.findByText('Create New Site')).toBeInTheDocument();

    const domainInput = screen.getByLabelText('Domain');
    await user.clear(domainInput);
    await user.type(domainInput, 'newsite');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockCreateSite).toHaveBeenCalledWith(
        expect.objectContaining({ domain: 'newsite.test' }),
      );
    });

    await waitFor(() => {
      expect(mockGetSites).toHaveBeenCalledTimes(2);
    });
  });

  it('alerts when create site fails', async () => {
    const user = userEvent.setup();
    mockCreateSite.mockRejectedValueOnce(new Error('Create failed'));

    renderWithProviders(<SiteList />);
    await screen.findByText('alpha.test');

    await user.click(screen.getByTitle('Create a new site'));
    await user.click(await screen.findByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(alert).toHaveBeenCalledWith(
        'Provisioning failed for example.test: Create failed',
      );
    });
  });

  it('alerts success when SonarQube scan starts successfully', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true });

    renderWithProviders(<SiteList />);
    await screen.findByText('alpha.test');

    await user.click(screen.getByRole('button', { name: 'Scan alpha.test' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'scan-site-sonarqube',
        'alpha.test',
      );
      expect(alert).toHaveBeenCalledWith(
        'SonarQube scan initiated successfully for alpha.test. Check SonarQube UI for progress.',
      );
    });
  });

  it('alerts failure when SonarQube scan returns error', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: false, error: 'Scan failed' });

    renderWithProviders(<SiteList />);
    await screen.findByText('alpha.test');

    await user.click(screen.getByRole('button', { name: 'Scan alpha.test' }));

    await waitFor(() => {
      expect(alert).toHaveBeenCalledWith(
        'SonarQube scan failed for alpha.test: Scan failed',
      );
    });
  });

  it('alerts failure when SonarQube scan throws', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValueOnce(new Error('IPC failure'));

    renderWithProviders(<SiteList />);
    await screen.findByText('alpha.test');

    await user.click(screen.getByRole('button', { name: 'Scan alpha.test' }));

    await waitFor(() => {
      expect(alert).toHaveBeenCalledWith(
        'Failed to trigger SonarQube scan for alpha.test.',
      );
    });
  });

  it('opens site URL through ipcRenderer', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SiteList />);

    await screen.findByText('alpha.test');
    await user.click(screen.getByRole('button', { name: 'Open alpha.test' }));

    expect(mockInvoke).toHaveBeenCalledWith(
      'open-external',
      'https://alpha.test',
    );
  });

  it('opens and closes WP-CLI modal', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SiteList />);

    await screen.findByText('alpha.test');
    await user.click(screen.getByRole('button', { name: 'WP-CLI alpha.test' }));

    expect(
      await screen.findByText('Run WP-CLI Command for', { exact: false }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(
        screen.queryByText('Run WP-CLI Command for', { exact: false }),
      ).not.toBeInTheDocument();
    });
  });

  it('updates site from edit modal and refreshes list', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SiteList />);

    await screen.findByText('alpha.test');
    await user.click(screen.getByRole('button', { name: 'Edit alpha.test' }));

    expect(await screen.findByText('Edit Site Settings')).toBeInTheDocument();

    const aliasesInput = screen.getByLabelText(
      'Aliases (optional, space-separated)',
    );
    const webRootInput = screen.getByLabelText(
      'Web Root (optional, relative to site directory e.g. "public", "dist")',
    );

    await user.clear(aliasesInput);
    await user.type(aliasesInput, 'www.alpha.test');
    await user.clear(webRootInput);
    await user.type(webRootInput, '/public/');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(mockUpdateSite).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'alpha.test' }),
        expect.objectContaining({
          aliases: 'www.alpha.test',
          webRoot: 'public',
        }),
      );
    });

    await waitFor(() => {
      expect(mockGetSites).toHaveBeenCalledTimes(2);
    });
  });

  it('deletes site from edit modal after confirmation', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SiteList />);

    await screen.findByText('alpha.test');
    await user.click(screen.getByRole('button', { name: 'Edit alpha.test' }));

    await user.click(
      await screen.findByRole('button', { name: 'Delete Site' }),
    );

    await waitFor(() => {
      expect(confirm).toHaveBeenCalledWith(
        'Are you sure you want to delete the site alpha.test?',
      );
      expect(mockDeleteSite).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'alpha.test' }),
      );
    });

    await waitFor(() => {
      expect(mockGetSites).toHaveBeenCalledTimes(2);
    });
  });

  it('does not delete site when confirmation is cancelled', async () => {
    const user = userEvent.setup();
    globalThis.confirm = vi.fn(() => false);

    renderWithProviders(<SiteList />);
    await screen.findByText('alpha.test');
    await user.click(screen.getByRole('button', { name: 'Edit alpha.test' }));

    await user.click(
      await screen.findByRole('button', { name: 'Delete Site' }),
    );

    expect(mockDeleteSite).not.toHaveBeenCalled();
  });

  it('prevents concurrent scans while one is in progress', async () => {
    const user = userEvent.setup();
    let resolveScan: ((value: { success: boolean }) => void) | null = null;
    const pendingScan = new Promise<{ success: boolean }>((resolve) => {
      resolveScan = resolve;
    });
    mockInvoke.mockReturnValueOnce(pendingScan);

    renderWithProviders(<SiteList />);
    await screen.findByText('alpha.test');

    await user.click(screen.getByRole('button', { name: 'Scan alpha.test' }));
    await user.click(screen.getByRole('button', { name: 'Scan beta.test' }));

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith(
      'scan-site-sonarqube',
      'alpha.test',
    );

    await act(async () => {
      resolveScan?.({ success: true });
      await pendingScan;
    });
  });
});
