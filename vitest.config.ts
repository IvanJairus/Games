import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['supabase/functions/_shared/**/*.ts'],
    },
  },
  resolve: {
    alias: {
      '@engine': path.resolve(__dirname, 'supabase/functions/_shared'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
