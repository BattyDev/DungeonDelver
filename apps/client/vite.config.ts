import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  base: process.env.DELVER_BASE_PATH ?? '/DungeonDelver/',
  build: {
    rollupOptions: {
      // The game, and the Paper Doll Studio behind the hall's wardrobe.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        studio: fileURLToPath(new URL('./studio.html', import.meta.url)),
      },
      output: { manualChunks: { three: ['three'] } },
    },
  },
});
