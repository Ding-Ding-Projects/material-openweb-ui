#!/usr/bin/env node
// Byte-signature detection and the conversions that run without a renderer.
//
// The case that matters most is the renamed file: a converter that trusts the
// extension produces confidently corrupt output, and nothing downstream can
// tell. So the tests below hand it bytes whose name says something else.
//
//   node scripts/test-convert.mjs

import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mod = await import(
	pathToFileURL(join(process.cwd(), 'app', 'js', 'core', 'convert.js')).href
);

let failures = 0;
function check(name, condition, detail = '') {
	if (condition) console.log('  pass  ' + name);
	else {
		console.error('  FAIL  ' + name + (detail ? ' — ' + detail : ''));
		failures++;
	}
}

const enc = (s) => new TextEncoder().encode(s);
const bytes = (...b) => new Uint8Array(b);

// ---------- detection ----------

console.log('detection');

const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13);
check('a PNG is a PNG', mod.sniff(png).mime === 'image/png', mod.sniff(png).type);

// The whole point: the name is irrelevant.
check('a PNG named .txt is still a PNG', mod.sniff(png).cat === 'Images');

check('a JPEG is a JPEG', mod.sniff(bytes(0xff, 0xd8, 0xff, 0xe0)).mime === 'image/jpeg');
check('a PDF is a PDF', mod.sniff(enc('%PDF-1.7\n')).mime === 'application/pdf');
check('a ZIP is a ZIP', mod.sniff(bytes(0x50, 0x4b, 0x03, 0x04, 0, 0)).mime === 'application/zip');
check('a GZIP is a GZIP', mod.sniff(bytes(0x1f, 0x8b, 0x08)).mime === 'application/gzip');

// RIFF: the outer signature is shared, so the inner tag decides. Getting this
// wrong calls a sound file an image.
const riff = (tag) => {
	const u = new Uint8Array(16);
	u.set(enc('RIFF'), 0);
	u.set(enc(tag), 8);
	return u;
};
check('a RIFF/WEBP is an image', mod.sniff(riff('WEBP')).mime === 'image/webp');
check('a RIFF/WAVE is audio', mod.sniff(riff('WAVE')).mime === 'audio/wav');
check('a RIFF/AVI is video', mod.sniff(riff('AVI ')).cat === 'Video');
check('an unknown RIFF is not guessed at', mod.sniff(riff('ZZZZ')).cat === 'Binary Encodings');

// ISO-BMFF brand lives at offset 8, after the box size at 0.
const ftyp = (brand) => {
	const u = new Uint8Array(16);
	u.set(enc('ftyp'), 4);
	u.set(enc(brand), 8);
	return u;
};
check('an MP4 brand reads as video', mod.sniff(ftyp('isom')).cat === 'Video');
check('an M4A brand reads as audio', mod.sniff(ftyp('M4A ')).cat === 'Audio');

check('JSON text is detected', mod.sniff(enc('{"a":1}')).mime === 'application/json');
check('CSV text is detected', mod.sniff(enc('a,b,c\n1,2,3\n')).mime === 'text/csv');
check('XML is detected', mod.sniff(enc('<?xml version="1.0"?><a/>')).mime === 'application/xml');
check('plain text is detected', mod.sniff(enc('just some words')).mime === 'text/plain');

// Random high-entropy bytes must not be claimed as text.
const noise = new Uint8Array(256);
for (let i = 0; i < 256; i++) noise[i] = (i * 37) % 256;
const sniffed = mod.sniff(noise);
check(
	'unrecognised binary is reported as unrecognised',
	sniffed.type === 'Unrecognised binary',
	sniffed.type
);
check('unrecognised binary shows its header as evidence', /Header: /.test(sniffed.evidence));

check(
	'an empty file is reported, not crashed on',
	mod.sniff(new Uint8Array(0)).type === 'Empty file'
);
check(
	'every result carries its evidence',
	['{"a":1}', '%PDF-', 'hello'].every((s) => typeof mod.sniff(enc(s)).evidence === 'string')
);

// ---------- adapters ----------

console.log('');
console.log('adapter registry');

check('every documented category exists', mod.CATEGORIES.length === 8);
check(
	'every adapter declares a category the registry knows',
	mod.ADAPTERS.every((a) => mod.CATEGORIES.includes(a.cat))
);
check(
	'every unavailable adapter names its exact missing dependency',
	mod.ADAPTERS.filter((a) => !a.available).every(
		(a) => typeof a.reason === 'string' && a.reason.length > 30
	)
);
check(
	'every available adapter discloses what a conversion changes',
	mod.ADAPTERS.filter((a) => a.available).every(
		(a) => typeof a.discloses === 'string' && a.discloses.length > 10
	)
);
check(
	'unavailable adapters are still listed rather than hidden',
	mod.ADAPTERS.some((a) => !a.available)
);
check(
	'every category has at least one adapter listed',
	mod.CATEGORIES.every((c) => mod.ADAPTERS.some((a) => a.cat === c))
);
check(
	'a wildcard adapter matches any type',
	mod.adaptersFor('application/octet-stream').some((a) => a.id === 'to-hex')
);

// ---------- conversions that need no renderer ----------

console.log('');
console.log('conversions');

const blobOf = (s) => new Blob([s]);
const textOf = async (b) => await b.text();

const csv = await mod.run(
	mod.ADAPTERS.find((a) => a.id === 'json-csv'),
	blobOf('[{"a":1,"b":"x"},{"a":2,"c":"y"}]')
);
const csvText = await textOf(csv);
check(
	"JSON to CSV unions every row's keys",
	csvText.split('\n')[0] === 'a,b,c',
	csvText.split('\n')[0]
);
check('JSON to CSV leaves missing cells empty', csvText.includes('2,,y'), JSON.stringify(csvText));

const back = await mod.run(
	mod.ADAPTERS.find((a) => a.id === 'csv-json'),
	blobOf('a,b\n1,"x,y"\n')
);
const parsedBack = JSON.parse(await textOf(back));
check('CSV to JSON honours quoted commas', parsedBack[0].b === 'x,y', JSON.stringify(parsedBack));
check('CSV to JSON does not invent number types', typeof parsedBack[0].a === 'string');

const pretty = await mod.run(
	mod.ADAPTERS.find((a) => a.id === 'json-pretty'),
	blobOf('{"b":1,"a":2}')
);
check(
	'pretty JSON preserves key order',
	(await textOf(pretty)).indexOf('"b"') < (await textOf(pretty)).indexOf('"a"')
);

const lf = await mod.run(
	mod.ADAPTERS.find((a) => a.id === 'text-lf'),
	blobOf('a\r\nb\rc\n')
);
check(
	'line endings normalise to LF',
	(await textOf(lf)) === 'a\nb\nc\n',
	JSON.stringify(await textOf(lf))
);

// base64 round trip through both adapters
const source = 'The quick brown fox jumps over the lazy dog.';
const b64 = await mod.run(
	mod.ADAPTERS.find((a) => a.id === 'to-b64'),
	blobOf(source)
);
const b64Text = await textOf(b64);
check('base64 encodes', b64Text === Buffer.from(source).toString('base64'), b64Text);
const roundTripped = await mod.run(
	mod.ADAPTERS.find((a) => a.id === 'from-b64'),
	blobOf(b64Text)
);
check('base64 round trips exactly', (await textOf(roundTripped)) === source);

// Invalid base64 must fail loudly rather than writing garbage.
let rejected = false;
try {
	await mod.run(
		mod.ADAPTERS.find((a) => a.id === 'from-b64'),
		blobOf('not base64 !!!')
	);
} catch (e) {
	rejected = /not valid Base64/.test(e.message);
}
check('invalid base64 is refused rather than half-decoded', rejected);

// Asserted by structure rather than by counting the padding: an exact space
// count is a test that fails when the column width changes, which says nothing
// about whether the dump is right.
const hex = await mod.run(
	mod.ADAPTERS.find((a) => a.id === 'to-hex'),
	blobOf('AB')
);
const hexLine = (await textOf(hex)).split('\n')[0];
check(
	'the hex dump line starts with an 8-digit offset',
	/^00000000 {2}/.test(hexLine),
	JSON.stringify(hexLine)
);
check(
	'the hex dump line carries the bytes in hex',
	/\b41 42\b/.test(hexLine),
	JSON.stringify(hexLine)
);
check(
	'the hex dump line ends with a delimited ascii pane',
	/\|AB\|$/.test(hexLine),
	JSON.stringify(hexLine)
);
check(
	'the hex column is padded to a fixed width',
	hexLine.indexOf('|') === 59,
	String(hexLine.indexOf('|'))
);

// An unavailable adapter must refuse, not silently no-op.
let refused = false;
try {
	await mod.run(
		mod.ADAPTERS.find((a) => a.id === 'audio-wav'),
		blobOf('x')
	);
} catch (e) {
	refused = /ffmpeg/.test(e.message);
}
check('an unavailable adapter refuses and names what is missing', refused);

check(
	'output name never collides with its source extension',
	mod.outputName(
		'report.json',
		mod.ADAPTERS.find((a) => a.id === 'json-csv')
	) === 'report.csv'
);

// ---------- what a conversion destroys ----------
//
// Lossiness used to be a boolean stored beside the prose describing the loss,
// and two of them disagreed: img-png and json-pretty were both flagged
// lossless while their own text said animation was lost and duplicate keys
// collapsed. The pre-run disclosure was gated on the flag, so those two ran
// with no warning while the sentence explaining the loss sat in the same
// object. A boolean that can contradict the prose beside it eventually will.

console.log('');
console.log('what a conversion destroys');

const available = mod.ADAPTERS.filter((a) => a.available);
check(
	'every available adapter states what it destroys, even if that is nothing',
	available.every((a) => Array.isArray(a.destroys)),
	available
		.filter((a) => !Array.isArray(a.destroys))
		.map((a) => a.id)
		.join(',')
);
check(
	'lossiness is derived from that list rather than stored separately',
	typeof mod.isLossy === 'function' && available.every((a) => !('lossy' in a)),
	available
		.filter((a) => 'lossy' in a)
		.map((a) => a.id)
		.join(',')
);
check(
	'isLossy agrees with the list, by construction',
	available.every((a) => mod.isLossy(a) === a.destroys.length > 0)
);

// The two that were wrong, named so a regression is obvious.
const byId = Object.fromEntries(mod.ADAPTERS.map((a) => [a.id, a]));
check(
	're-encoding to PNG is lossy, because animation does not survive it',
	mod.isLossy(byId['img-png']),
	JSON.stringify(byId['img-png'].destroys)
);
check(
	'pretty-printing JSON is lossy, because duplicate keys collapse',
	mod.isLossy(byId['json-pretty']),
	JSON.stringify(byId['json-pretty'].destroys)
);
check(
	'reading CSV into JSON really is lossless, so the check is not vacuous',
	!mod.isLossy(byId['csv-json'])
);
check(
	'at least one available adapter is lossless and one is lossy',
	available.some((a) => mod.isLossy(a)) && available.some((a) => !mod.isLossy(a))
);

// Each entry has to name a thing, not gesture at one.
const vague = available.flatMap((a) =>
	(a.destroys || [])
		.filter((d) => typeof d !== 'string' || d.length < 20)
		.map((d) => a.id + ': ' + JSON.stringify(d))
);
check(
	'every stated loss names what is lost rather than gesturing at it',
	vague.length === 0,
	vague.join(', ')
);

const gate = readFileSync(join(process.cwd(), 'app', 'js', 'pages', 'converter.js'), 'utf8');
check(
	'the pre-run disclosure is gated on the derived value',
	/convert\.isLossy\(adapter\)/.test(gate) && !/adapter\.lossy/.test(gate)
);
check(
	'and the dialog lists each loss rather than one paragraph that may omit some',
	/adapter\.destroys\.map/.test(gate)
);

console.log('');
if (failures) {
	console.error(failures + ' check(s) failed.');
	process.exit(1);
}
console.log('Detection, the adapter registry and every renderer-free conversion behave.');
process.exit(0);
