#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-brand-palette-split.mjs
//
// THE BUG THIS PREVENTS: the logo's green leaking into the app, or the app's
// lavender leaking back into the logo.
//
// v8.18 took HALF of a design experiment (index-green.html): the green Bracket
// logo, app icon and splash — but NOT its app-wide recolour. Adam's call: "The
// logo stays green, but the app accent colours remain as they are." That
// experiment changed one token and eighteen hard-coded rgba() glows, so the
// two halves sit a few lines apart and look alike. Two ways it breaks:
//
//   1. Someone "finishes" the green by re-applying the rest of the experiment
//      (--accent → #2fb98a). The app turns green. Nothing errors.
//   2. Someone "tidies" the splash back onto one token. --splash-accent paints
//      the Train block, which Adam asked to keep lavender; the brackets and
//      OVERCOME use --splash-brand. Collapse them and one side is wrong.
//
// v8.19 swapped the Bracket logo for the Rebuild kit (three stacked bars, the
// top one green): the brackets are gone, and the bars now carry the green.
// The palette split itself is unchanged.
//
// Also pins the app icon to the brand kit's tile by content hash, and
// the Settings logo to the back-link row: in the title row it sits on top of
// "Settings" on a 375px phone (measured, v8.18).
//
// A control at the end re-applies the experiment's --accent change and asserts
// the check then fails.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'index.html'), 'utf8');

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) console.log(`    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// The body of the first rule with this exact selector line.
function block(src, selector) {
  const i = src.indexOf(`\n${selector} {`);
  if (i < 0) return null;
  return src.slice(i, src.indexOf('\n}', i));
}
const token = (body, name) => body && (body.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})`)) || [])[1];

function appAccentIsLavender(src) {
  const root = block(src, ':root');
  const light = block(src, '[data-mode="light"]');
  return token(root, '--accent') === '#9184d9'
    && token(root, '--accent2') === '#b5abfc'
    && token(root, '--purple') === '#b5abfc'
    && token(light, '--accent2') === '#6f5cc4'
    && token(light, '--purple') === '#6f5cc4'
    && token(light, '--accent') === undefined;   // light mode inherits the dark accent
}

console.log('App accent — unchanged lavender');
check('dark + light accent tokens are the pre-v8.18 values', appAccentIsLavender(source), true);
const glowsOutsideSplash = source.split('#splash {')[0].match(/rgba\(47,\s*185,\s*138/g) || [];
check('no green glow before the splash block (the 18 app glows stay lavender)', glowsOutsideSplash.length, 0);

console.log('\nSplash — Train lavender, brand green on the top bar and OVERCOME');
const splash = block(source, '#splash');
check('--splash-accent (the Train block) is the original lavender', token(splash, '--splash-accent'), '#A79EE3');
check('--splash-brand is the logo green', token(splash, '--splash-brand'), '#2fb98a');
check('Train block paints with --splash-accent', /#splash \.c-train\s*\{[^}]*var\(--splash-accent\)/.test(source), true);
check('top bar paints with --splash-brand', /#splash \.sb-3 \{ fill: var\(--splash-brand\); \}/.test(source), true);
check('neutral bars paint with --splash-block', /#splash \.sbar \{[^}]*fill: var\(--splash-block\)/.test(source), true);
check('three logo bars in the splash markup, bottom → top', (source.match(/<rect class="sbar sb-[123]"/g) || []).length, 3);
check('no v8.18 bracket corners left', /class="brk /.test(source), false);

console.log('\nApp icon — the Rebuild kit tile');
const icon = (source.match(/<link rel="apple-touch-icon" href="data:image\/png;base64,([^"]+)"/) || [])[1];
const iconHash = icon && createHash('sha256').update(Buffer.from(icon, 'base64')).digest('hex').slice(0, 16);
check('apple-touch-icon is bloc-brand-rebuild/icon/apple-touch-icon-1024.png', iconHash, '34ee21cf75e7f96e');

console.log('\nSettings logo — in the back-link row, not the title row');
const topbar = source.slice(source.indexOf('<div class="settings-topbar">'), source.indexOf('<div class="page-head">', source.indexOf('<div class="settings-topbar">')));
check('the logo sits inside .settings-topbar', topbar.includes('class="settings-logo"'), true);
check('the back link is still there (the only way out of Settings)', topbar.includes(`onclick="showScreen('home')"`), true);
check('exactly one Settings logo', (source.match(/class="settings-logo"/g) || []).length, 1);
// v8.19 §102 — the splash animation replays on the Settings logo each time it
// comes into view. The restart needs remove → reflow → add; drop the reflow and
// the browser coalesces the two class changes and nothing replays.
const logoInit = source.slice(source.indexOf('function initSettingsLogoAnimation()'), source.indexOf('function initSettingsLogoAnimation()') + 900);
check('Settings logo bars carry lb-1..lb-3 (bottom → top)', (topbar.match(/class="logo-bar[^"]*lb-[123]"/g) || []).length, 3);
check('an IntersectionObserver replays it on every entry into view', /new IntersectionObserver/.test(logoInit) && /observe\(logo\)/.test(logoInit), true);
check('replay is remove → reflow → add', /classList\.remove\('animate'\);\s*void logo\.getBoundingClientRect\(\);\s*logo\.classList\.add\('animate'\)/.test(logoInit), true);
check('Settings logo bars follow the theme tokens', /\.settings-logo \.logo-bar \{ fill: var\(--logo-block\); \}/.test(source) && /\.settings-logo \.logo-bar-top \{ fill: var\(--logo-accent\); \}/.test(source), true);

console.log('\nControl — re-apply the experiment\'s accent change');
const recoloured = source.replace('--accent: #9184d9;', '--accent: #2fb98a;');
check('the accent check catches it', appAccentIsLavender(recoloured), false);

console.log(failures ? `\n✗ ${failures} failed` : '\n✓ Logo green and app lavender are still separate.');
process.exit(failures ? 1 : 0);
