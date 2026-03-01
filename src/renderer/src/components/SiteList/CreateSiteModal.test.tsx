import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CreateSiteModal from './CreateSiteModal';

describe('CreateSiteModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSubmit: vi.fn(),
  };

  it('does not render when isOpen is false', () => {
    const { queryByText } = render(
      <CreateSiteModal {...defaultProps} isOpen={false} />,
    );
    expect(queryByText('Create New Site')).not.toBeInTheDocument();
  });

  it('renders form and handles submit with default values', () => {
    const { getByLabelText, getByText } = render(
      <CreateSiteModal {...defaultProps} />,
    );

    expect(getByText('Create New Site')).toBeInTheDocument();

    const domainInput = getByLabelText('Domain');
    fireEvent.change(domainInput, { target: { value: 'my-site' } });

    // Attempt submit
    fireEvent.click(getByText('Create'));

    expect(defaultProps.onSubmit).toHaveBeenCalledWith({
      domain: 'my-site.test',
      aliases: '',
      webRoot: '',
      multisite: {
        enabled: false,
        type: 'subdirectory',
      },
    });
  });

  it('handles filling all fields, formatting, and enabling multisite', () => {
    const { getByLabelText, getByText } = render(
      <CreateSiteModal {...defaultProps} />,
    );

    const domainInput = getByLabelText('Domain');
    fireEvent.change(domainInput, { target: { value: 'full-site.com' } });

    const aliasesInput = getByLabelText('Aliases (optional, space-separated)');
    fireEvent.change(aliasesInput, { target: { value: 'alias1.test alias2' } });

    const webRootInput = getByLabelText(
      'Web Root (optional, relative to site directory e.g. "public", "dist")',
    );
    fireEvent.change(webRootInput, { target: { value: '/public/' } });

    const multisiteCheck = getByLabelText('Enable WordPress Multisite');
    fireEvent.click(multisiteCheck);

    // Clicking subdomain
    const subdomainLabel = getByText('Subdomain');
    fireEvent.click(subdomainLabel);

    // Click subdirectory again to ensure it toggles
    const subdirectoryLabel = getByText('Subdirectory');
    fireEvent.click(subdirectoryLabel);

    fireEvent.click(getByText('Create'));

    expect(defaultProps.onSubmit).toHaveBeenCalledWith({
      domain: 'full-site.com',
      aliases: 'alias1.test alias2.test',
      webRoot: 'public', // stripped slashes
      multisite: {
        enabled: true,
        type: 'subdirectory',
      },
    });
  });

  it('handles close', () => {
    const { getByText } = render(<CreateSiteModal {...defaultProps} />);
    fireEvent.click(getByText('Cancel'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
