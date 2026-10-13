import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  base: '/games/',
  build: {
    outDir: 'dist/games',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@engine': path.resolve(__dirname, 'supabase/functions/_shared'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
  plugins: [react()],
});
