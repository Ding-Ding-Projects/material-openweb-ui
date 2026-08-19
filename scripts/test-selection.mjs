#!/usr/bin/env node
// Multi-select, and the one thing about it that loses data.
//
// The sequence is always the same: search, "select all", clear the search,
// delete. Every naive implementation deletes what is selected — which is what
// was asked for and is not what was meant.
//
// There are three ways to handle it and only one is honest. Dropping the
// out-of-view selections silently loses work. Acting on them silently loses
// data. Keeping the selection whole and SAYING how much of it is off-screen
// before anything runs is the third, and it is what these check.
//
//   node scripts/test-selection.mjs

import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const S = await import(pathToFileURL(join(ROOT, 'docs', 'assets', 'js', 'selection.js')).href);

let failures = 0;
function check(name, ok, detail = '') {
  if (ok) console.log('  pass  ' + name);
  else { console.error('  FAIL  ' + name + (detail ? ' — ' + detail : '')); failures++; }
}

const ALL = ['a', 'b', 'c', 'd', 'e', 'f'];
const FILTERED = ['b', 'd'];

// ---------- basics ----------

console.log('basics');

let s = S.create();
check('a new selection is empty', s.size === 0);
s = S.toggle(s, 'a');
check('toggling selects', S.has(s, 'a'));
s = S.toggle(s, 'a');
check('toggling again deselects', !S.has(s, 'a'));
check('toggling returns a new set rather than mutating', (() => {
  const before = S.create(['a']);
  const after = S.toggle(before, 'b');
  return before.size === 1 && after.size === 2;
})());

// ---------- select all means all IN VIEW ----------

console.log('');
console.log('select all means all in view');

const filtered = S.selectAllInScope(S.create(), FILTERED);
check('select-all under a filter selects only what is visible',
  filtered.size === 2 && S.has(filtered, 'b') && S.has(filtered, 'd'),
  [...filtered].join(','));
check('it does NOT reach into the rest of the list',
  !S.has(filtered, 'a') && !S.has(filtered, 'c'), [...filtered].join(','));

const preexisting = S.selectAllInScope(S.create(['f']), FILTERED);
check('a selection made outside the current view survives select-all',
  S.has(preexisting, 'f'), [...preexisting].join(','));

const cleared = S.clearInScope(preexisting, FILTERED);
check('clear-in-view clears only what is visible',
  cleared.size === 1 && S.has(cleared, 'f'), [...cleared].join(','));

const inverted = S.invertInScope(S.create(['b', 'f']), FILTERED);
check('invert flips the visible items only',
  !S.has(inverted, 'b') && S.has(inverted, 'd') && S.has(inverted, 'f'),
  [...inverted].join(','));

// ---------- the sentence that has to be said ----------

console.log('');
console.log('what a bulk action is about to touch');

// The exact sequence: select everything, then filter down to two.
const wide = S.selectAllInScope(S.create(), ALL);
const sum = S.summary(wide, FILTERED, ALL);

check('the total is the whole selection, not just the visible part',
  sum.selected === 6, String(sum.selected));
check('the visible count is right', sum.visible === 2, String(sum.visible));
check('the HIDDEN count is right, and it is the number that matters',
  sum.hidden === 4, String(sum.hidden));
check('a selection made entirely in view reports nothing hidden',
  S.summary(S.create(['b']), FILTERED, ALL).hidden === 0);

const sentence = S.describeScope(sum, { verb: 'delete', noun: 'notification' });
check('the sentence states the total', /6 notifications/.test(sentence), sentence);
check('the sentence states how many are not visible', /4 of them are not visible/.test(sentence), sentence);
check('the sentence names the action rather than saying "these items"',
  /delete/.test(sentence), sentence);
check('with nothing hidden it says so plainly rather than staying silent',
  /all of which are visible/.test(S.describeScope(S.summary(S.create(['b']), FILTERED, ALL), { verb: 'delete', noun: 'notification' })),
  S.describeScope(S.summary(S.create(['b']), FILTERED, ALL), { verb: 'delete', noun: 'notification' }));
check('with nothing selected it says nothing is selected',
  S.describeScope(S.summary(S.create(), FILTERED, ALL)) === 'Nothing is selected.');
check('the singular reads correctly, since it is the common case',
  /1 notification, and 1 of them is not visible/.test(
    S.describeScope(S.summary(S.create(['a']), FILTERED, ALL), { verb: 'delete', noun: 'notification' })),
  S.describeScope(S.summary(S.create(['a']), FILTERED, ALL), { verb: 'delete', noun: 'notification' }));

// ---------- items that vanished underneath ----------

console.log('');
console.log('items that vanished underneath');

const stale = S.summary(S.create(['a', 'gone', 'alsogone']), ALL, ALL);
check('identifiers that no longer exist are counted separately', stale.stale === 2, String(stale.stale));
check('and are NOT counted as selected, so no action claims more than it can touch',
  stale.selected === 1, String(stale.selected));
check('pruning drops them', S.prune(S.create(['a', 'gone']), ALL).size === 1);
check('pruning keeps everything that still exists',
  S.prune(S.create(['a', 'f']), ALL).size === 2);

// ---------- ranges ----------

console.log('');
console.log('shift-click ranges');

const range = S.selectRange(S.create(), ALL, 'b', 'e');
check('a range covers both ends and everything between',
  [...range].sort().join(',') === 'b,c,d,e', [...range].sort().join(','));
check('a range works backwards too',
  [...S.selectRange(S.create(), ALL, 'e', 'b')].sort().join(',') === 'b,c,d,e');
check('a range is taken from the VIEW, so it cannot sweep in hidden rows',
  [...S.selectRange(S.create(), FILTERED, 'b', 'd')].sort().join(',') === 'b,d',
  [...S.selectRange(S.create(), FILTERED, 'b', 'd')].sort().join(','));
check('a range with an endpoint that is not in view changes nothing',
  S.selectRange(S.create(), FILTERED, 'b', 'zzz').size === 0);

// ---------- the tri-state ----------

console.log('');
console.log('the select-all checkbox');

check('with everything in view selected, it reads as fully checked',
  S.summary(S.create(FILTERED), FILTERED, ALL).allInScopeSelected === true);
check('with some selected, it is neither checked nor empty', (() => {
  const partial = S.summary(S.create(['b']), FILTERED, ALL);
  return !partial.allInScopeSelected && !partial.noneInScopeSelected;
})());
check('with none in view selected, it reads as empty even if others are',
  S.summary(S.create(['a']), FILTERED, ALL).noneInScopeSelected === true);
check('an empty view is not reported as fully selected',
  S.summary(S.create(), [], ALL).allInScopeSelected === false);

// ---------- pluralisation ----------
//
// A warning that reads "2 entrys" looks like a bug in the sentence that is
// meant to stop someone making a mistake, and a warning that looks broken is a
// warning people stop reading. This shipped that way until it was seen on
// screen.

console.log('');
console.log('pluralisation');

check('one of something is singular', S.plural(1, 'entry') === '1 entry');
check('a word ending in a consonant plus y takes -ies, not -ys',
  S.plural(2, 'entry') === '2 entries', S.plural(2, 'entry'));
check('a word ending in a vowel plus y just takes -s',
  S.plural(2, 'day') === '2 days', S.plural(2, 'day'));
check('a sibilant takes -es', S.plural(2, 'match') === '2 matches' && S.plural(3, 'box') === '3 boxes');
check('an ordinary word takes -s', S.plural(2, 'item') === '2 items');
check('an irregular plural can be stated outright',
  S.plural(2, 'person', 'people') === '2 people');
check('zero is plural', S.plural(0, 'entry') === '0 entries');
check('the scope sentence uses it', (() => {
  const sentence = S.describeScope(S.summary(S.create(['a', 'b']), [], ['a', 'b']), { verb: 'delete', noun: 'entry' });
  return /2 entries/.test(sentence) && !/entrys/.test(sentence);
})(), S.describeScope(S.summary(S.create(['a', 'b']), [], ['a', 'b']), { verb: 'delete', noun: 'entry' }));

// ---------- the bar cannot skip the sentence ----------

console.log('');
console.log('the shared bar');

const barSource = readFileSync(join(ROOT, 'docs', 'assets', 'js', 'bulk.js'), 'utf8');
check('one bar is shared rather than a select-all per list',
  /export function bulkBar/.test(barSource));
check('the bar renders the hidden-count warning itself, so no list can omit it',
  /sum\.hidden/.test(barSource) && /not visible here/.test(barSource));
// The out-of-view confirmation is NOT optional, and this is the assertion that
// says so. An earlier version wrote the condition as
// `action.confirm !== false && (action.danger || sum.hidden)`, which let an
// action opting out of the routine confirmation opt out of this one too — so a
// label action reached three entries while showing a dialog that mentioned
// neither of the two it could not display.
// Read as a whole line rather than by balancing brackets: the condition has a
// nested group, and a bracket-counting regex silently matched nothing at all —
// which would have made this check pass on any source whatsoever.
const confirmLine = barSource.split(String.fromCharCode(10)).find((l) => l.includes('sum.hidden ||') || l.includes('sum.hidden||')) || '';
check('the out-of-view warning is a reason to confirm all by itself',
  /if \(\s*sum\.hidden\s*\|\|/.test(confirmLine), confirmLine.trim() || 'no such line');
check('opting out of confirmation cannot opt out of the out-of-view warning',
  !/confirm !== false && \(action\.danger \|\| sum\.hidden\)/.test(barSource),
  confirmLine.trim());
check('a routine confirmation can still be suppressed for an action with its own dialog',
  /action\.confirm !== false/.test(barSource));
check('the bar pluralises through the shared helper rather than appending an s',
  /sel\.plural\(/.test(barSource) && !/noun \+ 's'/.test(barSource),
  (barSource.match(/noun \+ 's'/g) || []).join(','));
check('the confirmation uses the shared sentence rather than its own wording',
  /describeScope\(sum/.test(barSource));
check('stale selections are reported in the confirmation rather than silently skipped',
  /sum\.stale/.test(barSource));
check('every list gets export in every format, not a JSON-only shortcut',
  /formats\.FORMATS\.map/.test(barSource));
// Export bypassed the confirmation entirely at first, which meant it bypassed
// the out-of-view warning too — and an export that includes rows the filter is
// hiding, while saying it honours the filter, is the exact bug this bar was
// written to replace on the documentation site.
// Scoped to the function body rather than a character window: a fixed window
// is a guess about how long the function is, and it goes wrong the moment
// anything is added above the line being looked for.
const exportBody = barSource.slice(
  barSource.indexOf('function exportDialog()'),
  barSource.indexOf('  paint();', barSource.indexOf('function exportDialog()'))
);
check('the export dialog body was found', exportBody.length > 200, String(exportBody.length));
check('the export dialog states its scope in the same words an action does',
  /describeScope\(sum/.test(exportBody),
  'export is not destructive, but it is the path where the original defect lived');
check('and it warns when the file will contain rows that are not on screen',
  /sum\.hidden/.test(exportBody));

console.log('');
if (failures) {
  console.error(failures + ' check(s) failed. This is the module where a mistake deletes something.');
  process.exit(1);
}
console.log('A selection survives a filter change, and no bulk action runs without saying what it cannot show you.');
process.exit(0);
