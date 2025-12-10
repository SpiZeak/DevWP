import { type RenderOptions, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';

// Re-export everything from @testing-library/react
export * from '@testing-library/react';
export { userEvent };

// Custom render function that can be extended with providers
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
): ReturnType<typeof render> {
  return render(ui, { ...options });
}

// Mock IPC renderer for testing
export function createMockIpcRenderer(overrides = {}): Record<string, unknown> {
  return {
    invoke: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
    ...overrides,
  };
}

// Wait for async operations
export function waitFor(callback: () => void, timeout = 3000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      try {
        callback();
        clearInterval(interval);
        resolve();
      } catch (error) {
        if (Date.now() - startTime > timeout) {
          clearInterval(interval);
          reject(error);
        }
      }
    }, 50);
  });
}
