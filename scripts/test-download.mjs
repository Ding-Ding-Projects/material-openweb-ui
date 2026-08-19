#!/usr/bin/env node
// The download surface says the warning before it offers the file.
//
// The contract's own verification step is "confirm the warning text appears on
// the download surface before any release link". Before is the whole point: a
// warning under the button is read after the download, and a warning phrased as
// "your system may complain, this is normal" is advice to click past a security
// prompt — which is the habit that gets people compromised, and not something to
// teach from a stranger's website.
//
//   node scripts/test-download.mjs

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const src = readFileSync(join(ROOT, 'docs', 'assets', 'js', 'download.js'), 'utf8');

let failures = 0;
function check(name, ok, detail = '') {
	if (ok) console.log('  pass  ' + name);
	else {
		console.error('  FAIL  ' + name + (detail ? ' — ' + detail : ''));
		failures++;
	}
}

console.log('order');

// Source order is the order a screen reader meets it in, so it is the order
// that is checked rather than a visual arrangement that could be overridden.
const warningAt = src.indexOf('dl__warning');
const anyLinkAt = Math.min(
	...[src.indexOf("h('a', {"), src.indexOf('f.url')]
		.filter((i) => i > -1)
		.concat([Number.MAX_SAFE_INTEGER])
);
check('the warning block exists', warningAt > -1);
check(
	'the warning is built BEFORE any download link',
	warningAt > -1 && warningAt < anyLinkAt,
	warningAt + ' vs ' + anyLinkAt
);
// Scoped to the render call, on a whitespace-normalised copy.
//
// Two lessons in one line. An earlier version compared the first occurrence of
// each name anywhere in the file, and "add(list," appears well before the
// render — so it measured two unrelated lines. The version after that searched
// for the literal "add(wrap," and stopped finding it the moment a formatter put
// the call and its first argument on separate lines.
//
// Order is a property of the code. Whitespace is not. Collapsing runs of
// whitespace before looking removes the second failure mode entirely.
const flat = src.replace(/\s+/g, ' ');
const renderCall = flat.slice(flat.indexOf('add( wrap,') > -1 ? flat.indexOf('add( wrap,') : flat.indexOf('add(wrap,'));
check('the render call was found', renderCall.startsWith('add('), renderCall.slice(0, 40));
check(
	'the warning is added to the page before the list of files',
	renderCall.indexOf('warning,') > -1 && renderCall.indexOf('warning,') < renderCall.indexOf('list,'),
	renderCall.slice(0, 200)
);

console.log('');
console.log('what it says');

check('it names what Windows will actually show', /SmartScreen/i.test(src));
check(
	'it names what macOS will actually show',
	/macOS/.test(src) && /cannot be checked/i.test(src)
);
check(
	'it says the warning is correct rather than a false alarm',
	/Both are correct/i.test(src) && /Neither is a false alarm/i.test(src)
);
check(
	'it gives the real reason rather than a vague one',
	/annual fee|certificate is an annual/i.test(src)
);
check('it says the signing is permanently absent, not merely pending', /permanently/i.test(src));

/**
 * The words the page actually shows, with two things removed.
 *
 * Comments go first, for the reason every absence check eventually learns: the
 * comment at the top of download.js lists the three phrasings that are
 * forbidden, so a guard reading raw source finds all three and fails on a page
 * that is doing exactly the right thing. A guard that fails when you document
 * the rule teaches people to delete the documentation.
 *
 * Quoted spans go second. The page names the bad advice in order to REFUSE it —
 * saying that "it is safe, ignore the warning" would be asking you to practise
 * a dangerous habit. Naming a thing to reject it is the opposite of giving it
 * as advice, and a scan that cannot tell those apart would forbid the page from
 * explaining itself at all.
 */
// Patterns are built from strings rather than written as literals. This file
// has been through enough shell quoting for a backslash to have been eaten
// twice already, and a regex literal full of them is unreadable in a hex dump
// when it happens again.
const BLOCK_COMMENT = new RegExp('/\\*.*?\\*/', 'gs');
const LINE_COMMENT = new RegExp('(^|[^:])//.*$', 'gm');
const QUOTED = /"[^"]*"/g;

function prose(source) {
	return source
		.replace(BLOCK_COMMENT, ' ')
		.replace(LINE_COMMENT, '$1 ')
		.replace(QUOTED, ' [quoted] ');
}
const shown = prose(src);
console.log('');
console.log('what it does not say');

// The three phrasings that would turn an honest warning into bad advice.
check(
	'it never tells anyone the warning is safe to ignore',
	!/safe to ignore|just ignore|ignore (the|this) warning|perfectly safe/i.test(shown),
	(shown.match(/[^.]*ignore[^.]*/i) || [''])[0].trim().slice(0, 90)
);
check(
	'it never explains how to click past the operating system prompt',
	!/More info.*Run anyway|right-click.*Open|xattr -d|Allow Anyway/i.test(shown)
);
check(
	'it does not describe the warning as normal or expected',
	!/this is normal|perfectly normal|expected behaviour/i.test(shown),
	(shown.match(/[^.]*normal[^.]*/i) || [''])[0].trim().slice(0, 90)
);

// The stripping must not be so aggressive that it would hide real advice.
check(
	'the stripped prose still contains the page text, so the checks above mean something',
	/SmartScreen/.test(shown) && /annual fee/.test(shown) && shown.length > 1200,
	String(shown.length) + ' characters left'
);
check(
	'a page that really did advise ignoring the warning would still be caught',
	/safe to ignore/i.test(prose("const a = 'The warning is safe to ignore.';")),
	'the discriminator is quotation, not the word itself'
);

console.log('');
console.log('what it offers instead');

check('building from source is offered', /build\.bat/.test(src) && /git clone/.test(src));
check('a checksum route is offered', /SHA-256|shasum|Get-FileHash/.test(src));
check(
	'the checksum is not overclaimed as proof of origin',
	/does not prove where it came from/i.test(src)
);
check(
	'an empty release list says so rather than listing nothing quietly',
	/Nothing has been released yet/.test(src)
);
check(
	'and it explains why an imaginary link would be worse',
	/missing file|does not exist/i.test(src)
);

console.log('');
console.log('bilingual');

check(
	'the warning is given in Cantonese too, not only English',
	/cjk/.test(src) && /簽名/.test(src)
);
check('the Cantonese says the warnings are correct as well', /兩個警告都係啱嘅/.test(src));

console.log('');
if (failures) {
	console.error(
		failures + ' check(s) failed. A download page that softens this is teaching a dangerous habit.'
	);
	process.exit(1);
}
console.log(
	'The warning comes first, says what will actually happen, and never advises clicking past it.'
);
process.exit(0);
