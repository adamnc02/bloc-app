/// <reference types="vitest/config" />
// BLOC Coach's build (TECHNICAL §139).
//
//   · Served at /bloc-app/coach/: `base` below, and scripts/publish-files.txt
//     maps coach/dist/ to coach/ on the live site.
//   · Imports BLOC's shared engine as SOURCE (`@engine`, ../engine/src), never
//     the committed engine/dist build, which is BLOC's.
//   · dist/ is COMMITTED and is what the live site serves, byte for byte.
//     scripts/verify-coach-build.mjs rebuilds it and fails if it differs.
//
// 🚨 The local-dev bypass is decided by the HOSTNAME (src/lib/host.ts, the
//    engine's isLocalDevHost), never by Vite's mode or import.meta.env.DEV:
//    a production build previewed on a LAN IP must still bypass, and nothing
//    about a build can make a public host bypass (TECHNICAL §82, §119).
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// The dev bypass's fixture clients are built from BLOC's demo dataset
// (bloc-demo-data.dev.json when a developer has one, else the tracked
// bloc-demo-data.json), fetched at /bloc-app/<file> exactly where the live
// site serves BLOC's copy. This serves them from the repo root in dev and
// preview, so they are never copied into coach/dist.
function blocDemoData(): Plugin {
  const serve = (req: { url?: string }, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (b?: string | Buffer) => void }, next: () => void) => {
    const m = /^\/bloc-app\/(bloc-demo-data(?:\.dev)?\.json)(?:\?.*)?$/.exec(req.url || '');
    if (!m) return next();
    const file = repoRoot + m[1];
    if (!existsSync(file)) { res.statusCode = 404; res.end(); return; }
    res.setHeader('Content-Type', 'application/json');
    res.end(readFileSync(file));
  };
  return {
    name: 'bloc-demo-data',
    configureServer(server) { server.middlewares.use(serve); },
    configurePreviewServer(server) { server.middlewares.use(serve); },
  };
}

export default defineConfig({
  base: '/bloc-app/coach/',
  plugins: [react(), blocDemoData()],
  define: { __COACH_VERSION__: JSON.stringify(`v${pkg.version}`) },
  resolve: {
    alias: {
      '@engine': fileURLToPath(new URL('../engine/src/index.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { port: 5173, strictPort: true, fs: { allow: [repoRoot] } },
  preview: { port: 4173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 800 },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
