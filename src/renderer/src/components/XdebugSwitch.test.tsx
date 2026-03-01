import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { act, fireEvent, render } from '@testing-library/react';
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

  it('renders initial performance mode', async () => {
    (invoke as any).mockResolvedValueOnce(false); // Xdebug disabled
    (listen as any).mockResolvedValue(vi.fn());

    let component: any;
    await act(async () => {
      component = render(<XdebugSwitch />);
    });

    expect(component.getByText('Performance mode')).toBeInTheDocument();
    expect(
      component.getByText(/Performance mode disables Xdebug/),
    ).toBeInTheDocument();
  });

  it('toggles xdebug on click', async () => {
    (invoke as any).mockResolvedValue(false); // Initially false
    (listen as any).mockResolvedValue(vi.fn());

    let component: any;
    await act(async () => {
      component = render(<XdebugSwitch />);
    });

    const toggleInput = component.container.querySelector('input');

    await act(async () => {
      fireEvent.click(toggleInput!);
    });

    expect(invoke).toHaveBeenCalledWith('toggle_xdebug');
  });

  it('updates state via events', async () => {
    (invoke as any).mockResolvedValue(false);

    let listenerCallback: any;
    (listen as any).mockImplementation((event: string, callback: any) => {
      listenerCallback = callback;
      return Promise.resolve(vi.fn());
    });

    let component: any;
    await act(async () => {
      component = render(<XdebugSwitch />);
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
