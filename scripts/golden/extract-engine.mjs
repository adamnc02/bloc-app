// ═══════════════════════════════════════════════════════════════════════
// scripts/golden/extract-engine.mjs — lift REAL functions out of index.html
//
// Used by verify-engine-golden.mjs (TECHNICAL §118).
//
// The other verify scripts extract a handful of functions with a plain brace
// counter. That is fine for five functions and wrong for eighty: a `{` inside a
// string, a template literal or a regex (`/[{}]/`) throws the count off and
// silently returns half a function, or two. This one lexes the main <script>
// properly (strings, nested template `${}`, comments, regex literals), indexes
// every TOP-LEVEL declaration, and follows identifier references from a seed
// list to collect the whole closure the seeds need, stopping at names the
// caller stubs.
//
// 🚨 It is checked, not trusted: indexTopLevel() refuses to return unless
// every top-level declaration it found parses on its own (`new vm.Script`).
// A lexing mistake therefore fails loudly here instead of producing a golden
// file built from mangled source.
// ═══════════════════════════════════════════════════════════════════════

import vm from 'node:vm';

// The one big inline <script> (index.html has several small ones before it).
export function mainScript(html) {
  const re = /<script>([\s\S]*?)<\/script>/g;
  let best = '';
  for (let m; (m = re.exec(html));) if (m[1].length > best.length) best = m[1];
  if (best.length < 100000) throw new Error('main <script> not found in index.html');
  return best;
}

const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete',
  'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
const REGEX_AFTER_CHAR = new Set([...'(,=:[!&|?{};+-*%<>~^']);
const isIdStart = c => /[A-Za-z_$]/.test(c);
const isId = c => /[A-Za-z0-9_$]/.test(c);

// Walks `src` and calls onCode(i, depth) for every character that is CODE (not
// inside a string, template text, comment or regex), with the brace/paren/
// bracket depth at that point. Returns the list of identifier tokens found in
// code as {name, start, afterDot}.
export function lex(src, onCode) {
  const ids = [];
  let depth = 0;
  // Stack of what each open `{` belongs to: 'b' = a block/object, 't' = a
  // template `${`, so its closing `}` returns into template text.
  const stack = [];
  let lastSig = '';   // last significant code char
  let lastWord = '';  // last identifier/keyword, if lastSig ended one
  let i = 0;
  const n = src.length;

  function template() {
    // i is just past the opening backtick (or a `}` closing `${`).
    while (i < n) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { i++; return 'end'; }
      if (c === '$' && src[i + 1] === '{') { i += 2; stack.push('t'); depth++; return 'expr'; }
      i++;
    }
    throw new Error('unterminated template');
  }

  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); if (e < 0) throw new Error('unterminated comment'); i = e + 2; continue; }
    if (c === '"' || c === "'") {
      i++;
      while (i < n && src[i] !== c) { if (src[i] === '\\') i++; if (src[i] === '\n') throw new Error(`newline in string at ${i}`); i++; }
      i++; lastSig = c; lastWord = ''; continue;
    }
    if (c === '`') {
      i++;
      if (template() === 'end') { lastSig = '`'; lastWord = ''; }
      else { lastSig = '{'; lastWord = ''; }
      continue;
    }
    if (c === '/') {
      const regexOk = lastSig === '' || REGEX_AFTER_CHAR.has(lastSig) || (lastWord && REGEX_AFTER_WORD.has(lastWord));
      if (regexOk) {
        i++;
        let inClass = false;
        while (i < n) {
          const r = src[i];
          if (r === '\\') { i += 2; continue; }
          if (r === '\n') throw new Error(`newline in regex at ${i}`);
          if (inClass) { if (r === ']') inClass = false; }
          else if (r === '[') inClass = true;
          else if (r === '/') break;
          i++;
        }
        i++;
        while (i < n && isId(src[i])) i++; // flags
        lastSig = ')'; lastWord = ''; // a regex is a value
        continue;
      }
    }
    if (/\s/.test(c)) { i++; continue; }
    if (isIdStart(c)) {
      const start = i;
      while (i < n && isId(src[i])) i++;
      const name = src.slice(start, i);
      // `.name` / `?.name` is a property access. Judged from the last CODE
      // token, never the raw text: a comment ending in a full stop on the line
      // above would otherwise make the next `function` look like `.function`.
      const afterDot = lastSig === '.';
      ids.push({ name, start, afterDot });
      if (onCode) for (let k = start; k < i; k++) onCode(k, depth);
      lastSig = 'a'; lastWord = name;
      continue;
    }
    if (/[0-9]/.test(c)) { while (i < n && /[0-9A-Za-z_.]/.test(src[i])) i++; lastSig = '0'; lastWord = ''; continue; }
    if (c === '.' && /[0-9]/.test(d)) { i++; while (i < n && /[0-9A-Za-z_]/.test(src[i])) i++; lastSig = '0'; lastWord = ''; continue; }
    if (c === '.' && d === '.' && src[i + 2] === '.') { i += 3; lastSig = ','; lastWord = ''; continue; } // spread: a value follows
    // punctuation
    if (onCode) onCode(i, depth);
    if (c === '{' || c === '(' || c === '[') { depth++; if (c === '{') stack.push('b'); }
    else if (c === ')' || c === ']') depth--;
    else if (c === '}') {
      depth--;
      const kind = stack.pop();
      if (kind === 't') {
        i++;
        if (template() === 'end') { lastSig = '`'; lastWord = ''; }
        else { lastSig = '{'; lastWord = ''; }
        continue;
      }
    }
    lastSig = c; lastWord = '';
    i++;
  }
  if (depth !== 0) throw new Error(`unbalanced source: depth ${depth} at end`);
  return ids;
}

// Index every top-level function / const / let / var declaration:
//   name → { kind, start, end, text }
// `end` is exclusive. Functions end at their closing brace; variables at the
// first `;` back at depth 0 (every top-level variable in index.html ends in
// one — the parse check below would catch one that did not).
export function indexTopLevel(src) {
  const depthAt = new Int32Array(src.length).fill(-1);
  const ids = lex(src, (i, d) => { depthAt[i] = d; });
  const decls = new Map();
  const dupes = [];
  const add = (name, rec) => { if (decls.has(name)) dupes.push(name); decls.set(name, rec); };

  for (let k = 0; k < ids.length; k++) {
    const t = ids[k];
    if (depthAt[t.start] !== 0 || t.afterDot) continue;
    let kind = null, nameTok = null, declStart = t.start;
    if (t.name === 'function') { kind = 'function'; nameTok = ids[k + 1]; }
    else if (t.name === 'async' && ids[k + 1] && ids[k + 1].name === 'function') { kind = 'function'; nameTok = ids[k + 2]; }
    else if (t.name === 'const' || t.name === 'let' || t.name === 'var') {
      const next = ids[k + 1];
      // Only `const NAME =` / `let NAME;` — a destructuring top-level would need handling here.
      const between = next ? src.slice(t.start + t.name.length, next.start) : '';
      if (next && /^\s+$/.test(between)) { kind = t.name; nameTok = next; }
    }
    if (!kind || !nameTok) continue;
    // A declaration starts a statement: only whitespace/newline before it on its line.
    const lineStart = src.lastIndexOf('\n', declStart - 1) + 1;
    if (src.slice(lineStart, declStart).trim() !== '') continue;

    let end = -1;
    if (kind === 'function') {
      const paren = src.indexOf('(', nameTok.start);
      // find the body's `{` at depth 0 after the parameter list
      for (let q = paren; q < src.length; q++) if (src[q] === '{' && depthAt[q] === 0 && q > paren) {
        // walk to the matching `}` (depth returns to 0 on a `}`)
        for (let r = q + 1; r < src.length; r++) if (src[r] === '}' && depthAt[r] === 1) { end = r + 1; break; }
        break;
      }
    } else {
      for (let q = nameTok.start; q < src.length; q++) if (src[q] === ';' && depthAt[q] === 0) { end = q + 1; break; }
    }
    if (end < 0) throw new Error(`could not find the end of ${kind} ${nameTok.name}`);
    add(nameTok.name, { name: nameTok.name, kind, start: declStart, end, text: src.slice(declStart, end) });
  }

  const unparsable = [];
  for (const d of decls.values()) {
    try { new vm.Script(d.text); } catch (e) { unparsable.push(`${d.kind} ${d.name}: ${e.message}`); }
  }
  if (unparsable.length) throw new Error(`extracted declarations that do not parse:\n  ${unparsable.slice(0, 10).join('\n  ')}`);
  // A declaration that ran on into the next one would still parse (two
  // functions back to back are valid), so also refuse any overlap.
  const sorted = [...decls.values()].sort((a, b) => a.start - b.start);
  for (let k = 1; k < sorted.length; k++) if (sorted[k].start < sorted[k - 1].end) {
    throw new Error(`${sorted[k - 1].name} runs into ${sorted[k].name}`);
  }
  return { decls, dupes, ids, depthAt };
}

// Free top-level names a declaration refers to (identifiers that are not a
// property access and name another top-level declaration).
export function referencesOf(text, decls) {
  const out = new Set();
  for (const t of lex(text)) if (!t.afterDot && decls.has(t.name)) out.add(t.name);
  return out;
}

// The closure of `seeds` over top-level references, excluding `stubs` (the
// caller defines those itself). Returns declarations in SOURCE ORDER, so a
// `const` is defined before anything that runs at definition time reads it.
export function closure(decls, seeds, stubs = new Set()) {
  const want = new Set();
  const queue = [...seeds];
  while (queue.length) {
    const name = queue.shift();
    if (want.has(name) || stubs.has(name)) continue;
    const d = decls.get(name);
    if (!d) throw new Error(`seed or reference ${name} is not a top-level declaration in index.html`);
    want.add(name);
    for (const r of referencesOf(d.text, decls)) if (!want.has(r) && !stubs.has(r)) queue.push(r);
  }
  return [...want].map(n => decls.get(n)).sort((a, b) => a.start - b.start);
}
