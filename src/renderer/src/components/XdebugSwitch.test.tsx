import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import XdebugSwitch from './XdebugSwitch';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

describe('XdebugSwitch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially then resolves to performance mode', async () => {
    let resolveInvoke: (value: unknown) => void;
    // biome-ignore lint/suspicious/noExplicitAny: mock
    (invoke as any).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveInvoke = resolve;
      }),
    );
    // biome-ignore lint/suspicious/noExplicitAny: mock
    (listen as any).mockResolvedValue(vi.fn());

    // biome-ignore lint/suspicious/noExplicitAny: render return
    let component: any;
    await act(async () => {
      component = render(<XdebugSwitch />);
    });

    // Initially shows loading
    expect(component.getByText('Loading mode…')).toBeInTheDocument();

    // Resolve the promise
    await act(async () => {
      resolveInvoke?.(false);
    });

    await waitFor(() => {
      expect(component.getByText('Performance mode')).toBeInTheDocument();
    });
  });

  it('toggles xdebug on click', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock
    (invoke as any).mockResolvedValue(false);
    // biome-ignore lint/suspicious/noExplicitAny: mock
    (listen as any).mockResolvedValue(vi.fn());

    // biome-ignore lint/suspicious/noExplicitAny: render return
    let component: any;
    await act(async () => {
      component = render(<XdebugSwitch />);
    });

    // Wait for loading to resolve
    await waitFor(() => {
      expect(component.getByText('Performance mode')).toBeInTheDocument();
    });

    const toggleInput = component.container.querySelector(
      'input',
    ) as HTMLInputElement;

    await act(async () => {
      fireEvent.click(toggleInput);
    });

    expect(invoke).toHaveBeenCalledWith('toggle_xdebug');
  });

  it('updates state via events', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock
    (invoke as any).mockResolvedValue(false);

    // biome-ignore lint/suspicious/noExplicitAny: mock callback
    let listenerCallback: any;
    // biome-ignore lint/suspicious/noExplicitAny: mock
    (listen as any).mockImplementation((_event: string, callback: any) => {
      listenerCallback = callback;
      return Promise.resolve(vi.fn());
    });

    // biome-ignore lint/suspicious/noExplicitAny: render return
    let component: any;
    await act(async () => {
      component = render(<XdebugSwitch />);
    });

    // Wait for loading to resolve
    await waitFor(() => {
      expect(component.getByText('Performance mode')).toBeInTheDocument();
    });

    // Simulate restarting
    await act(async () => {
      listenerCallback({ payload: { status: 'restarting' } });
    });
    expect(component.container.querySelector('input')).toBeDisabled();

    // Simulate complete
    await act(async () => {
      listenerCallback({ payload: { status: 'complete', enabled: true } });
    });
    expect(component.getByText('Debug mode')).toBeInTheDocument();
    expect(component.container.querySelector('input')).not.toBeDisabled();
  });
});
