import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

// Relative base so the build works under any GitHub Pages path.
export default defineConfig({
  base: './',
  plugins: [preact()],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
