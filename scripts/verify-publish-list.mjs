#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-publish-list.mjs — the live site publishes every file the app loads
// (v8.31, TECHNICAL §121, PROMPT-03 Phase 1c)
//
// THE BUG THIS PREVENTS. Since v8.31 GitHub Pages publishes ONLY the files in
// scripts/publish-files.txt (the Actions workflow), not the whole repo. A file
// the app loads but the list forgets is a 404 on the live site — and the
// deep dive's first draft of that list (D7, written at v8.19) would have
// dropped sw.js, the manifest and the icons: every phone's 07:00 push and the
// Home Screen install.
//
// It finds every same-origin file index.html, sw.js and the manifest refer to
// and requires each one on the list; requires everything on the list to be
// tracked by git; and refuses the files that must never be published. It also
// pins the workflow properties the deploy relies on.
//
// 🚨 A new asset (an image, a second script, the Phase 2 engine build) goes on
//    the list in the same change that first references it. Controls below
//    drop sw.js and the manifest icons from the list and must fail.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(repo, f), 'utf8');
let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok && detail) console.log(`    ${detail}`);
}

const parseEntries = text => text.split('\n').map(l => l.replace(/#.*/, '').trim()).filter(Boolean);
// Coach v0.1 (§139): `src/ => dest/` publishes every tracked file under src/ at dest/.
const MAP = /^(\S+\/) => (\S+\/)$/;
const entries = parseEntries(read('scripts/publish-files.txt'));
const list = entries.filter(e => !e.includes(' => '));
const maps = entries.filter(e => e.includes(' => ')).map(e => { const m = MAP.exec(e); return m ? { src: m[1], dest: m[2], line: e } : { bad: e }; });
const DEV_ONLY = new Set(['bloc-demo-data.dev.json']); // fetched with a fallback; gitignored

// ── What the app refers to ───────────────────────────────────────────────
function referenced() {
  const refs = new Set();
  const html = read('index.html');
  const sw = read('sw.js');
  const isLocal = p => !/^(https?:|data:|mailto:|javascript:|\/\/|#)/.test(p) && !p.includes('${');
  // Any quoted path with a file extension, in either file (catches fetch(),
  // register(), href/src, icon: '…', const X = '…').
  // v8.32: an optional ?query before the closing quote (the engine's ?v= cache-buster); it is not part of the path.
  const re = /['"`]([A-Za-z0-9_.\/-]+\.(?:png|jpe?g|svg|ico|json|webmanifest|js|mjs|css|html|webp|gif|woff2?|mp3|wav))(?:\?[A-Za-z0-9=&_.-]*)?['"`]/g;
  // Comment LINES are skipped: they cite scripts and docs by path ("see
  // scripts/verify-local-dev-hosts.mjs") that the app never loads. Line-based on
  // purpose — a general /* */ stripper would swallow real code after a string
  // like accept="image/*".
  const code = src => src.split('\n').filter(l => !/^\s*(\/\/|\/\*|\*|<!--)/.test(l)).join('\n');
  for (const src of [html, sw]) for (const m of code(src).matchAll(re)) if (isLocal(m[1])) refs.add(m[1].replace(/^\.\//, ''));
  // The manifest's icons, and anything else it names.
  const manifest = JSON.parse(read('manifest.webmanifest'));
  for (const icon of manifest.icons || []) refs.add(icon.src.replace(/^\.\//, ''));
  // The page itself and the service worker's registration.
  refs.add('index.html');
  return refs;
}
const refs = referenced();

function missingFrom(l) { return [...refs].filter(r => !DEV_ONLY.has(r) && !l.includes(r)).sort(); }

// ── 1. Coverage ──────────────────────────────────────────────────────────
check(`every file the app references is published (${[...refs].filter(r => !DEV_ONLY.has(r)).length} referenced)`,
  missingFrom(list).length === 0, `missing from scripts/publish-files.txt: ${missingFrom(list).join(', ')}`);
check('the reference scan finds the files that matter most (sw.js, the manifest, all three icons, the demo data, the engine)',
  ['sw.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png', 'bloc-demo-data.json', 'engine/dist/bloc-engine.js'].every(f => refs.has(f)),
  `found: ${[...refs].sort().join(', ')}`);

// ── 2. Every listed file exists, tracked, once ───────────────────────────
const tracked = new Set(execFileSync('git', ['ls-files'], { cwd: repo, encoding: 'utf8' }).split('\n'));
const untracked = list.filter(f => !tracked.has(f));
check('every listed file is tracked by git (so CI has it)', untracked.length === 0, untracked.join(', '));
check('no file is listed twice', new Set(list).size === list.length);

// ── 2b. Directory mappings (BLOC Coach's build, §139) ────────────────────
check('every mapping line reads `src/ => dest/`', maps.every(m => !m.bad), maps.filter(m => m.bad).map(m => m.bad).join(', '));
const good = maps.filter(m => !m.bad);
// What a build's index.html loads from /bloc-app/… that the build doesn't hold.
function missingRefs(html, src, dest, files) {
  const refs = [...html.matchAll(/(?:src|href)="\/bloc-app\/([^"?#]+)"/g)].map(m => m[1]);
  return { refs, missing: refs.filter(r => !r.startsWith(dest) || !files.includes(src + r.slice(dest.length))) };
}
for (const { src, dest } of good) {
  const files = [...tracked].filter(f => f.startsWith(src));
  check(`${src} → ${dest}: has tracked files, including index.html (${files.length})`, files.includes(src + 'index.html'));
  // Nothing BLOC publishes may sit under the mapped destination: a Coach build must never replace a BLOC file.
  const clash = list.filter(f => f.startsWith(dest));
  check(`${dest} holds no BLOC file`, clash.length === 0 && dest !== '/' && dest !== '', clash.join(', '));
  // Everything the build's index.html loads from its own base is in the build.
  if (files.includes(src + 'index.html')) {
    const { refs, missing } = missingRefs(read(src + 'index.html'), src, dest, files);
    check(`${src}index.html loads only files in the build (${refs.length} referenced)`, refs.length > 0 && missing.length === 0, `missing: ${missing.join(', ')}`);
  }
}
check('BLOC Coach is published at coach/ (Phase 5)', good.some(m => m.src === 'coach/dist/' && m.dest === 'coach/'));

// ── 3. Never published ───────────────────────────────────────────────────
const forbidden = [...list, ...good.map(m => m.src)].filter(f => DEV_ONLY.has(f) || f.startsWith('.github/') || f.startsWith('scripts/')
  || f === 'README.md' || f === 'TECHNICAL.md' || f.startsWith('.') || f.endsWith('.md'));
check('nothing dev-only, internal or documentation is published (dev fixture, .github, scripts, *.md, dotfiles)',
  forbidden.length === 0, forbidden.join(', '));

// ── 4. The workflow's load-bearing properties ────────────────────────────
const wf = read('.github/workflows/pages.yml');
check('CI checks out full history (fetch-depth: 0) — verify controls `git show` older commits', /fetch-depth:\s*0/.test(wf));
check('CI runs the strict sweep script', /bash scripts\/ci-verify\.sh/.test(wf));
check('deploy needs verify: a failing sweep never publishes', /deploy:\s*\n\s*needs:\s*\[[^\]]*verify/.test(wf));
check('deploy runs only once Pages is switched to GitHub Actions (build_type workflow)',
  /if:\s*needs\.pages-mode\.outputs\.build_type == 'workflow'/.test(wf));
check('pull requests verify but never deploy', /pages-mode:\s*\n\s*if:\s*github\.event_name != 'pull_request'/.test(wf));
check('the artifact is built from the list, not the repo', /bash scripts\/ci-assemble-site\.sh _site/.test(wf) && /path:\s*_site/.test(wf));
check('it can be run by hand (workflow_dispatch) for the first deploy after the switch', /workflow_dispatch:/.test(wf));

// ── Controls: each must FAIL coverage ────────────────────────────────────
check('control: a list without sw.js fails coverage', missingFrom(list.filter(f => f !== 'sw.js')).includes('sw.js'));
check('control: D7\'s original list (index.html, demo data only) fails coverage on sw.js, the manifest and the icons',
  ['sw.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png'].every(f => missingFrom(['index.html', 'bloc-demo-data.json']).includes(f)));
check('control: a list without the engine build fails coverage (v8.32)',
  missingFrom(list.filter(f => f !== 'engine/dist/bloc-engine.js')).includes('engine/dist/bloc-engine.js'));

// Control (§139): the build's real index.html, naming one asset the build doesn't hold, must be caught.
{
  const files = [...tracked].filter(f => f.startsWith('coach/dist/'));
  const html = files.includes('coach/dist/index.html') ? read('coach/dist/index.html') : '';
  const doctored = html.replace('</head>', '<script type="module" src="/bloc-app/coach/assets/index-MISSING.js"></script></head>');
  check('control: an index.html naming an asset missing from the build is caught',
    missingRefs(doctored, 'coach/dist/', 'coach/', files).missing.includes('coach/assets/index-MISSING.js'));
}

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
