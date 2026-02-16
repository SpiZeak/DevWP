import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '../test/test-utils';
import Notifications from './Notifications';

describe('Notifications', () => {
  let mockOnNotification: ReturnType<typeof vi.fn>;
  let mockRemoveListener: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnNotification = vi.fn();
    mockRemoveListener = vi.fn();

    window.electronAPI = {
      onNotification: mockOnNotification.mockReturnValue(mockRemoveListener),
    } as unknown as typeof window.electronAPI;

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as Partial<Window & typeof globalThis>).electronAPI;
  });

  it('should render without notifications initially', () => {
    const { container } = renderWithProviders(<Notifications />);

    const notifications = container.querySelectorAll('.notification');
    expect(notifications).toHaveLength(0);
  });

  it('should register notification listener on mount', () => {
    renderWithProviders(<Notifications />);

    expect(mockOnNotification).toHaveBeenCalledWith(expect.any(Function));
  });

  it('should display success notification', () => {
    renderWithProviders(<Notifications />);

    const callback = mockOnNotification.mock.calls[0][0];
    act(() => {
      callback({ type: 'success', message: 'Operation successful' });
    });

    expect(screen.getByText('Operation successful')).toBeInTheDocument();
  });

  it('should display error notification', () => {
    renderWithProviders(<Notifications />);

    const callback = mockOnNotification.mock.calls[0][0];
    act(() => {
      callback({ type: 'error', message: 'Operation failed' });
    });

    expect(screen.getByText('Operation failed')).toBeInTheDocument();
  });

  it('should apply correct CSS class for success', () => {
    const { container } = renderWithProviders(<Notifications />);

    const callback = mockOnNotification.mock.calls[0][0];
    act(() => {
      callback({ type: 'success', message: 'Success!' });
    });

    const notification = container.querySelector('.notification.success');
    expect(notification).toBeInTheDocument();
  });

  it('should apply correct CSS class for error', () => {
    const { container } = renderWithProviders(<Notifications />);

    const callback = mockOnNotification.mock.calls[0][0];
    act(() => {
      callback({ type: 'error', message: 'Error!' });
    });

    const notification = container.querySelector('.notification.error');
    expect(notification).toBeInTheDocument();
  });

  it('should display multiple notifications', () => {
    const { container } = renderWithProviders(<Notifications />);

    const callback = mockOnNotification.mock.calls[0][0];
    act(() => {
      callback({ type: 'success', message: 'First notification' });
      callback({ type: 'error', message: 'Second notification' });
      callback({ type: 'success', message: 'Third notification' });
    });

    const notifications = container.querySelectorAll('.notification');
    expect(notifications).toHaveLength(3);
  });

  it('should auto-dismiss notification after 5 seconds', () => {
    renderWithProviders(<Notifications />);

    const callback = mockOnNotification.mock.calls[0][0];
    act(() => {
      callback({ type: 'success', message: 'Will dismiss' });
    });

    expect(screen.getByText('Will dismiss')).toBeInTheDocument();

    // Advance timer by 5 seconds
    act(() => {
      vi.runAllTimers();
    });

    expect(screen.queryByText('Will dismiss')).not.toBeInTheDocument();
  });

  it('should not dismiss notification before timeout', () => {
    renderWithProviders(<Notifications />);

    const callback = mockOnNotification.mock.calls[0][0];
    act(() => {
      callback({ type: 'success', message: 'Still here' });
    });

    // Advance timer by 4 seconds (less than 5)
    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.getByText('Still here')).toBeInTheDocument();
  });

  it('should handle multiple notifications with different timeouts', () => {
    renderWithProviders(<Notifications />);

    const callback = mockOnNotification.mock.calls[0][0];

    act(() => {
      callback({ type: 'success', message: 'First' });
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    act(() => {
      callback({ type: 'success', message: 'Second' });
    });

    // After 3 more seconds (5 total), first should be gone
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.queryByText('First')).not.toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('should assign unique IDs to notifications', async () => {
    vi.useRealTimers(); // Use real timers so Date.now() gives different values
    const { container } = renderWithProviders(<Notifications />);

    const callback = mockOnNotification.mock.calls[0][0];
    await act(async () => {
      callback({ type: 'success', message: 'Notification 1' });
    });
    await new Promise((resolve) => setTimeout(resolve, 10)); // Ensure different timestamps
    await act(async () => {
      callback({ type: 'success', message: 'Notification 2' });
    });

    await waitFor(() => {
      const notifications = container.querySelectorAll('.notification');
      expect(notifications.length).toBe(2);

      const keys = Array.from(notifications).map((n) =>
        n.getAttribute('data-key'),
      );
      expect(keys[0]).not.toBe(keys[1]);
    });

    vi.useFakeTimers(); // Restore fake timers for other tests
  });

  it('should cleanup listener on unmount', () => {
    const { unmount } = renderWithProviders(<Notifications />);

    unmount();

    expect(mockRemoveListener).toHaveBeenCalled();
  });

  it('should handle rapid notifications', () => {
    const { container } = renderWithProviders(<Notifications />);

    const callback = mockOnNotification.mock.calls[0][0];

    act(() => {
      for (let i = 0; i < 10; i++) {
        callback({ type: 'success', message: `Notification ${i}` });
      }
    });

    const notifications = container.querySelectorAll('.notification');
    expect(notifications).toHaveLength(10);
  });

  it('should dismiss all notifications after timeout', () => {
    const { container } = renderWithProviders(<Notifications />);

    const callback = mockOnNotification.mock.calls[0][0];
    act(() => {
      callback({ type: 'success', message: 'One' });
      callback({ type: 'error', message: 'Two' });
      callback({ type: 'success', message: 'Three' });
    });

    expect(container.querySelectorAll('.notification')).toHaveLength(3);

    act(() => {
      vi.runAllTimers();
    });

    expect(container.querySelectorAll('.notification')).toHaveLength(0);
  });
});
