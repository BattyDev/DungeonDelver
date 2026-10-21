import { defineConfig } from 'vite';
export default defineConfig({
  base: '/DungeonDelver/',
  build: { rollupOptions: { output: { manualChunks: { three: ['three'] } } } },
});
