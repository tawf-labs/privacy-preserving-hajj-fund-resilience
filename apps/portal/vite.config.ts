import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// bb.js uses WASM + Web Workers; cross-origin isolation lets it use SharedArrayBuffer threads.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

export default defineConfig({
  base: process.env.PORTAL_BASE ?? '/',
  plugins: [react(), tailwindcss()],
  optimizeDeps: { exclude: ['@aztec/bb.js'] },
  build: { target: 'esnext', chunkSizeWarningLimit: 4000 },
  worker: { format: 'es' },
  server: { headers: isolation, port: 5173 },
  preview: { headers: isolation, port: 4173 },
});
