// ═══════════════════════════════════════════════════════════════════════
// scripts/train-harness.mjs — Train's own functions from an index.html, run in
// Node over a state the caller builds. Used by verify-train-cards.mjs and
// verify-next-week-weight.mjs. Not a verify script itself (the sweep's glob is
// verify*.mjs).
//
// buildTrain(html, engineSrc) extracts renderTrainDay, the set-tick handlers and
// the next-week's-weight sheet, with everything they reach, and runs them
// against a stub document: getElementById hands back a plain object per id
// (innerHTML, value, style, classList), so a render's HTML is read from
// doc.els['train-content'].innerHTML. Stubbed: save() (counted), the Coached
// hooks (Solo), the Train hero, the effort sheet and the sheet open/close.
// Seeds an older index.html doesn't have are left out, so the same checks can
// run against a control build and fail there rather than throw.
// ═══════════════════════════════════════════════════════════════════════

import vm from 'node:vm';
import { mainScript, indexTopLevel, closure } from './golden/extract-engine.mjs';

export const engineOf = src => { const c = {}; vm.runInNewContext(src + '\n;this.BlocEngine = BlocEngine;', c); return c.BlocEngine; };

const SEEDS = ['renderTrainDay', 'toggleSetDone', 'toggleCardioSetDone', 'quickFillComplete', 'quickFillCompleteSuperset',
  'quickFillCompleteDropset', 'toggleExercise', 'getSessionPreviewTarget', 'getProgKey', 'getProgressionLockKey',
  'nextWeightTarget', 'nextWeightButtonHTML', 'openNextWeightSheet', 'saveNextWeight', 'clearNextWeight'];
const STUBS = ['save', 'coachedView', 'trainCoachNoticeHTML', 'applyTrainCoachLock', 'trainViewCoachOwned',
  'renderTrainHero', 'maybeOpenRpeSheet', 'openModal', 'closeModal'];

function makeEl(id) {
  const cls = new Set();
  return {
    id, innerHTML: '', value: '', placeholder: '', textContent: '', style: {}, tabIndex: 0, focus() {},
    classList: { add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c), toggle: (c, on) => ((on ?? !cls.has(c)) ? cls.add(c) : cls.delete(c), cls.has(c)) },
  };
}
export function makeDoc() {
  const els = {};
  return { els, body: { setAttribute() {} }, getElementById: id => (els[id] ||= makeEl(id)), querySelector: () => null, querySelectorAll: () => [] };
}

export function buildTrain(html, engineSrc) {
  const E = engineOf(engineSrc);
  const { decls } = indexTopLevel(mainScript(html));
  const seeds = SEEDS.filter(n => decls.has(n));
  const parts = closure(decls, seeds, new Set(STUBS));
  const have = new Set(parts.map(p => p.name));
  const body = `
    let __saves = 0, __opened = [];
    function save() { __saves++; }
    function coachedView() { return false; }
    function trainCoachNoticeHTML() { return ''; }
    function applyTrainCoachLock() {}
    function trainViewCoachOwned() { return false; }
    function renderTrainHero() {}
    function maybeOpenRpeSheet() {}
    function openModal(id) { __opened.push(id); }
    function closeModal(id) { __opened = __opened.filter(x => x !== id); }
    ${parts.map(p => p.text).join('\n')}
    return {
      fns: { ${seeds.join(', ')} },
      setState: v => { state = v; },
      getState: () => state,
      expanded: () => ${have.has('expandedExercises') ? 'expandedExercises' : '({})'},
      saves: () => __saves, opened: () => __opened.slice(),
    };`;
  const doc = makeDoc();
  const store = {};
  const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const api = new Function('document', 'BlocEngine', 'window', 'localStorage', body)(doc, E, { location: { hostname: 'localhost', search: '' } }, localStorage);
  return Object.assign(api, { E, doc, has: n => seeds.includes(n) });
}

// The cards in a Train render, each as its HTML: split on the card's own
// opening tag, so a card's string runs to the next card.
export function trainCards(doc) {
  const htmlOut = doc.els['train-content'] ? doc.els['train-content'].innerHTML : '';
  return htmlOut.split(/(?=<div class="card ex-card)/).filter(s => s.startsWith('<div class="card ex-card'));
}
