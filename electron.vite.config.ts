import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';

function stripCrossoriginForFileLoads(): Plugin {
  return {
    name: 'strip-crossorigin-for-file-loads',
    transformIndexHtml: {
      order: 'post' as const,
      handler(html, ctx) {
        // Only adjust during build output.
        if (!ctx.bundle) return html;
        return html.replace(/\s+crossorigin(?:="[^"]*")?/g, '');
      },
    },
  };
}

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: [
          'is-stream',
          'logform',
          'readable-stream',
          'winston-transport',
        ],
      },
    },
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
      },
    },
    plugins: [react(), tailwindcss(), stripCrossoriginForFileLoads()],
    build: {
      minify: 'esbuild',
      target: 'esnext',
      sourcemap: false,
    },
  },
});
