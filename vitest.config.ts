import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const plugins = [react()];

export default defineConfig({
  // biome-ignore lint: Vite's plugin type is not compatible with Vitest's expected type, but it works correctly at runtime.
  plugins: plugins as any,
  test: {
    globals: true,
    include: ['src/renderer/**/*.{test,spec}.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./src/renderer/src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'out/',
        'dist/',
        '**/*.config.{ts,js}',
        '**/types.ts',
        '**/*.d.ts',
        'src/renderer/src/main.tsx',
      ],
    },
  },
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src'),
    },
  },
});
