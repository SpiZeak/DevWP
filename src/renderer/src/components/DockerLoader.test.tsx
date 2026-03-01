import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DockerLoader from './DockerLoader';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

describe('DockerLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders and shows loader initially', async () => {
    (invoke as any).mockResolvedValueOnce([]); // get_container_status
    (invoke as any).mockResolvedValueOnce('/path/to/logs'); // get_log_dir
    (listen as any).mockResolvedValue(vi.fn());

    let component: any;
    await act(async () => {
      component = render(<DockerLoader />);
    });

    expect(
      component.getByText('Starting Docker Environment'),
    ).toBeInTheDocument();
  });

  it('hides loader if nginx is running', async () => {
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'get_container_status') {
        return Promise.resolve([{ name: 'devwp-nginx', state: 'running' }]);
      }
      if (cmd === 'get_log_dir') {
        return Promise.resolve('/logs');
      }
      return Promise.resolve();
    });
    (listen as any).mockResolvedValue(vi.fn());

    let component: any;
    await act(async () => {
      component = render(<DockerLoader />);
    });

    expect(
      component.queryByText('Starting Docker Environment'),
    ).not.toBeInTheDocument();
  });

  it('shows error state and copies log dir successfully', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    (invoke as any).mockResolvedValueOnce([]); // get_container_status
    (invoke as any).mockResolvedValueOnce('/logs/test'); // get_log_dir
    let listenerCallback: any;
    (listen as any).mockImplementationOnce((event: string, callback: any) => {
      listenerCallback = callback;
      return Promise.resolve(vi.fn());
    });

    let component: any;
    await act(async () => {
      component = render(<DockerLoader />);
    });

    await act(async () => {
      listenerCallback({
        payload: { status: 'error', message: 'Docker failed' },
      });
    });

    expect(
      component.getByText(
        'There was an error starting Docker. Check the logs for details.',
      ),
    ).toBeInTheDocument();

    const copyButton = component.getByText('Copy');

    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(true),
      },
    });

    await act(async () => {
      fireEvent.click(copyButton);
    });

    // Need to await for next microtask because mockResolvedValue happens on microtask queue
    await act(async () => {
      await Promise.resolve();
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('/logs/test');
    expect(component.getByText('Copied')).toBeInTheDocument();

    // Verify copied text reverts
    await act(async () => {
      vi.advanceTimersByTime(1300);
    });
    expect(component.getByText('Copy')).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('shows error state and fails to copy log dir', async () => {
    (invoke as any).mockResolvedValueOnce([]); // get_container_status
    (invoke as any).mockResolvedValueOnce('/logs/test'); // get_log_dir
    let listenerCallback: any;
    (listen as any).mockImplementationOnce((event: string, callback: any) => {
      listenerCallback = callback;
      return Promise.resolve(vi.fn());
    });

    let component: any;
    await act(async () => {
      component = render(<DockerLoader />);
    });

    await act(async () => {
      listenerCallback({
        payload: { status: 'error', message: 'Docker failed' },
      });
    });

    const copyButton = component.getByText('Copy');

    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('no clipboard')),
      },
    });

    await act(async () => {
      fireEvent.click(copyButton);
    });

    expect(component.getByText('Copy')).toBeInTheDocument();
  });

  it('handles completion and unmounts after timeout', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    (invoke as any).mockResolvedValueOnce([]); // get_container_status
    (invoke as any).mockResolvedValueOnce('/path/to/logs'); // get_log_dir
    let listenerCallback: any;
    (listen as any).mockImplementationOnce((event: string, callback: any) => {
      listenerCallback = callback;
      return Promise.resolve(vi.fn());
    });

    let component: any;
    await act(async () => {
      component = render(<DockerLoader />);
    });

    await act(async () => {
      listenerCallback({ payload: { status: 'complete', message: 'Ready' } });
    });

    expect(
      component.getByText('Starting Docker Environment'),
    ).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1100);
    });

    expect(
      component.queryByText('Starting Docker Environment'),
    ).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it('handles reject get_container_status', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'get_container_status')
        return Promise.reject(new Error('status error'));
      if (cmd === 'get_log_dir') return Promise.resolve('/logs');
      return Promise.resolve();
    });
    (listen as any).mockResolvedValue(vi.fn());

    await act(async () => {
      render(<DockerLoader />);
    });

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to get initial container status',
        expect.any(Error),
      );
    });
    consoleSpy.mockRestore();
  });

  it('handles reject get_log_dir', async () => {
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'get_container_status') return Promise.resolve([]);
      if (cmd === 'get_log_dir') return Promise.reject(new Error('log error'));
      return Promise.resolve();
    });
    (listen as any).mockResolvedValue(vi.fn());

    await act(async () => {
      render(<DockerLoader />);
    });
  });
});
