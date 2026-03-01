import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EditSiteModal from './EditSiteModal';

describe('EditSiteModal', () => {
  const mockSite = {
    id: '1',
    name: 'test-site',
    domain: 'test-site.test',
    path: '/path/to/site',
    phpVersion: '8.1',
    status: 'running',
    isMultisite: false,
    aliases: 'old.test',
  };

  const defaultProps = {
    isOpen: true,
    site: mockSite as any,
    onClose: vi.fn(),
    onSubmit: vi.fn(),
    onDelete: vi.fn(),
  };

  it('renders and displays site data', () => {
    const { getByText, getByDisplayValue } = render(
      <EditSiteModal {...defaultProps} />,
    );
    expect(getByText('Edit Site Settings')).toBeInTheDocument();
    expect(getByText('test-site')).toBeInTheDocument();
    expect(getByDisplayValue('old.test')).toBeInTheDocument();
  });

  it('submits new data', () => {
    const { getByLabelText, getByText } = render(
      <EditSiteModal {...defaultProps} />,
    );
    const input = getByLabelText('Aliases (optional, space-separated)');

    fireEvent.change(input, { target: { value: 'updated.test' } });
    fireEvent.click(getByText('Save Changes'));

    expect(defaultProps.onSubmit).toHaveBeenCalledWith(
      mockSite,
      expect.objectContaining({
        aliases: 'updated.test',
      }),
    );
  });

  it('handles delete site', async () => {
    const { getByText } = render(<EditSiteModal {...defaultProps} />);
    fireEvent.click(getByText('Delete Site'));

    expect(defaultProps.onDelete).toHaveBeenCalledWith(mockSite);
  });
});
