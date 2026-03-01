import { listen } from '@tauri-apps/api/event';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Notifications from './Notifications';

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

describe('Notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets up a listener on mount', () => {
    render(<Notifications />);
    expect(listen).toHaveBeenCalledWith('notification', expect.any(Function));
  });

  it('renders a notification and removes it after timeout', async () => {
    vi.useFakeTimers();
    let listenerCallback: any;
    (listen as any).mockImplementationOnce((event: string, callback: any) => {
      listenerCallback = callback;
      return Promise.resolve(vi.fn());
    });

    const { container, getByText, queryByText } = render(<Notifications />);

    // Simulate an event
    await act(async () => {
      listenerCallback({
        payload: { type: 'success', message: 'Test message' },
      });
    });

    expect(getByText('Test message')).toBeInTheDocument();

    // Fast forward to remove timeout
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(queryByText('Test message')).not.toBeInTheDocument();

    vi.useRealTimers();
  });
});
