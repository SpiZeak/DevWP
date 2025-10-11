import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'renderer',
    include: ['src/renderer/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/out/**', '**/dist/**'],
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/renderer/src/test/setup.ts']
  },
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, './src/renderer/src'),
      '@main': resolve(__dirname, './src/main'),
      '@preload': resolve(__dirname, './src/preload')
    }
  }
})
