import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const isAppDeploy = Boolean(process.env.APPDEPLOY_VITE_OUT_DIR);

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: isAppDeploy
      ? {}
      : { '@appdeploy/client': path.resolve(process.cwd(), 'src/platform/appdeploy-local-shim.ts') },
  },
  build: {
    outDir: process.env.APPDEPLOY_VITE_OUT_DIR || 'dist',
    sourcemap: process.env.APPDEPLOY_VITE_SOURCEMAP === 'hidden' ? 'hidden' : false,
    rollupOptions: { maxParallelFileOps: 128 },
  },
});