#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-home-planned-line.mjs — Home's "This week" rows show "Planned this
// week avg"
//
// THE BUG THIS PREVENTS: the line quietly disappearing again. v8.16 rebuilt
// Home's "This week" as one card of four rows, and the row template left out
// the "Planned this week avg" line that sat under each bar, although the
// figure was still computed on every render and the tap-info modal still
// explained it. Nothing noticed for four days: every check compared numbers,
// and the numbers hadn't changed. The week's planned meals went out of sight.
// Restored in v8.35 (TECHNICAL §127).
//
// It runs the REAL renderHomeThisWeek() out of index.html (with the committed
// engine build, as the browser does) over the demo, and a variant with meals
// planned ahead, on every day of the week, and requires, for each of the four
// rows:
//   · a "Planned this week avg" line showing exactly the engine's
//     computeHomeWeek(...).weekPlannedAvg, formatted and with the unit;
//   · no line at all when there's no planned figure (no active goal);
//   · the label on the left and the figure on the right (the CSS: a flex row,
//     the value pushed right with margin-left:auto, tabular numbers).
// Control: renderHomeThisWeek without the line must fail.
// ═══════════════════════════════════════════════════════════════════════

process.env.TZ = 'Europe/London';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { mainScript, indexTopLevel, closure } from './golden/extract-engine.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(repo, 'index.html'), 'utf8');
const DIST = readFileSync(join(repo, 'engine', 'dist', 'bloc-engine.js'), 'utf8');
const E = vm.runInNewContext(`${DIST}\n;BlocEngine`, {});

let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok && detail) console.log(`    ${detail}`);
}

function build(src) {
  const { decls } = indexTopLevel(src);
  const parts = closure(decls, ['renderHomeThisWeek'], new Set(['save']));
  const body = `function save() {}\n${parts.map(p => p.text).join('\n')}
    return { render: renderHomeThisWeek, setState: s => { state = s; }, setAnchor: d => { _tourAnchorDate = d; } };`;
  return (Date, document) => new Function('Date', 'document', 'BlocEngine', body)(Date, document, E);
}
const fixedAt = day => { const ms = new Date(day + 'T12:00:00').getTime();
  return class extends Date { constructor(...a) { if (!a.length) super(ms); else super(...a); } static now() { return ms; } }; };
const doc = () => { const els = {}; return { els, getElementById: id => (els[id] ||= { id, innerHTML: '' }) }; };

const demoText = readFileSync(join(repo, 'bloc-demo-data.json'), 'utf8');
const DATASETS = {
  demo: () => E.normaliseState(JSON.parse(demoText)),
  // Logs stop on Wed 29 Jul; meals are planned ahead for Fri and Sat, one a
  // full day, one light (a light planned day is skipped, not counted as zero).
  plannedAhead: () => {
    const s = E.normaliseState(JSON.parse(demoText));
    s.bodyLogs = s.bodyLogs.filter(l => l.date <= '2026-07-29');
    s.nutritionLogs = s.nutritionLogs.filter(l => l.date <= '2026-07-29');
    for (const d of Object.keys(s.nutritionMeals)) if (d > '2026-07-29') delete s.nutritionMeals[d];
    s.nutritionMeals['2026-07-31'] = { breakfast: [{ kcal: 600, protein: 40, carbs: 80, fats: 12 }], dinner: [{ kcal: 1200, protein: 95, carbs: 130, fats: 25 }] };
    s.nutritionMeals['2026-08-01'] = { lunch: [{ kcal: 500, protein: 35, carbs: 50, fats: 15 }] };
    return s;
  },
  noGoal: () => { const s = E.normaliseState(JSON.parse(demoText)); s.goals = []; return s; },
};
const DAYS = ['2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02'];
const UNITS = { kcal: '', protein: 'g', carbs: 'g', steps: '' };

function survey(make) {
  let rows = 0, lines = 0;
  const wrong = [];
  for (const [name, mk] of Object.entries(DATASETS)) {
    for (const day of DAYS) {
      const d = doc();
      const app = make(fixedAt(day), d);
      const s = mk();
      app.setState(s);
      app.setAnchor(null);
      app.render();
      const out = d.els['home-this-week'].innerHTML;
      const week = E.computeHomeWeek(mk(), { today: day });
      for (const m of week.metrics) {
        rows++;
        const row = (out.match(new RegExp(`<div class="metric-row" id="home-metric-card-${m.field}"[\\s\\S]*?\\n    </div>`)) || [''])[0];
        const got = (row.match(/<div class="metric-planned"><span>Planned this week avg<\/span><span class="metric-planned-value"><strong>([^<]*)<\/strong>([^<]*)<\/span><\/div>/) || []);
        if (m.weekPlannedAvg === null) {
          if (/metric-planned/.test(row)) wrong.push(`${name} ${day} ${m.field}: a line with no planned figure`);
        } else {
          lines++;
          const want = [m.weekPlannedAvg.toLocaleString(), UNITS[m.field]];
          if (!row) wrong.push(`${name} ${day} ${m.field}: row not found`);
          else if (got[1] !== want[0] || got[2] !== want[1]) wrong.push(`${name} ${day} ${m.field}: shows ${JSON.stringify(got.slice(1))}, engine says ${JSON.stringify(want)}`);
        }
      }
    }
  }
  return { rows, lines, wrong };
}

const src = mainScript(html);
const r = survey(build(src));
check(`every row shows "Planned this week avg" with the engine's figure (${r.lines} lines over ${r.rows} rows, 3 datasets × 7 days), and none without a goal`,
  r.lines === 56 && r.wrong.length === 0, r.wrong.slice(0, 4).join('\n    '));

// Left and right: a flex row, the value pushed right, numbers aligned.
const css = rule => (html.match(new RegExp(`\\n${rule.replace('.', '\\.')} \\{([^}]*)\\}`)) || [])[1] || '';
check('the label sits left and the figure right, like the row\'s top line (.metric-planned is flex; its value has margin-left:auto and tabular numbers)',
  /display: flex/.test(css('.metric-planned')) && /margin-left: auto/.test(css('.metric-planned-value'))
  && /tabular-nums/.test(css('.metric-planned-value')));

// The tap-info modal explains the same figure, by the same name.
check('the tap-info modal explains "Planned this week avg", the same words as the row',
  /<strong style="color:var\(--text\);">Planned this week avg<\/strong>/.test(html));

// Control: without the line (v8.16's template), the survey must fail.
const stripped = src.replace('${planned}${note}', '${note}');
const c = stripped === src ? null : survey(build(stripped));
check(`control: renderHomeThisWeek without the line is caught (${c ? c.wrong.length : 'could not apply'} rows wrong)`, !!c && c.wrong.length > 0);

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
