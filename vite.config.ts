import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// The React client (spec 3.1). Built into dist/client; the Fastify server serves it in production.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { outDir: 'dist/client', emptyOutDir: true },
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
