import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import manifest from './manifest.json';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // Use browser-safe entry (no Node.js modules)
      '@arete/core': resolve(__dirname, 'packages/core/dist/browser.js'),
    },
  },
  define: {
    // Provide empty implementations for Node.js modules used by CLI client
    'process.env': {},
  },
  build: {
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        options: resolve(__dirname, 'src/options/index.html'),
      },
      onwarn(warning, warn) {
        // Suppress warnings about Node.js modules
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
        if (warning.message.includes('externalized for browser')) return;
        warn(warning);
      },
    },
    commonjsOptions: {
      // Ignore Node.js built-in modules
      ignore: ['fs', 'path', 'os'],
    },
  },
});
