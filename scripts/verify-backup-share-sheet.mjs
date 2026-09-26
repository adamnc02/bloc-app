#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-backup-share-sheet.mjs
//
// THE BUG THIS PREVENTS: Settings → Export → Local opening iOS's Quick Look
// page (a black screen with the file and "More…") instead of the Share Sheet
// (Save to Files, AirDrop…). Reported 2026-09-26; fixed in v8.19 (§100).
//
// A bare `<a download>` click is what iOS Safari renders as Quick Look.
// `navigator.share({ files: [file] })` opens the Share Sheet — the mechanism
// personal-ledger's backup uses, proven on Adam's phone.
//
// Checks: shareOrDownloadFile() shares when it can; a dismissed sheet
// (AbortError) does NOT also download; any other failure, or no file
// sharing, falls back to the download; and every JSON export — the backup
// above all — goes through it, with no bare `a.download` left anywhere else.
// The control swaps exportData back to a plain download and asserts failure.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'index.html'), 'utf8');

function extractFrom(src, marker) {
  const start = src.indexOf(marker);
  if (start === -1) return null;
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  return null;
}

const helper = extractFrom(source, 'async function shareOrDownloadFile(');
if (!helper) { console.error('✗ FAIL: shareOrDownloadFile() not found in index.html.'); process.exit(1); }

let failures = 0;
function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) console.log(`✓ ${name}`);
  else { console.log(`✗ FAIL: ${name} — expected ${w}, got ${g}`); failures++; }
}

async function run({ canShare, shareError }) {
  const log = [];
  const navigator = canShare === undefined ? {} : {
    canShare: () => canShare,
    share: async (d) => { log.push('share:' + d.files[0].name); if (shareError) { const e = new Error('x'); e.name = shareError; throw e; } },
  };
  const document = {
    createElement: () => ({ click() { log.push('download:' + this.download); } }),
    body: { appendChild() {}, removeChild() {} },
  };
  const URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
  // eslint-disable-next-line no-new-func
  const fn = new Function('navigator', 'document', 'URL', 'Blob', 'File', `${helper}\nreturn shareOrDownloadFile;`)(
    navigator, document, URL, Blob, File);
  await fn('{}', 'bloc-backup-2026-09-26.json', 'application/json');
  return log;
}

function exportsChecks(src, quiet) {
  const log = console.log; if (quiet) console.log = () => {};
  const before = failures;
  const exp = extractFrom(src, 'function exportData() {') || '';
  check('exportData() saves through shareOrDownloadFile', exp.includes('shareOrDownloadFile('), true);
  for (const fn of ['function exportFoodLibrary() {', 'function exportLibrary() {', 'async function handleDownloadMyData() {', 'function _shareOrDownload(item) {']) {
    check(`${fn.replace(/ \{$/, '')} goes through shareOrDownloadFile`, (extractFrom(src, fn) || '').includes('shareOrDownloadFile('), true);
  }
  // The only `a.download =` outside the helper would be a new Quick Look path.
  // (The bundled ZXing library line is minified and has none.)
  const withoutHelper = src.replace(extractFrom(src, 'async function shareOrDownloadFile(') || '', '');
  check('no bare `a.download =` outside the helper', (withoutHelper.match(/\ba\.download\s*=/g) || []).length, 0);
  if (quiet) console.log = log;
  return failures - before;
}

console.log('— The helper —');
check('can share files → Share Sheet, no download', await run({ canShare: true }), ['share:bloc-backup-2026-09-26.json']);
check('sheet dismissed (AbortError) → nothing else', await run({ canShare: true, shareError: 'AbortError' }), ['share:bloc-backup-2026-09-26.json']);
check('share refused (NotAllowedError) → falls back to download', await run({ canShare: true, shareError: 'NotAllowedError' }), ['share:bloc-backup-2026-09-26.json', 'download:bloc-backup-2026-09-26.json']);
check('cannot share files → download', await run({ canShare: false }), ['download:bloc-backup-2026-09-26.json']);
check('no Web Share at all (desktop) → download', await run({}), ['download:bloc-backup-2026-09-26.json']);

console.log('\n— Every JSON export uses it —');
exportsChecks(source);

// ── Control: the pre-v8.19 exportData must fail ──────────────────────────
const oldExport = `function exportData() {
  const payload = JSON.stringify(state, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = \`bloc-backup-\${getLocalToday()}.json\`;
  a.click();
}`;
const reverted = source.replace(extractFrom(source, 'function exportData() {'), oldExport);
const realFailures = failures;
const controlFailures = exportsChecks(reverted, true);
failures = realFailures;
if (reverted === source) { console.log('✗ FAIL: control could not replace exportData'); failures++; }
else if (!controlFailures) { console.log('✗ FAIL: control — a plain-download exportData still passed'); failures++; }
else console.log(`✓ control: the pre-v8.19 plain-download backup fails ${controlFailures} check(s), as it should`);

if (failures) { console.log(`\n✗ ${failures} failure(s)`); process.exit(1); }
console.log('\nAll checks passed.');
