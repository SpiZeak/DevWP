import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    include: ['src/main/**/*.{test,spec}.ts', 'src/preload/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/out/**', '**/dist/**'],
    globals: true,
    environment: 'node',
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
        'src/main/index.ts',
        'src/preload/index.ts'
      ]
    }
  },
  resolve: {
    alias: {
      '@main': resolve(__dirname, 'src/main'),
      '@preload': resolve(__dirname, 'src/preload')
    }
  }
})
