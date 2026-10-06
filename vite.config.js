import { defineConfig } from 'vite';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Copies index.html to 404.html after build so static hosts without rewrites
// (GitHub Pages, plain buckets) still serve the SPA on deep links.
const spaFallback = () => ({
  name: 'spa-fallback',
  closeBundle() {
    const dist = resolve(__dirname, 'dist');
    copyFileSync(resolve(dist, 'index.html'), resolve(dist, '404.html'));
  },
});

export default defineConfig({
  plugins: [spaFallback()],
  build: { target: 'es2020', sourcemap: false, chunkSizeWarningLimit: 1000 },
});
