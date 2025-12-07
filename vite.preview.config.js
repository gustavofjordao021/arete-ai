import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Standalone preview config (no Chrome extension)
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@arete/core': resolve(__dirname, 'packages/core/dist/browser.js'),
    },
  },
  root: resolve(__dirname, 'src/preview'),
  server: {
    port: 3000,
    open: true,
  },
});
