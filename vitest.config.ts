import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Every automated test runs against recorded fixtures; test/setup.ts blocks any call to a live service (spec 3.1).
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'test/**/*.test.ts', 'test/**/*.test.tsx'],
    setupFiles: ['test/setup.ts'],
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
