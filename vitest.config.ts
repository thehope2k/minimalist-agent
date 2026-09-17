import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const r = (p: string) => resolve(__dirname, p);

// Minimal alias so renderer-side modules (which use the `@/` alias defined
// in tsconfig.web.json / electron.vite.config.ts's renderer block) can be
// unit-tested with vitest without spinning up the full Vite/Electron build.
export default defineConfig({
  resolve: {
    alias: {
      '@': r('src/renderer/src'),
    },
  },
});
