import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // Global test configuration
    globals: true,
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
    // Use projects to separate environments
    projects: [
      {
        test: {
          name: 'main',
          include: ['src/main/**/*.{test,spec}.ts', 'src/preload/**/*.{test,spec}.ts'],
          environment: 'node',
          globals: true
        }
      },
      {
        test: {
          name: 'renderer',
          include: ['src/renderer/**/*.{test,spec}.{ts,tsx}'],
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./src/renderer/src/test/setup.ts']
        }
      }
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
