import { invoke } from '@tauri-apps/api/core';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SiteList from './index';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

vi.mock('./SiteItem', () => ({
  default: ({ site, onScan, onOpenWpCli, onEditSite }: any) => (
    <div data-testid={`site-item-${site.name}`}>
      {site.name}
      <button onClick={() => onScan(site)}>Scan</button>
      <button onClick={() => onOpenWpCli(site)}>CLI</button>
      <button onClick={() => onEditSite(site)}>Edit</button>
    </div>
  ),
}));

vi.mock('./CreateSiteModal', () => ({
  default: ({ isOpen, onClose, onSubmit }: any) =>
    isOpen ? (
      <div data-testid="create-modal">
        <button onClick={onClose}>Close Create</button>
        <button
          onClick={() =>
            onSubmit({
              domain: 'newsite.test',
              adminUser: 'admin',
              adminPass: 'pass',
              adminEmail: 'admin@test.com',
              phpVersion: '8.2',
              dbName: 'DB',
              multisite: false,
              multisiteType: 'subdirectory',
            })
          }
        >
          Submit Create
        </button>
      </div>
    ) : null,
}));

vi.mock('./EditSiteModal', () => ({
  default: ({ isOpen, onClose, onSubmit, onDelete, site }: any) =>
    isOpen ? (
      <div data-testid="edit-modal">
        <button onClick={onClose}>Close Edit</button>
        <button
          onClick={() => onSubmit(site, { aliases: 'alias', webRoot: 'root' })}
        >
          Submit Edit
        </button>
        <button onClick={() => onDelete(site)}>Delete</button>
      </div>
    ) : null,
}));

vi.mock('./WpCliModal', () => ({
  default: ({ isOpen, onClose }: any) =>
    isOpen ? (
      <div data-testid="cli-modal">
        <button onClick={onClose}>Close CLI</button>
      </div>
    ) : null,
}));

describe('SiteList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.confirm = vi.fn(() => true);
    global.alert = vi.fn();
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'get_sites') {
        return Promise.resolve([
          {
            id: '1',
            name: 'Site1.test',
            path: 'path1',
            url: 'url1',
            status: 'running',
          },
          {
            id: '2',
            name: 'Other.test',
            path: 'path2',
            url: 'url2',
            status: 'stopped',
          },
        ]);
      }
      if (cmd === 'create_site') return Promise.resolve();
      if (cmd === 'delete_site') return Promise.resolve();
      if (cmd === 'update_site') return Promise.resolve();
      if (cmd === 'scan_site_sonarqube')
        return Promise.resolve({ success: true });
      return Promise.resolve();
    });
  });

  const renderComponent = async () => {
    let component: any;
    await act(async () => {
      component = render(
        <Suspense fallback={<div>loading fallback</div>}>
          <SiteList />
        </Suspense>,
      );
    });
    return component;
  };

  it('renders correctly and loads sites', async () => {
    const component = await renderComponent();
    await waitFor(() => {
      expect(component.getByTestId('site-item-Site1.test')).toBeInTheDocument();
      expect(component.getByTestId('site-item-Other.test')).toBeInTheDocument();
    });
  });

  it('filters sites based on search query', async () => {
    const component = await renderComponent();
    await waitFor(() => {
      expect(component.getByTestId('site-item-Site1.test')).toBeInTheDocument();
    });

    const searchInput = component.getByPlaceholderText(
      'Search sites by name, path, or URL...',
    );
    fireEvent.change(searchInput, { target: { value: 'Other' } });

    await waitFor(() => {
      expect(
        component.queryByTestId('site-item-Site1.test'),
      ).not.toBeInTheDocument();
      expect(component.getByTestId('site-item-Other.test')).toBeInTheDocument();
    });

    fireEvent.click(component.getByTitle('Clear search'));
    await waitFor(() => {
      expect(component.getByTestId('site-item-Site1.test')).toBeInTheDocument();
    });
  });

  it('shows no sites found when search yields no results', async () => {
    const component = await renderComponent();
    await waitFor(() => {
      expect(component.getByTestId('site-item-Site1.test')).toBeInTheDocument();
    });

    const searchInput = component.getByPlaceholderText(
      'Search sites by name, path, or URL...',
    );
    fireEvent.change(searchInput, {
      target: { value: 'RandomStringThatMatchesNothing' },
    });

    await waitFor(() => {
      expect(component.getByText('No sites found')).toBeInTheDocument();
    });

    fireEvent.click(
      component.getByText('Clear search', { selector: 'button' }),
    );
    await waitFor(() => {
      expect(component.getByTestId('site-item-Site1.test')).toBeInTheDocument();
    });
  });

  it('opens and closes create modal, and submits form successfully', async () => {
    const component = await renderComponent();
    await waitFor(() => {
      expect(component.getByTitle('Create a new site')).toBeInTheDocument();
    });

    fireEvent.click(component.getByTitle('Create a new site'));
    expect(component.getByTestId('create-modal')).toBeInTheDocument();

    fireEvent.click(component.getByText('Submit Create'));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('create_site', expect.anything());
    });
  });

  it('handles create site failure gracefully', async () => {
    const component = await renderComponent();
    await waitFor(() => {
      expect(component.getByTitle('Create a new site')).toBeInTheDocument();
    });

    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'get_sites')
        return Promise.resolve([
          { id: '1', name: 'Site1.test', path: '', url: '' },
        ]);
      if (cmd === 'create_site')
        return Promise.reject(new Error('Provision failed'));
      return Promise.resolve();
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    fireEvent.click(component.getByTitle('Create a new site'));
    fireEvent.click(component.getByText('Submit Create'));

    await waitFor(() => {
      expect(global.alert).toHaveBeenCalledWith(
        expect.stringContaining(
          'Provisioning failed for newsite.test: Provision failed',
        ),
      );
    });
    consoleSpy.mockRestore();
  });

  it('can delete a site', async () => {
    const component = await renderComponent();
    await waitFor(() => {
      expect(component.getByTestId('site-item-Site1.test')).toBeInTheDocument();
    });

    const item = component.getByTestId('site-item-Site1.test');
    const editBtn = Array.from(item.querySelectorAll('button')).find(
      (b) => b.textContent === 'Edit',
    );
    fireEvent.click(editBtn!);

    await waitFor(() => {
      expect(component.getByTestId('edit-modal')).toBeInTheDocument();
    });

    fireEvent.click(component.getByText('Delete'));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('delete_site', {
        site: expect.objectContaining({ name: 'Site1.test' }),
      });
    });
  });

  it('can scan a site', async () => {
    const component = await renderComponent();
    await waitFor(() => {
      expect(component.getByTestId('site-item-Site1.test')).toBeInTheDocument();
    });

    const item = component.getByTestId('site-item-Site1.test');
    const scanBtn = Array.from(item.querySelectorAll('button')).find(
      (b) => b.textContent === 'Scan',
    );
    fireEvent.click(scanBtn!);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('scan_site_sonarqube', {
        site_name: 'Site1.test',
      });
      expect(global.alert).toHaveBeenCalledWith(
        expect.stringContaining('SonarQube scan initiated successfully'),
      );
    });
  });

  it('handles scan site failure', async () => {
    const component = await renderComponent();
    await waitFor(() => {
      expect(component.getByTestId('site-item-Site1.test')).toBeInTheDocument();
    });

    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'get_sites')
        return Promise.resolve([
          { id: '1', name: 'Site1.test', path: '', url: '' },
        ]);
      if (cmd === 'scan_site_sonarqube')
        return Promise.resolve({ success: false, error: 'Bad scan' });
      return Promise.resolve();
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const item = component.getByTestId('site-item-Site1.test');
    const scanBtn = Array.from(item.querySelectorAll('button')).find(
      (b) => b.textContent === 'Scan',
    );
    fireEvent.click(scanBtn!);

    await waitFor(() => {
      expect(global.alert).toHaveBeenCalledWith(
        expect.stringContaining('SonarQube scan failed'),
      );
    });
    consoleSpy.mockRestore();
  });

  it('handles scan site throw error', async () => {
    const component = await renderComponent();
    await waitFor(() => {
      expect(component.getByTestId('site-item-Site1.test')).toBeInTheDocument();
    });

    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'get_sites')
        return Promise.resolve([
          { id: '1', name: 'Site1.test', path: '', url: '' },
        ]);
      if (cmd === 'scan_site_sonarqube')
        return Promise.reject(new Error('Network error'));
      return Promise.resolve();
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const item = component.getByTestId('site-item-Site1.test');
    const scanBtn = Array.from(item.querySelectorAll('button')).find(
      (b) => b.textContent === 'Scan',
    );
    fireEvent.click(scanBtn!);

    await waitFor(() => {
      expect(global.alert).toHaveBeenCalledWith(
        'Failed to trigger SonarQube scan for Site1.test.',
      );
    });
    consoleSpy.mockRestore();
  });

  it('can open and close wp cli modal', async () => {
    const component = await renderComponent();
    await waitFor(() => {
      expect(component.getByTestId('site-item-Site1.test')).toBeInTheDocument();
    });

    const item = component.getByTestId('site-item-Site1.test');
    const cliBtn = Array.from(item.querySelectorAll('button')).find(
      (b) => b.textContent === 'CLI',
    );
    fireEvent.click(cliBtn!);

    await waitFor(() => {
      expect(component.getByTestId('cli-modal')).toBeInTheDocument();
    });

    fireEvent.click(component.getByText('Close CLI'));

    await waitFor(() => {
      expect(component.queryByTestId('cli-modal')).not.toBeInTheDocument();
    });
  });

  it('can open, update, and close edit site modal', async () => {
    const component = await renderComponent();
    await waitFor(() => {
      expect(component.getByTestId('site-item-Site1.test')).toBeInTheDocument();
    });

    const item = component.getByTestId('site-item-Site1.test');
    const editBtn = Array.from(item.querySelectorAll('button')).find(
      (b) => b.textContent === 'Edit',
    );
    fireEvent.click(editBtn!);

    await waitFor(() => {
      expect(component.getByTestId('edit-modal')).toBeInTheDocument();
    });

    fireEvent.click(component.getByText('Submit Edit'));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'update_site',
        expect.objectContaining({
          data: { aliases: 'alias', webRoot: 'root' },
        }),
      );
    });
  });

  it('tests scrollbar handler safely without throwing', async () => {
    const component = await renderComponent();
    await waitFor(() => {
      expect(component.getByTestId('site-item-Site1.test')).toBeInTheDocument();
    });

    const ul = document.querySelector('.overflow-y-auto');
    if (ul) {
      fireEvent.scroll(ul);
    }
  });

  it('handles delete site rejection', async () => {
    const component = await renderComponent();
    await waitFor(() => {
      expect(component.getByTestId('site-item-Site1.test')).toBeInTheDocument();
    });

    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'get_sites')
        return Promise.resolve([
          { id: '1', name: 'Site1.test', path: '', url: '' },
        ]);
      if (cmd === 'delete_site')
        return Promise.reject(new Error('Delete error'));
      return Promise.resolve();
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const item = component.getByTestId('site-item-Site1.test');
    const editBtn = Array.from(item.querySelectorAll('button')).find(
      (b) => b.textContent === 'Edit',
    );
    fireEvent.click(editBtn!);

    await waitFor(() => {
      expect(component.getByTestId('edit-modal')).toBeInTheDocument();
    });

    fireEvent.click(component.getByText('Delete'));

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to delete site:',
        expect.any(Error),
      );
    });
    consoleSpy.mockRestore();
  });

  it('handles update site rejection', async () => {
    const component = await renderComponent();
    await waitFor(() => {
      expect(component.getByTestId('site-item-Site1.test')).toBeInTheDocument();
    });

    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'get_sites')
        return Promise.resolve([
          { id: '1', name: 'Site1.test', path: '', url: '' },
        ]);
      if (cmd === 'update_site')
        return Promise.reject(new Error('Update error'));
      return Promise.resolve();
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const item = component.getByTestId('site-item-Site1.test');
    const editBtn = Array.from(item.querySelectorAll('button')).find(
      (b) => b.textContent === 'Edit',
    );
    fireEvent.click(editBtn!);

    await waitFor(() => {
      expect(component.getByTestId('edit-modal')).toBeInTheDocument();
    });

    fireEvent.click(component.getByText('Submit Edit'));

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to update site:',
        expect.any(Error),
      );
    });
    consoleSpy.mockRestore();
  });
});
