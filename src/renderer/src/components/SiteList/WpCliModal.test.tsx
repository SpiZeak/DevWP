import type { Site } from '@renderer/env';
import { act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '../../test/test-utils';
import WpCliModal from './WpCliModal';

describe('WpCliModal', () => {
  const site: Site = {
    name: 'alpha.test',
    path: '/www/alpha.test',
    url: 'https://alpha.test',
    status: 'active',
  };

  const mockOnClose = vi.fn();
  const mockInvoke = vi.fn();
  const mockOnWpCliStream = vi.fn();
  const mockRemoveListener = vi.fn();

  let streamCallback:
    | ((data: {
        type: 'stdout' | 'stderr' | 'complete' | 'error';
        data?: string;
        error?: string;
        siteId?: string;
      }) => void)
    | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    streamCallback = null;

    mockInvoke.mockResolvedValue(undefined);
    mockOnWpCliStream.mockImplementation((cb) => {
      streamCallback = cb;
      return mockRemoveListener;
    });

    window.electronAPI = {
      onWpCliStream: mockOnWpCliStream,
    } as unknown as typeof window.electronAPI;

    window.electron = {
      ipcRenderer: {
        invoke: mockInvoke,
      },
    } as unknown as typeof window.electron;
  });

  it('renders nothing when closed', () => {
    const { container } = renderWithProviders(
      <WpCliModal isOpen={false} site={site} onClose={mockOnClose} />,
    );

    expect(container.firstChild).toBeNull();
    expect(mockOnWpCliStream).not.toHaveBeenCalled();
  });

  it('registers and cleans up stream listener when open', () => {
    const { unmount } = renderWithProviders(
      <WpCliModal isOpen site={site} onClose={mockOnClose} />,
    );

    expect(mockOnWpCliStream).toHaveBeenCalledTimes(1);
    expect(mockOnWpCliStream).toHaveBeenCalledWith(expect.any(Function));

    unmount();
    expect(mockRemoveListener).toHaveBeenCalledTimes(1);
  });

  it('submits command and invokes run-wp-cli', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <WpCliModal isOpen site={site} onClose={mockOnClose} />,
    );

    const input = screen.getByPlaceholderText('e.g. plugin list');
    await user.type(input, 'plugin list');
    await user.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('run-wp-cli', {
        site,
        command: 'plugin list',
      });
    });

    expect(screen.getByRole('button', { name: 'Running...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
  });

  it('handles stdout, stderr, complete stream events for matching site', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <WpCliModal isOpen site={site} onClose={mockOnClose} />,
    );

    await user.type(
      screen.getByPlaceholderText('e.g. plugin list'),
      'plugin list',
    );
    await user.click(screen.getByRole('button', { name: 'Run' }));

    await act(async () => {
      streamCallback?.({ type: 'stdout', data: 'ok\n', siteId: 'alpha.test' });
      streamCallback?.({
        type: 'stderr',
        data: 'warn\n',
        siteId: 'alpha.test',
      });
    });

    expect(
      await screen.findByText('Output', { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText(/ok/)).toBeInTheDocument();
    expect(screen.getByText(/warn/)).toBeInTheDocument();

    await act(async () => {
      streamCallback?.({ type: 'complete', siteId: 'alpha.test' });
    });

    expect(
      await screen.findByRole('button', { name: 'Run' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });

  it('ignores stream events from other sites', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <WpCliModal isOpen site={site} onClose={mockOnClose} />,
    );

    await user.type(
      screen.getByPlaceholderText('e.g. plugin list'),
      'plugin list',
    );
    await user.click(screen.getByRole('button', { name: 'Run' }));

    await act(async () => {
      streamCallback?.({
        type: 'stdout',
        data: 'should-not-render',
        siteId: 'beta.test',
      });
    });

    expect(
      screen.queryByText('Output', { exact: false }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('should-not-render')).not.toBeInTheDocument();
  });

  it('handles stream error events and stops loading', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <WpCliModal isOpen site={site} onClose={mockOnClose} />,
    );

    await user.type(
      screen.getByPlaceholderText('e.g. plugin list'),
      'plugin list',
    );
    await user.click(screen.getByRole('button', { name: 'Run' }));

    await act(async () => {
      streamCallback?.({
        type: 'error',
        error: 'stream failed',
        siteId: 'alpha.test',
      });
    });

    expect(await screen.findByText('stream failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });

  it('handles invoke rejection by showing error text', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValueOnce(new Error('invoke failed'));

    renderWithProviders(
      <WpCliModal isOpen site={site} onClose={mockOnClose} />,
    );

    await user.type(
      screen.getByPlaceholderText('e.g. plugin list'),
      'plugin list',
    );
    await user.click(screen.getByRole('button', { name: 'Run' }));

    expect(await screen.findByText('Error: invoke failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument();
  });

  it('clears local state and calls onClose when cancel is clicked', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <WpCliModal isOpen site={site} onClose={mockOnClose} />,
    );

    const input = screen.getByPlaceholderText('e.g. plugin list');
    await user.type(input, 'plugin list');
    await user.click(screen.getByRole('button', { name: 'Run' }));

    await act(async () => {
      streamCallback?.({
        type: 'stdout',
        data: 'some output',
        siteId: 'alpha.test',
      });
      streamCallback?.({ type: 'complete', siteId: 'alpha.test' });
    });

    expect(await screen.findByText('some output')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(screen.getByPlaceholderText('e.g. plugin list')).toHaveValue('');
    expect(screen.queryByText('some output')).not.toBeInTheDocument();
  });
});
