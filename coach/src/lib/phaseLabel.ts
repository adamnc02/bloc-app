// A goal phase's name, short enough for a chart label: BLOC's own rule
// (index.html shortPhaseLabel / stripStepPrefix, TECHNICAL §140), copied
// because moving it into the engine would change BLOC's served bytes.
// 🚨 The copy can't drift: scripts/verify-short-phase-labels.mjs runs this
//    file against BLOC's function over the same names and fails on any
//    difference. It never invents text; every step removes some.

export function stripStepPrefix(label: string): string {
  const stripped = String(label).replace(/^\s*step\s*\d+\s*[-–—:.]\s*/i, '').trim();
  return stripped || label;
}

export function shortPhaseLabel(label: string, max?: number): string {
  max = (typeof max === 'number' && max >= 4) ? max : 11;
  let t = stripStepPrefix(label || '').trim();
  t = t.split(/\s+[—–-]\s+|:\s+/)[0].trim();
  if (t.length <= max) return t;
  const trimmed = t.replace(/\b(phase|period|block|stage|cycle)\b/gi, '').replace(/\s+/g, ' ').trim();
  if (trimmed && trimmed.length <= max) return trimmed;
  const words = (trimmed || t).split(/\s+/);
  const last = words[words.length - 1];
  const lastIsNumber = /^\d+$/.test(last);
  if (words.length > 1 && lastIsNumber) {
    const candidate = words[0] + ' ' + last;
    if (candidate.length <= max + 2) return candidate;
  }
  if (words.length > 1 && !lastIsNumber) {
    const initials = words.slice(0, -1).map((w) => w.charAt(0).toUpperCase()).join('');
    const candidate = initials + ' ' + last;
    if (candidate.length <= max) return candidate;
    if (last.length <= max) return last;
  }
  const head = lastIsNumber && words.length > 1 ? words[0] : (words[0] || t);
  return head.slice(0, max - 1) + '\u2026';
}
