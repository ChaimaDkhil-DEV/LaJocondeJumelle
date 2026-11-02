import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.API_URL ?? 'http://localhost:3002';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Démonstration en ligne (npm run -w backend demo:en-ligne) : adresse du Quick Tunnel
    // Cloudflare. `vite preview` reprend ce réglage et le proxy ci-dessous.
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
      '/socket.io': { target: apiTarget, ws: true, changeOrigin: false },
    },
  },
});
