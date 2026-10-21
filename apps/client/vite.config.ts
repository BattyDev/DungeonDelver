import { defineConfig } from 'vite';
export default defineConfig({
  base: process.env.DELVER_BASE_PATH ?? '/DungeonDelver/',
  build: { rollupOptions: { output: { manualChunks: { three: ['three'] } } } },
});
