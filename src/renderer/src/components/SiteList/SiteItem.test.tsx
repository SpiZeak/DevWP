import { invoke } from '@tauri-apps/api/core';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

  const defaultProps = {
    site: mockSite as any,
    isLast: false,
    onOpenUrl: vi.fn(),
    onScan: vi.fn(),
    onOpenWpCli: vi.fn(),
    onEditSite: vi.fn(),
    scanningSite: null,
  };

  it('renders site details', () => {
    const { getByText } = render(<SiteItem {...defaultProps} />);
    expect(getByText('test-site')).toBeInTheDocument();
    expect(getByText('/path/to/site')).toBeInTheDocument();
  });

  it('calls onOpenUrl when url button clicked', () => {
    const { getByTitle } = render(<SiteItem {...defaultProps} />);
    fireEvent.click(getByTitle('Open Site'));
    expect(defaultProps.onOpenUrl).toHaveBeenCalledWith(
      'http://test-site.test',
    );
  });

  it('calls invoke for open directory when folder button clicked', () => {
    const { getByTitle } = render(<SiteItem {...defaultProps} />);
    fireEvent.click(getByTitle('Open folder in file manager'));
    expect(invoke).toHaveBeenCalledWith('open_directory', {
      path: '/path/to/site',
    });
  });

  it('calls onOpenWpCli when terminal button clicked', () => {
    const { getByTitle } = render(<SiteItem {...defaultProps} />);
    fireEvent.click(getByTitle('Run WP-CLI Command'));
    expect(defaultProps.onOpenWpCli).toHaveBeenCalledWith(mockSite);
  });

  it('calls onEditSite when edit button clicked', () => {
    const { getByTitle } = render(<SiteItem {...defaultProps} />);
    fireEvent.click(getByTitle('Edit Site Settings'));
    expect(defaultProps.onEditSite).toHaveBeenCalledWith(mockSite);
  });
});
