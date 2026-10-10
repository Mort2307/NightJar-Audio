import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';

const buildId = String(Date.now());
const builtAt = new Date(Number(buildId)).toISOString();
// Reconcile installed-app assets to an exact Git revision, not only a timestamp.
const sourceCommit = (() => {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() || null; }
  catch { return null; }
})();

const nightjarVersionManifest = (): Plugin => ({
  name: 'nightjar-version-manifest',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ buildId, builtAt, sourceCommit }),
    });
  },
});

export default defineConfig({
  define: {
    __NIGHTJAR_BUILD_ID__: JSON.stringify(buildId),
    __NIGHTJAR_BUILT_AT__: JSON.stringify(builtAt),
    __NIGHTJAR_SOURCE_COMMIT__: JSON.stringify(sourceCommit),
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
