#!/usr/bin/env node
// The regex builder is anchored to the field you were already typing in.
//
// The contract rules out "opening as a detached dialog somewhere else", and the
// command palette was doing precisely that without anyone noticing: it built a
// searchField purely to borrow its builder, never mounted that field, and then
// anchored the popover to a button that was not in the document. A detached
// element's bounding rect is all zeros, so the panel clamped to the top-left
// corner of the window instead of appearing beside the palette's own field.
//
// Nothing errored. The builder opened, worked, and applied its pattern — it was
// simply in the wrong corner of the screen, which is the kind of thing that
// reads as a styling quirk rather than as the contract being broken.
//
//   node scripts/test-regex.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
let failures = 0;
function check(name, ok, detail = '') {
	if (ok) console.log('  pass  ' + name);
	else {
		console.error('  FAIL  ' + name + (detail ? ' — ' + detail : ''));
		failures++;
	}
}

const regexSrc = readFileSync(join(ROOT, 'docs', 'assets', 'js', 'regex.js'), 'utf8');
const paletteSrc = readFileSync(join(ROOT, 'docs', 'assets', 'js', 'palette-core.js'), 'utf8');

// Source-shape checks read a whitespace-normalised copy and tolerate either
// quote style. Layout and quoting are a formatter's business; what these
// assertions are actually about is which expressions exist and in what order.
// Written against the raw text, they all turned red the first time the
// repository was formatted — on code that had not changed at all.
const flat = (t) => t.replace(/\s+/g, ' ');
const regexFlat = flat(regexSrc);
const paletteFlat = flat(paletteSrc);

// ---------- the builder ----------

console.log('the builder');

check(
	'plain text is the default and regex is opted into',
	/useRegex:\s*false/.test(regexSrc),
	'a field that starts in regex mode surprises everyone'
);
check(
	'the builder is a popover anchored to an element, not a free-floating dialog',
	/popover\(/.test(regexSrc)
);
check(
	'the anchor is checked for being in the document before it is used',
	/isConnected/.test(regexSrc),
	'a detached anchor measures zero and the panel lands in the corner'
);
check('a caller may supply its own anchor', /opts\.anchor/.test(regexSrc));
check(
	"and the field's own button is the fallback",
	/opts\.anchor && opts\.anchor\.isConnected \? opts\.anchor : rxBtn/.test(regexFlat)
);

check(
	'the builder offers guided tokens as well as a raw pattern',
	/rx\.pattern/.test(regexSrc) && /flags/.test(regexSrc)
);
check('validity is shown live rather than on submit', /live\(\)/.test(regexSrc));
check(
	'a pattern is evaluated here and never sent anywhere',
	!/fetch\(|XMLHttpRequest|navigator\.sendBeacon/.test(regexSrc)
);

// ---------- the palette ----------

console.log('');
console.log('the command palette');

check('the palette has a regex button of its own', /rx-btn/.test(paletteSrc));
check(
	'it opens the builder by calling it, not by clicking a button it never mounted',
	/f\.openBuilder\(\)/.test(paletteSrc) &&
		!/querySelector\('\.rx-btn'\)\.click\(\)/.test(paletteSrc),
	'synthesising a click on an off-DOM button is what anchored the panel to nothing'
);
check('it passes its own in-document button as the anchor', /anchor:\s*rxBtn/.test(paletteSrc));
check(
	"the palette keeps its own query state rather than sharing another field's",
	/const state = \{ query: '', pattern: '', flags: 'i', useRegex: false \}/.test(paletteFlat)
);

// ---------- every search field ----------

console.log('');
console.log('every search field');

function walk(dir, found = []) {
	for (const entry of readdirSync(dir)) {
		if (entry === 'node_modules' || entry === '.git' || entry === 'design') continue;
		const p = join(dir, entry);
		if (statSync(p).isDirectory()) walk(p, found);
		else if (entry.endsWith('.js')) found.push(p);
	}
	return found;
}

const files = [...walk(join(ROOT, 'docs')), ...walk(join(ROOT, 'app'))];
const SEP = join('a', 'b').slice(1, 2);
const rel = (f) =>
	f
		.slice(ROOT.length + 1)
		.split(SEP)
		.join('/');

// A field that filters a list must come from searchField, or it is a search
// box with no builder beside it — which is the contract's actual subject.
const homemade = [];
for (const file of files) {
	if (/regex\.js$|palette-core\.js$/.test(file)) continue; // these BUILD the field
	const src = readFileSync(file, 'utf8');
	for (const m of src.matchAll(/h\('input',\s*\{[^}]*?(placeholder|aria-label)[^}]*?\}/g)) {
		const decl = m[0];
		if (!/[Ss]earch|[Ff]ilter/.test(decl)) continue;
		// A field inside a searchField() call is fine; a bare one is not.
		const before = src.slice(Math.max(0, m.index - 400), m.index);
		if (/searchField\(\{[^)]*$/.test(before)) continue;
		homemade.push(rel(file) + ': ' + decl.replace(/\s+/g, ' ').slice(0, 70));
	}
}
check(
	'no surface hand-rolls a search field without a builder beside it',
	homemade.length === 0,
	homemade.join(' | ')
);

const usingSearchField = files.filter((f) => /searchField\(/.test(readFileSync(f, 'utf8')));
check(
	'several surfaces use the shared field, so the check above is not vacuous',
	usingSearchField.length >= 5,
	String(usingSearchField.length) + ' files'
);

console.log('');
if (failures) {
	console.error(failures + ' check(s) failed.');
	process.exit(1);
}
console.log(
	'Every builder opens beside the field it belongs to, and no pattern leaves the machine.'
);
process.exit(0);
