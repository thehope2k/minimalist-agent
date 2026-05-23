import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const r = (p: string) => resolve(__dirname, p);

export default defineConfig({
  main: {
    build: {
      outDir: r('out/main'),
      // Two entries: the Electron main process AND the Pi subprocess server.
      // electron-vite's `lib.entry` can be an object → multiple bundles.
      lib: {
        entry: {
          index: r('src/main/index.ts'),
          'pi-server': r('src/main/pi-server/index.ts'),
        },
      },
      rollupOptions: {
        // Native + heavy modules must stay external. Pi SDK pulls in a lot
        // (clipboard binaries, jiti, ...); externalising the @mariozechner
        // packages keeps build fast and avoids bundling issues.
        external: [
          'sharp',
          'node-pty',
          'electron',
          /^@mariozechner\//,
          /^node:/,
        ],
        output: {
          format: 'es',
          entryFileNames: '[name].js',
        },
      },
    },
  },
  preload: {
    build: {
      outDir: r('out/preload'),
      lib: { entry: r('src/preload/index.ts'), formats: ['es'] },
      rollupOptions: {
        // Side-effect-only (contextBridge.exposeInMainWorld) - must not tree-shake.
        treeshake: false,
        output: { entryFileNames: '[name].mjs' },
      },
    },
  },
  renderer: {
    root: r('src/renderer'),
    build: {
      outDir: r('out/renderer'),
      rollupOptions: {
        input: r('src/renderer/index.html'),
      },
    },
    resolve: {
      alias: {
        '@': r('src/renderer/src'),
      },
    },
    plugins: [react(), tailwindcss()],
  },
});
