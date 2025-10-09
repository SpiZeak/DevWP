import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // Include all test files
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/out/**', '**/dist/**', '**/www/**', '**/config/**'],
    globals: true,
    // Use jsdom for renderer tests, node for main process tests
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
        'src/preload/index.ts'
      ]
    },
    // Use workspace config for different test environments
    environmentMatchGlobs: [
      ['src/main/**/*.{test,spec}.ts', 'node'],
      ['src/preload/**/*.{test,spec}.ts', 'node'],
      ['src/renderer/**/*.{test,spec}.{ts,tsx}', 'jsdom']
    ]
  },
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@main': resolve(__dirname, 'src/main'),
      '@preload': resolve(__dirname, 'src/preload')
    }
  }
})
