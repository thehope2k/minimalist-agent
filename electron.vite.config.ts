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
        // (clipboard binaries, jiti, ...); externalising the @earendil-works
        // packages (and the still-@mariozechner/clipboard optional dep) keeps
        // build fast and avoids bundling issues.
        external: [
          'sharp',
          'node-pty',
          'sherpa-onnx-node',
          'electron',
          /^@earendil-works\//,
          /^@mariozechner\//,
          // The MCP client SDK (used by pi-server for mcp-backed extensions)
          // pulls in ws/eventsource/cross-spawn; keep it external so those
          // resolve from node_modules instead of being bundled into the ESM
          // pi-server bundle.
          /^@modelcontextprotocol\//,
          // OpenTelemetry packages are runtime deps (see AGENTS.md). Keep them
          // external so they resolve from node_modules instead of bundling the
          // SDK's CJS internals into the ESM pi-server bundle.
          /^@opentelemetry\//,
          // Kept external so bundling doesn't add a third copy on top of the two
          // npm already installs (root + @earendil-works/pi-coding-agent's own
          // exact-pinned nested copy — confirmed via `npm ls undici`, not deduped
          // even when pinned to match). Our idle-timeout dispatcher config only
          // reaches @earendil-works/pi-ai's calls (bare `fetch()`, patched
          // process-wide by `undici.install()` in http-idle-timeout.ts) — it does
          // NOT protect any code that imports its own `undici` and calls
          // `request()`/`Client` directly, since that resolves the nested copy's
          // own unconfigured dispatcher. See http-idle-timeout.ts for detail.
          'undici',
          /^node:/,
        ],
        output: {
          format: 'es',
          entryFileNames: '[name].js',
          // Disable code-splitting completely - each entry must be self-contained
          // without shared chunks (pi-server cannot import electron)
          inlineDynamicImports: false,
          manualChunks: (id, meta) => {
            // Each entry point gets its own code (no shared chunks)
            // This is critical because pi-server cannot import electron
            return null;
          },
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
      // Keep script-like assets (e.g. the voice AudioWorklet processor) as
      // real same-origin files instead of inlined data: URIs — the app's
      // production CSP only allows `script-src 'self'`, not `data:`.
      assetsInlineLimit: 0,
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
