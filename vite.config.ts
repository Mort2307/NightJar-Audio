import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const buildId = String(Date.now());
const builtAt = new Date(Number(buildId)).toISOString();

const nightjarVersionManifest = (): Plugin => ({
  name: 'nightjar-version-manifest',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ buildId, builtAt }),
    });
  },
});

export default defineConfig({
  define: {
    __NIGHTJAR_BUILD_ID__: JSON.stringify(buildId),
    __NIGHTJAR_BUILT_AT__: JSON.stringify(builtAt),
  },
  plugins: [react(), nightjarVersionManifest()],
  // All installed-app and nested URLs must load assets from the site root.
  base: '/',
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      maxParallelFileOps: 128,
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/firebase/') || id.includes('/@firebase/')) return 'firebase-vendor';
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'react-vendor';
          if (id.includes('/lucide-react/')) return 'icons-vendor';
          return 'vendor';
        },
      },
    },
  },
});
