#!/usr/bin/env node
// The accessibility rules that can be checked without a browser.
//
// Some of this contract can only be confirmed by measuring a real render, and
// that was done: every interactive control was measured at 100, 125, 150 and
// 200 per cent scale and in bilingual mode, and five kinds of control were
// found under the 24-pixel target minimum — text inputs at 18, date inputs at
// 22, checkboxes at the browser's default 13, small text buttons at 23, and the
// changelog's commit links at 20. None of them LOOKED wrong. They were simply
// too small to hit, which is invisible to reading the code and invisible to
// looking at the page.
//
// What this file does is hold the rules that fixed them in place, so the next
// control added starts out large enough rather than waiting for another audit.
//
//   node scripts/test-a11y.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
let failures = 0;
function check(name, ok, detail = '') {
  if (ok) console.log('  pass  ' + name);
  else { console.error('  FAIL  ' + name + (detail ? ' — ' + detail : '')); failures++; }
}

function walk(dir, ext, found = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'design') continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, ext, found);
    else if (ext.test(entry)) found.push(p);
  }
  return found;
}

const css = [...walk(join(ROOT, 'docs'), /\.css$/), ...walk(join(ROOT, 'app'), /\.css$/)]
  .map((f) => readFileSync(f, 'utf8')).join('\n');
const js = [...walk(join(ROOT, 'docs'), /\.js$/), ...walk(join(ROOT, 'app'), /\.js$/)]
  .map((f) => readFileSync(f, 'utf8')).join('\n');
const html = [...walk(join(ROOT, 'docs'), /\.html$/), ...walk(join(ROOT, 'app'), /\.html$/)]
  .map((f) => readFileSync(f, 'utf8')).join('\n');

// ---------- focus ----------

console.log('focus');

check('a focus style is defined', /:focus-visible/.test(css));
check('there is a catch-all focus rule, so a new control is covered by default',
  /(^|[^.\w-])\*?:focus-visible/m.test(css) || /^\s*:focus-visible/m.test(css),
  'a per-component list would leave the next component uncovered');
check('focus-visible is used rather than plain focus, so a mouse click does not ring everything',
  (css.match(/:focus\b(?!-visible)/g) || []).length <= (css.match(/:focus-visible/g) || []).length,
  (css.match(/:focus\b(?!-visible)/g) || []).length + ' plain vs ' + (css.match(/:focus-visible/g) || []).length + ' visible');
check('the focus ring is thick enough to see', /outline:\s*[23](\.\d+)?px|outline-width:\s*[23]/.test(css));
check('the focus ring is offset from the control rather than sitting on its edge',
  /outline-offset/.test(css));
// Removing an outline is fine; removing it with nothing in its place is not.
//
// The substitute usually lives on a DIFFERENT rule — a borderless input inside
// a bordered wrapper gets its ring from the wrapper's :focus-within, not from
// itself. An earlier version of this check looked only inside the same block
// and so failed two perfectly correct wrappers, while the one genuine offender
// (the command palette's input, which really did remove its outline and put
// nothing anywhere) was lost in the noise.
//
// So: for every rule that removes an outline, some focus rule must exist for a
// class in the same component.
const focusRules = (css.match(/[^{}]+:focus(-visible|-within)?[^{]*\{[^}]*\}/g) || []).join(' ');
const stripped = [];
for (const m of css.matchAll(/([^{}]+)\{([^}]*outline:\s*(?:none|0)[^}]*)\}/g)) {
  const selector = m[1].trim();
  const classes = [...selector.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)].map((c) => c[1]);
  if (!classes.length) continue;
  // The component a class belongs to, so a wrapper's rule counts for its child.
  const components = [...new Set(classes.map((c) => c.split('__')[0]))];
  // Plain string matching rather than a built regex. The component name is
  // arbitrary text, and every attempt at escaping it through this project's
  // shell layers has lost a backslash somewhere; `includes` cannot.
  const covered = components.some((component) => focusRules.includes('.' + component));
  if (!covered) stripped.push(selector.replace(/\s+/g, ' ').slice(0, 60));
}
check('nothing removes the outline without putting something in its place',
  stripped.length === 0, stripped.join(' | '));

// ---------- target size ----------

console.log('');
console.log('target size');

check('text and date inputs have a minimum height',
  /input\[type="date"\][\s\S]{0,400}min-height/.test(css) || /min-height:\s*2[4-9]px[\s\S]{0,200}/.test(css),
  'measured at 18px and 22px before this rule existed');
check('checkboxes and radios are sized explicitly rather than left at the browser default',
  /input\[type="checkbox"\][\s\S]{0,200}(width|height)/.test(css),
  'the default is 13x13, which no padding can enlarge');
check('small buttons carry a minimum height',
  /\.btn--sm[\s\S]{0,200}min-height/.test(css));
check('the rule lives on the SHARED sheet, so both surfaces get it',
  /input\[type="checkbox"\]/.test(readFileSync(join(ROOT, 'docs', 'assets', 'css', 'site.css'), 'utf8')),
  'putting it only in the application would leave the site behind');

// ---------- motion ----------

console.log('');
console.log('motion');

check('reduced motion is honoured', /prefers-reduced-motion/.test(css));
// Either `none` or a near-zero duration counts. The near-zero form is the
// established idiom and is arguably the better one: it keeps animationend and
// transitionend firing, so any listener waiting on one still runs instead of
// hanging forever. An assertion demanding `none` would have failed a correct
// implementation and pushed it toward a worse one.
check('and it actually stops animation rather than merely mentioning it',
  /prefers-reduced-motion[\s\S]{0,400}(animation|transition)[a-z-]*:\s*(none|0|0m?s|\.\d+m?s)/.test(css),
  (css.match(/prefers-reduced-motion[\s\S]{0,200}/) || [''])[0].replace(/\s+/g, ' ').slice(0, 120));
check('the reduced-motion rule applies to everything, not a hand-listed set',
  /prefers-reduced-motion[\s\S]{0,200}\*,\s*\*::before/.test(css),
  'a list of components goes stale the moment one is added');

// ---------- structure ----------

console.log('');
console.log('structure');

check('every page has a skip link', /skip-link/.test(css) && /skip-link/.test(html));
check('the skip link is visible when focused rather than permanently hidden',
  /skip-link:focus/.test(css));
check('the main region is labelled', /role="main"|<main/.test(html));
check('the document declares a language', /<html[^>]+lang=/.test(html));

// ---------- no colour-only meaning ----------

console.log('');
console.log('meaning is never colour alone');

// Each of these renders a state. A state conveyed only by colour is invisible
// to a large number of people and to anyone printing the page.
check('a status chip carries text, not only a colour',
  /statusChip[\s\S]{0,300}(state|label|textContent|,\s*state)/.test(js));
check('the contrast grade is stated in words as well as a colour',
  /cp__grade/.test(js) && /grade\(ratio\)/.test(js));
check('a failing lock or error state carries an icon beside its colour',
  /state--bad[\s\S]{0,120}icon\(/.test(js) || /icon\('warn'\)[\s\S]{0,120}state--bad/.test(js) ||
  (js.match(/state state--bad' \}, icon\(/g) || []).length > 0,
  'colour alone is not a message');
check('the one-time-code countdown is not colour-only',
  /countdown[\s\S]{0,200}left \+ 's left/.test(js), 'it prints the seconds');

// ---------- wide content ----------

console.log('');
console.log('wide content');

check('wide content scrolls inside its own container',
  /overflow-x:\s*auto/.test(css));
check('the page body itself never scrolls sideways',
  /overflow-x:\s*hidden/.test(css) || /html,\s*body[\s\S]{0,120}overflow:\s*hidden/.test(css));

console.log('');
if (failures) {
  console.error(failures + ' check(s) failed.');
  process.exit(1);
}
console.log('Focus is visible, targets are large enough, motion is optional, and no state is colour alone.');
process.exit(0);
