import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

function stripCrossoriginForFileLoads(): Plugin {
  return {
    name: 'strip-crossorigin-for-file-loads',
    transformIndexHtml: {
      order: 'post' as const,
      handler(html, ctx) {
        if (!ctx.bundle) return html;
        return html.replace(/\s+crossorigin(?:="[^"]*")?/g, '');
      },
    },
  };
}

export default defineConfig({
  root: 'src/renderer',
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src'),
    },
  },
  plugins: [react(), tailwindcss(), stripCrossoriginForFileLoads()],
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    minify: 'esbuild',
    target: 'esnext',
    sourcemap: false,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
