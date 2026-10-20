import { defineConfig } from 'vite';
// Diagnostik build: hanya nama variabel, tidak pernah nilainya.
const viteKeys = Object.keys(process.env).filter((k) => k.startsWith('VITE_')).sort();
console.log(`[build] VITE_ yang terlihat proses build: ${viteKeys.join(', ') || '(kosong)'}`);
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  base: '/games/',
  build: {
    outDir: 'dist/games',
    emptyOutDir: true,
    // Namespace sekali jalan: objek cache edge lama menyimpan respons HTML di URL
    // chunk tertentu dengan header immutable, jadi nama baru harus diminta ulang.
    assetsDir: 'assets/v2',
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'] },
      },
    },
  },
  resolve: {
    alias: {
      '@engine': path.resolve(__dirname, 'supabase/functions/_shared'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
  plugins: [react()],
});
