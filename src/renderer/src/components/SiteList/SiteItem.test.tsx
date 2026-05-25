import { invoke } from '@tauri-apps/api/core';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SiteActionProvider } from './SiteActionContext';
import SiteItem from './SiteItem';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('SiteItem', () => {
  const mockSite = {
    id: '1',
    name: 'test-site',
    domain: 'test-site.test',
    path: '/path/to/site',
    url: 'http://test-site.test',
    status: 'running',
  };

  const defaultActions = {
    onOpenUrl: vi.fn(),
    onScan: vi.fn(),
    onComposerUpdate: vi.fn(),
    onOpenWpCli: vi.fn(),
    onEditSite: vi.fn(),
    scanningSite: null,
  };

  const renderWithContext = (site = mockSite, isLast = false, actions = defaultActions) =>
    render(
      <SiteActionProvider value={actions as any}>
        <SiteItem site={site as any} isLast={isLast} />
      </SiteActionProvider>,
    );

  it('renders site details', () => {
    const { getByText } = renderWithContext();
    expect(getByText('test-site')).toBeInTheDocument();
    expect(getByText('/path/to/site')).toBeInTheDocument();
  });

  it('calls onOpenUrl when url button clicked', () => {
    const { getByTitle } = renderWithContext();
    fireEvent.click(getByTitle('Open Site'));
    expect(defaultActions.onOpenUrl).toHaveBeenCalledWith(
      'http://test-site.test',
    );
  });

  it('calls invoke for open directory when folder button clicked', () => {
    const { getByTitle } = renderWithContext();
    fireEvent.click(getByTitle('Open folder in file manager'));
    expect(invoke).toHaveBeenCalledWith('open_directory', {
      path: '/path/to/site',
    });
  });

  it('calls onOpenWpCli when terminal button clicked', () => {
    const { getByTitle } = renderWithContext();
    fireEvent.click(getByTitle('Run WP-CLI Command'));
    expect(defaultActions.onOpenWpCli).toHaveBeenCalledWith(mockSite);
  });

  it('calls onEditSite when edit button clicked', () => {
    const { getByTitle } = renderWithContext();
    fireEvent.click(getByTitle('Edit Site Settings'));
    expect(defaultActions.onEditSite).toHaveBeenCalledWith(mockSite);
  });
});
