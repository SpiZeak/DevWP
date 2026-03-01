import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const plugins = [react()];

export default defineConfig({
  // biome-ignore lint: Vite's plugin type is not compatible with Vitest's expected type, but it works correctly at runtime.
  plugins: plugins as any,
  test: {
    name: 'renderer',
    include: ['src/renderer/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/out/**', '**/dist/**'],
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/renderer/src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, './src/renderer/src'),
    },
  },
});
