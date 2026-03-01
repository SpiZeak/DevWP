import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.navigator.clipboard for user-event
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn(),
    readText: vi.fn(),
  },
});

// Fix tauri event plugin internals mocked for Tauri v2 mock IPC
if (!window.__TAURI_EVENT_PLUGIN_INTERNALS__) {
  Object.defineProperty(window, '__TAURI_EVENT_PLUGIN_INTERNALS__', {
    value: {
      unregisterListener: vi.fn(),
      emit: vi.fn(),
    },
    writable: true,
  });
}
