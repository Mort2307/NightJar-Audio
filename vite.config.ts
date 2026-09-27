import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
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
