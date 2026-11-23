import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    css: true,
    restoreMocks: true,
    poolOptions: {
      threads: {
        maxThreads: 4,
        minThreads: 2,
      },
    },
    isolate: true,
    cache: false,
  },
});
