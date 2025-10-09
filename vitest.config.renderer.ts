import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/renderer/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/out/**', '**/dist/**'],
    globals: true,
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
        'src/renderer/src/main.tsx'
      ]
    }
  },
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  }
})
