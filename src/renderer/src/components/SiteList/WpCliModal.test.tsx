import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { act, fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WpCliModal from './WpCliModal';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

describe('WpCliModal', () => {
  const mockSite = {
    id: '1',
    name: 'test-site',
    domain: 'test-site.test',
  };

  const defaultProps = {
    isOpen: true,
    site: mockSite as any,
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    const { queryByText } = render(
      <WpCliModal {...defaultProps} isOpen={false} />,
    );
    expect(queryByText('Run WP-CLI Command for')).not.toBeInTheDocument();
  });

  it('renders correctly and handles input', async () => {
    (listen as any).mockResolvedValue(vi.fn());

    let component: any;
    await act(async () => {
      component = render(<WpCliModal {...defaultProps} />);
    });

    expect(component.getByText('test-site')).toBeInTheDocument();

    const input = component.getByPlaceholderText('e.g. plugin list');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'plugin list' } });
    });

    expect(input.value).toBe('plugin list');

    await act(async () => {
      fireEvent.click(component.getByText('Run'));
    });

    expect(invoke).toHaveBeenCalledWith('run_wp_cli', {
      request: {
        site: mockSite,
        command: 'plugin list',
      },
    });
  });

  it('closes properly', async () => {
    (listen as any).mockResolvedValue(vi.fn());

    let component: any;
    await act(async () => {
      component = render(<WpCliModal {...defaultProps} />);
    });

    await act(async () => {
      fireEvent.click(component.getByText('Cancel'));
    });

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('shows output and errors from invoke response', async () => {
    (listen as any).mockResolvedValue(vi.fn());
    (invoke as any).mockResolvedValue({
      success: true,
      output: 'Plugin list output',
      error: 'Some warning',
    });

    let component: any;
    await act(async () => {
      component = render(<WpCliModal {...defaultProps} />);
    });

    const input = component.getByPlaceholderText('e.g. plugin list');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'plugin list' } });
    });

    await act(async () => {
      fireEvent.click(component.getByText('Run'));
    });

    expect(
      component.getByText('Plugin list output', { exact: false }),
    ).toBeInTheDocument();
    expect(
      component.getByText('Some warning', { exact: false }),
    ).toBeInTheDocument();
  });

  it('handles invoke throwing an error', async () => {
    (listen as any).mockResolvedValue(vi.fn());
    (invoke as any).mockRejectedValue(new Error('Invoke failed!'));

    let component: any;
    await act(async () => {
      component = render(<WpCliModal {...defaultProps} />);
    });

    const input = component.getByPlaceholderText('e.g. plugin list');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'bad command' } });
    });

    await act(async () => {
      fireEvent.click(component.getByText('Run'));
    });

    // Check if error message is displayed
    expect(
      component.getByText('Error: Invoke failed!', { exact: false }),
    ).toBeInTheDocument();
  });
});
