#!/usr/bin/env node
// Every custom property a stylesheet reads must be one a stylesheet defines.
//
// This exists because of a specific failure mode with no symptom. CSS resolves
// `var(--typo)` to nothing at all: no console warning, no parse error, no red
// anywhere. The rule is simply dropped, and the control renders with whatever
// it inherited — which frequently looks plausible. A whole colour picker was
// written against --outline-var, --pri and --on-surf, none of which exist in
// this project's token set, and every one of those declarations would have
// evaporated in silence.
//
// So: collect every property that is DEFINED anywhere, collect every property
// that is READ anywhere, and require the second set to be a subset of the first.
//
//   node scripts/test-tokens.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
let failures = 0;

function check(name, ok, detail = '') {
  if (ok) console.log('  pass  ' + name);
  else { console.error('  FAIL  ' + name + (detail ? ' — ' + detail : '')); failures++; }
}

/**
 * Every file that can read a custom property.
 *
 * JavaScript is included deliberately. This project sets inline styles from
 * script — `el.style.background = 'var(--schigh)'` — and a typo there fails in
 * exactly the same silent way as one in a stylesheet. The first version of this
 * guard scanned only CSS, which left the half of the codebase most likely to
 * carry a hand-typed token name completely unchecked.
 */
function sheets(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'design' || entry === 'dist') continue;
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) sheets(p, found);
    else if (/\.(css|html|js)$/.test(entry)) found.push(p);
  }
  return found;
}

const FILES = [...sheets(join(ROOT, 'docs')), ...sheets(join(ROOT, 'app'))];
check('files were found to check', FILES.length > 0, String(FILES.length));
check('javascript is among them, not only stylesheets',
  FILES.some((f) => f.endsWith('.js')), String(FILES.filter((f) => f.endsWith('.js')).length) + ' js files');

const defined = new Set();
const read = new Map(); // name -> first file that reads it

for (const file of FILES) {
  const src = readFileSync(file, 'utf8');
  // A definition is a property name followed by a colon at the start of a
  // declaration. A read is var(--name). Definitions are taken from stylesheets
  // only: a JS string containing "--x:" is setting a property on an element,
  // which does not make the name valid anywhere else.
  if (/\.(css|html)$/.test(file)) {
    for (const m of src.matchAll(/(^|[;{\s])(--[a-zA-Z0-9-]+)\s*:/g)) defined.add(m[2]);
  }
  for (const m of src.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
    if (!read.has(m[1])) read.set(m[1], file.slice(ROOT.length + 1).split('\\').join('/'));
  }
}

console.log('');
console.log(defined.size + ' properties defined, ' + read.size + ' read');
console.log('');

// A var() may carry its own fallback — var(--x, 12px) — which is a deliberate
// "this may not exist" and is not a typo. Those are still listed, because a
// fallback on a name that never existed is usually a mistake wearing a hat.
const undefinedReads = [...read.keys()].filter((name) => !defined.has(name)).sort();

for (const name of undefinedReads) {
  console.error('  FAIL  ' + name + ' is read in ' + read.get(name) + ' but defined nowhere');
  failures++;
}
check('every property read by a stylesheet is defined by one', undefinedReads.length === 0,
  undefinedReads.length ? undefinedReads.join(', ') : '');

// The reverse direction is a warning, not a failure: a defined-but-unread token
// is usually part of a scheme kept whole on purpose (the full Material palette
// defines pairs whether or not both halves are used yet).
const unread = [...defined].filter((n) => !read.has(n)).sort();
if (unread.length) {
  console.log('');
  console.log('  note  ' + unread.length + ' defined but not read: ' + unread.slice(0, 12).join(', ') +
    (unread.length > 12 ? ', …' : ''));
  console.log('        (not a failure — a palette is kept whole even where half of it is unused)');
}

// The dark scheme has to redefine everything the light scheme sets, or a theme
// switch leaves stale colours behind on whatever it forgot.
const tokens = readFileSync(join(ROOT, 'docs', 'assets', 'css', 'tokens.css'), 'utf8');
function block(pattern) {
  const m = tokens.match(pattern);
  if (!m) return null;
  return new Set([...m[0].matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map((x) => x[1]));
}
const light = block(/:root\s*\{[^}]*\}/);
const dark = block(/\[data-theme="dark"\][^{]*\{[^}]*\}/);

check('a light scheme is defined', Boolean(light && light.size));
check('a dark scheme is defined', Boolean(dark && dark.size));

if (light && dark) {
  // Structural properties (fonts, scale, density, radius) are scheme-agnostic on
  // purpose — a dark theme does not change the typeface. Only colour must be
  // restated, and these are the ones that legitimately are not.
  const STRUCTURAL = /^--(font-|scale|density|radius-scale|elev|checker)/;
  const missing = [...light].filter((n) => !dark.has(n) && !STRUCTURAL.test(n)).sort();
  check('the dark scheme restates every colour the light scheme sets',
    missing.length === 0, missing.join(', '));
}

console.log('');
if (failures) {
  console.error(failures + ' check(s) failed. A var() that names nothing is dropped in silence.');
  process.exit(1);
}
console.log('Every custom property read by a stylesheet is defined by one, in both schemes.');
process.exit(0);
