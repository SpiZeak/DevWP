import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'integration',
    include: ['src/**/*.integration.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/out/**', '**/dist/**'],
    globals: true,
    environment: 'node',
    testTimeout: 30000, // Longer timeout for Docker operations
    hookTimeout: 30000,
    setupFiles: ['./src/test/integration-setup.ts'],
    passWithNoTests: true, // Don't fail if no integration tests exist yet
  },
  resolve: {
    alias: {
      '@main': resolve(__dirname, './src/main'),
      '@renderer': resolve(__dirname, './src/renderer/src'),
    },
  },
});
