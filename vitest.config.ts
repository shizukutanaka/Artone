import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      exclude: ['node_modules', 'tests', '*.config.*', 'future/**']
    },
    testTimeout: 10000
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      '@app': resolve(__dirname, 'app'),
      '@core': resolve(__dirname, 'core'),
      '@timeline': resolve(__dirname, 'timeline'),
      '@color': resolve(__dirname, 'color'),
      '@audio': resolve(__dirname, 'audio'),
      '@ai': resolve(__dirname, 'ai'),
      '@render': resolve(__dirname, 'render'),
    }
  }
});
