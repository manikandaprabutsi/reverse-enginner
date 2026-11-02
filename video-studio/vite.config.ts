import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
  // ffmpeg.wasm's single-threaded core does not need SharedArrayBuffer,
  // so no cross-origin isolation headers are required.
  optimizeDeps: {
    // Do not pre-bundle the ffmpeg wrapper: it resolves the core at runtime
    // from /ffmpeg/, and pre-bundling rewrites those URLs into broken imports.
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
