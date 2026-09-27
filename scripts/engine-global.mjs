// ═══════════════════════════════════════════════════════════════════════
// scripts/engine-global.mjs — defines `BlocEngine` in this Node process,
// exactly as index.html's <script src="engine/dist/bloc-engine.js"> does in
// the browser (TECHNICAL §122–§123).
//
// Why: the older verify scripts brace-extract functions from index.html and
// run them with `new Function(...)`. Since v8.33 several of those functions
// are shims calling `BlocEngine.<name>`, which throws "BlocEngine is not
// defined" unless the engine is loaded first. Import this, for its side
// effect, before extracting anything:
//
//   import './engine-global.mjs';
//
// It runs the COMMITTED build (the file the live site serves) as a global
// script, so `var BlocEngine` lands on globalThis as it does on window.
// Not a verify script itself: the sweep's glob is verify*.mjs.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'engine', 'dist', 'bloc-engine.js');
if (typeof globalThis.BlocEngine === 'undefined') {
  vm.runInThisContext(readFileSync(dist, 'utf8'), { filename: dist });
}
if (typeof globalThis.BlocEngine !== 'object') throw new Error(`engine-global: ${dist} did not define BlocEngine`);
