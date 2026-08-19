#!/usr/bin/env node
// School mode omits; it does not disable.
//
// The distinction is the whole feature. A greyed-out control still names the
// thing it is hiding, and so does a banner explaining a hidden setting, and so
// does a surprise that fires with a note about why it was suppressed. All three
// shipped here at least once before this guard existed.
//
// These are static checks over the source. They cannot prove what renders, but
// they can prove that the code even attempts the distinction — which is what
// went wrong each time.
//
//   node scripts/test-school-mode.mjs

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const NL = String.fromCharCode(10);

let failures = 0;
function check(name, ok, detail = '') {
  if (ok) console.log('  pass  ' + name);
  else { console.error('  FAIL  ' + name + (detail ? ' — ' + detail : '')); failures++; }
}

function read(rel) {
  const p = join(ROOT, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

// ---------- the capabilities the mode must cover ----------

const i18n = read('app/js/i18n.js');
check('the application declares which settings School mode hides', /PLAYFUL_SETTINGS\s*=/.test(i18n));

const REQUIRED = ['language', 'funnyEn', 'funnyZh', 'emojiDialogs', 'vocab'];
const listed = (i18n.match(/PLAYFUL_SETTINGS\s*=\s*\[([^\]]*)\]/) || [, ''])[1];
for (const key of REQUIRED) {
  check('School mode covers ' + key, listed.includes("'" + key + "'"), listed.trim());
}

// ---------- the mode forces English and level 1 ----------

check('School mode forces English presentation',
  /function mode\(\)[\s\S]{0,220}schoolOn\(\)[\s\S]{0,80}return 'English'/.test(i18n));
check('School mode flattens the funny level',
  /function level\([\s\S]{0,160}schoolOn\(\)\)\s*return 1/.test(i18n));

// ---------- the surprise is suppressed, on BOTH surfaces ----------

for (const [label, rel] of [['application', 'app/js/app.js'], ['site', 'docs/assets/js/app.js']]) {
  const src = read(rel);
  const fn = (src.match(/function maybeDimSum\(\)[\s\S]*?\n}/) || [''])[0];
  check('the ' + label + ' dim sum surprise checks School mode', /school/i.test(fn), fn ? 'no school check in maybeDimSum' : 'maybeDimSum not found');
  check('the ' + label + ' dim sum surprise returns before drawing when it is on',
    /school[\s\S]{0,80}return;/.test(fn));
}

// ---------- copy must not name what the mode hides ----------
//
// Every string that names a hidden capability has to sit behind a guard. This
// looks for the guard in the same expression, which is crude but catches the
// case that actually happened: a banner rendered unconditionally.

const settings = read('app/js/pages/settings.js');
check('the funny-level disclosure is gated', /isPlayfulHidden\('funnyEn'\)[\s\S]{0,120}\?\s*null/.test(settings));
check('the vocabulary card is gated', /isPlayfulHidden\('vocab'\)\s*\?\s*null/.test(settings));
check('the Cantonese voice picker is gated', /isPlayfulHidden\('language'\)[\s\S]{0,200}voiceEn/.test(settings));

// The on-state explanation must not enumerate the hidden capabilities.
const onState = (settings.match(/school\.on[\s\S]{0,900}?'It is on'[\s\S]{0,900}?\)\)\)/) || [''])[0];
for (const word of ['funny level', 'Cantonese', 'vocabulary', 'dim sum', 'bilingual']) {
  check('the on-state copy does not name "' + word + '"', !new RegExp(word, 'i').test(onState));
}

// ---------- the site can turn it on, and every surface honours it ----------
//
// The site read this setting from the day it was written and had no control to
// set it: every reader was one line of storage away from a mode nothing on the
// page mentioned, and the disclaimer explaining it sat in the string table
// unreachable by any surface.
//
// Worse, even with the flag forced on, three of the site's four surfaces still
// named the hidden features. The settings page filtered its rows; the features
// page, the documentation list and the command palette all went on listing
// "Dim sum surprise" and "The unlock ladder" by name in their search results —
// the leak the mode exists to prevent, arrived at from three directions.

console.log('');
console.log('the site');

const sitePages = readFileSync(join(ROOT, 'docs', 'assets', 'js', 'pages.js'), 'utf8');
const siteSettings = readFileSync(join(ROOT, 'docs', 'assets', 'js', 'settings.js'), 'utf8');
const sitePalette = readFileSync(join(ROOT, 'docs', 'assets', 'js', 'palette.js'), 'utf8');
const siteContent = readFileSync(join(ROOT, 'docs', 'assets', 'js', 'content.js'), 'utf8');

check('the site has a control that turns School mode on',
  /Turn it on/.test(sitePages) && /school: \{ on: true/.test(sitePages));
check('turning it off needs the PIN it was turned on with',
  /value !== school\.pin/.test(sitePages));
check('a PIN too short to be one is refused',
  /value\.length < 4/.test(sitePages));
check('the disclaimer reaches the page rather than sitting in the string table',
  /i18n\.t\('set\.schoolWhy'\)/.test(sitePages));
check('and it still says this is not a security boundary',
  /not a security boundary/.test(readFileSync(join(ROOT, 'docs', 'assets', 'js', 'i18n.js'), 'utf8')));

check('the playful features are marked on the feature itself',
  (siteContent.match(/playful: true/g) || []).length >= 5,
  'a list kept somewhere else is maintained in one place and forgotten in three');
check('there is one shared filter rather than one per surface',
  /export function withoutHidden/.test(siteSettings));
check('the features page uses it', /withoutHidden\(FEATURES\)/.test(sitePages));
check('the documentation list uses it', /withoutHidden\(DOCS\)/.test(sitePages));
check('the command palette uses it for features',
  /withoutHidden\(FEATURES\)/.test(sitePalette));
check('and for documentation articles', /withoutHidden\(DOCS\)/.test(sitePalette));
check('the settings rows are still filtered too', /hiddenUnderSchool/.test(siteSettings));

// The counts must follow the filtered list, or the page says "12 of 37" while
// showing a list that only ever had 30 in it.
check('the article count is taken from the filtered list, not the whole one',
  /const available = settings\.withoutHidden\(DOCS\)/.test(sitePages) &&
  /available\.length \+ ' articles shown'/.test(sitePages),
  'a count against the unfiltered total leaks the number of hidden items');

console.log('');
if (failures) {
  console.error(failures + ' check(s) failed. School mode is leaking the names of what it hides.');
  process.exit(1);
}
console.log('School mode omits rather than disables, on both surfaces.');
process.exit(0);
