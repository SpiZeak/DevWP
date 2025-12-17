import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const plugins = [react()];

export default defineConfig({
  plugins,
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
      '@main': resolve(__dirname, './src/main'),
      '@preload': resolve(__dirname, './src/preload'),
    },
  },
});
