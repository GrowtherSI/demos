import { defineConfig, mergeConfig } from 'vite';
import { demoViteConfig } from '../shared/chrome/vite.mjs';

export default mergeConfig(
  demoViteConfig(),
  defineConfig({
    build: {
      // three.js alone is ~500 kB minified; split it so the app code caches separately.
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/three')) return 'three';
            if (id.includes('node_modules/react')) return 'react';
            return undefined;
          },
        },
      },
    },
    test: {
      environment: 'node',
    },
  }),
);
