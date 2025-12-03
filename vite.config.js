import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import { copyFileSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import manifest from './manifest.json';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    crx({ manifest }),
    {
      name: 'add-popup',
      closeBundle() {
        try {
          // Copy popup files to dist
          copyFileSync('popup.html', 'dist/popup.html');
          copyFileSync('popup.js', 'dist/popup.js');

          // Update manifest with popup action
          const manifestPath = 'dist/manifest.json';
          const distManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
          distManifest.action = {
            default_popup: 'popup.html',
            default_title: 'Arete Settings'
          };
          writeFileSync(manifestPath, JSON.stringify(distManifest, null, 2));
          console.log('Added popup to extension');
        } catch (e) {
          console.log('Could not add popup:', e.message);
        }
      }
    }
  ],
  resolve: {
    alias: {
      '@arete/core': resolve(__dirname, 'packages/core/dist/index.js'),
    },
  },
});
