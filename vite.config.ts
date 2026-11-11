import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './', // loaded from file:// by Electron in the installed app
  clearScreen: false,
  publicDir: false,
  server: { port: 1420, strictPort: true },
  build: {
    target: 'chrome130',
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        settings: resolve(__dirname, 'settings.html'),
        preview: resolve(__dirname, 'preview.html'),
      },
    },
  },
});
