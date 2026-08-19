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
	else {
		console.error('  FAIL  ' + name + (detail ? ' — ' + detail : ''));
		failures++;
	}
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
		if (entry === 'node_modules' || entry === '.git' || entry === 'design' || entry === 'dist')
			continue;
		const p = join(dir, entry);
		const st = statSync(p);
		if (st.isDirectory()) sheets(p, found);
		else if (/\.(css|html|js)$/.test(entry)) found.push(p);
	}
	return found;
}

const FILES = [...sheets(join(ROOT, 'docs')), ...sheets(join(ROOT, 'app'))];
check('files were found to check', FILES.length > 0, String(FILES.length));
check(
	'javascript is among them, not only stylesheets',
	FILES.some((f) => f.endsWith('.js')),
	String(FILES.filter((f) => f.endsWith('.js')).length) + ' js files'
);

const defined = new Set();
const read = new Map(); // name -> first file that reads it

/** A repository-relative path with forward slashes, for readable failures. */
function relative(file) {
	return file
		.slice(ROOT.length + 1)
		.split(SEP)
		.join('/');
}
const SEP = join('a', 'b').slice(1, 2);

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
		if (!read.has(m[1])) read.set(m[1], relative(file));
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
check(
	'every property read by a stylesheet is defined by one',
	undefinedReads.length === 0,
	undefinedReads.length ? undefinedReads.join(', ') : ''
);

// The reverse direction is a warning, not a failure: a defined-but-unread token
// is usually part of a scheme kept whole on purpose (the full Material palette
// defines pairs whether or not both halves are used yet).
const unread = [...defined].filter((n) => !read.has(n)).sort();
if (unread.length) {
	console.log('');
	console.log(
		'  note  ' +
			unread.length +
			' defined but not read: ' +
			unread.slice(0, 12).join(', ') +
			(unread.length > 12 ? ', …' : '')
	);
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
// Either quote style. Which one an attribute selector uses is a formatting
// choice, and a formatter changed it — turning this check red on a stylesheet
// that had not lost a single declaration.
const dark = block(/\[data-theme=['"]dark['"]\][^{]*\{[^}]*\}/);

check('a light scheme is defined', Boolean(light && light.size));
check('a dark scheme is defined', Boolean(dark && dark.size));

if (light && dark) {
	// Structural properties (fonts, scale, density, radius) are scheme-agnostic on
	// purpose — a dark theme does not change the typeface. Only colour must be
	// restated, and these are the ones that legitimately are not.
	const STRUCTURAL = /^--(font-|scale|density|radius-scale|elev|checker)/;
	const missing = [...light].filter((n) => !dark.has(n) && !STRUCTURAL.test(n)).sort();
	check(
		'the dark scheme restates every colour the light scheme sets',
		missing.length === 0,
		missing.join(', ')
	);
}

// ---------------------------------------------------------------- icon names
//
// icon() falls back to the information glyph for a name it does not know, which
// means a typo renders a perfectly convincing wrong icon and nothing anywhere
// complains. icon('alert') did exactly that — the set calls it 'warn'.

console.log('');

const dom = readFileSync(join(ROOT, 'docs', 'assets', 'js', 'dom.js'), 'utf8');
// The dotAll flag rather than a [\s\S] class: this file has been through
// enough shell quoting that a character class with a backslash in it is a
// liability, and the flag needs no escaping at all.
const pathsBlock = (dom.match(new RegExp('const PATHS = \\{.*?\\n\\};', 's')) || [''])[0];
// Any indentation, because indentation is a formatting choice and a formatter
// changed it. Keying on exactly two spaces produced an EMPTY icon set, and an
// empty set makes "every icon asked for exists" trivially true — the worst way
// for a guard to break, since it fails loud on the wrong check and silently
// stops doing its real job.
const iconNames = new Set(
	[...pathsBlock.matchAll(/^[\t ]*([a-zA-Z][a-zA-Z0-9]*):/gm)].map((m) => m[1])
);
// Proof the set is real. An empty one would pass every check below.
check('the icon set has a plausible number of icons in it', iconNames.size > 20, String(iconNames.size));
check('the icon set was found', iconNames.size > 10, String(iconNames.size) + ' icons');

// Built from a quoted string rather than written as a regex literal.
//
// The first version of this line was a literal and picked up an invisible
// BACKSPACE character where a word boundary was meant. The regex then required
// an unprintable byte immediately before the word "icon", so it matched nothing,
// and the check reported green while testing absolutely nothing — including on
// a file deliberately mutated to call icon('alarum'). Reading the file back did
// not reveal it either: a terminal renders 0x08 by eating the character before
// it, so the line looked correct. Only od -c showed the truth.
//
// A quoted string survives a hex dump legibly. A regex literal dense with
// backslashes does not, and this project writes files through several layers
// of shell quoting.
const ICON_CALL = "\\bicon\\(\\s*'([a-zA-Z0-9_-]+)'";

// Proof the pattern itself is intact, so a future collapse cannot pass quietly.
check(
	'the icon-call pattern still matches an ordinary call',
	new RegExp(ICON_CALL).test("icon('info')") && !new RegExp(ICON_CALL).test('iconography'),
	JSON.stringify(ICON_CALL)
);

const badIcons = [];
for (const file of FILES.filter((f) => f.endsWith('.js'))) {
	const src = readFileSync(file, 'utf8');
	for (const m of src.matchAll(new RegExp(ICON_CALL, 'g'))) {
		if (!iconNames.has(m[1])) badIcons.push(m[1] + ' in ' + relative(file));
	}
}
check('every icon asked for by name exists in the set', badIcons.length === 0, badIcons.join(', '));

// ---------------------------------------------------------------- modifier classes
//
// A modifier class exists solely to be styled — that is what the double hyphen
// means. One that no stylesheet defines is always a mistake, and always a
// silent one: the element renders in its unmodified form and looks fine.

const styledClasses = new Set();
for (const file of FILES.filter((f) => /\.(css|html)$/.test(f))) {
	const src = readFileSync(file, 'utf8');
	for (const m of src.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*--[a-zA-Z0-9_-]+)/g))
		styledClasses.add(m[1]);
}

const unstyled = new Map();
for (const file of FILES.filter((f) => f.endsWith('.js'))) {
	const src = readFileSync(file, 'utf8');
	// Only class literals written as a whole attribute value or concatenated into
	// one, so a modifier mentioned in prose or built at run time is not counted.
	for (const m of src.matchAll(/'([a-zA-Z][a-zA-Z0-9_ -]*--[a-zA-Z0-9_-]+[a-zA-Z0-9_ -]*)'/g)) {
		for (const cls of m[1].trim().split(/\s+/)) {
			if (!cls.includes('--')) continue;
			if (styledClasses.has(cls)) continue;
			if (!unstyled.has(cls)) unstyled.set(cls, relative(file));
		}
	}
}
for (const [cls, where] of unstyled) {
	console.error('  FAIL  .' + cls + ' is used in ' + where + ' but no stylesheet defines it');
	failures++;
}
check('every modifier class used in script is one a stylesheet defines', unstyled.size === 0);

console.log('');
if (failures) {
	console.error(failures + ' check(s) failed. Each of these fails without a symptom.');
	process.exit(1);
}
console.log('Properties, icon names and modifier classes all resolve to something real.');
process.exit(0);
