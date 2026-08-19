#!/usr/bin/env node
// The application mark: what it accepts, what it refuses, and what it may
// never touch.
//
// The headers below are built by hand rather than loaded from fixture files, so
// each test says exactly which byte it is exercising. That matters most for the
// refusals: the case the contract names — a file renamed to .png that is not a
// PNG — is only meaningful if the test can prove the bytes really are something
// else and the extension really does say PNG.
//
// The other half is the identity rule. Renaming the window must not move the
// data directory, the package identifier or the update feed, because each of
// those failures is silent and expensive: settings orphaned, updates pointed at
// nothing, with no error at the moment it happens.
//
//   node scripts/test-logo.mjs

import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const logo = await import(pathToFileURL(join(ROOT, 'app', 'js', 'core', 'logo.js')).href);

let failures = 0;
function check(name, ok, detail = '') {
	if (ok) console.log('  pass  ' + name);
	else {
		console.error('  FAIL  ' + name + (detail ? ' — ' + detail : ''));
		failures++;
	}
}

// ---------- header builders ----------

function bytes(...parts) {
	const flat = [];
	for (const p of parts) {
		if (typeof p === 'number') flat.push(p);
		else for (const b of p) flat.push(b);
	}
	return new Uint8Array(flat);
}
const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le16 = (n) => [n & 255, (n >>> 8) & 255];
const le32 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const le24 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255];
const ascii = (s) => [...s].map((ch) => ch.charCodeAt(0));

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function png(w, h, { apngFrames = 0 } = {}) {
	const head = bytes(PNG_SIG, be32(13), ascii('IHDR'), be32(w), be32(h), [8, 6, 0, 0, 0], be32(0));
	if (!apngFrames) return head;
	return bytes(head, be32(8), ascii('acTL'), be32(apngFrames), be32(0), be32(0));
}
function gif(w, h, frames = 1) {
	const parts = [ascii('GIF89a'), le16(w), le16(h), [0xf7, 0, 0]];
	for (let i = 0; i < frames; i++) parts.push([0x2c], le16(0), le16(0), le16(w), le16(h), [0]);
	return bytes(...parts);
}
function bmp(w, h) {
	return bytes(
		ascii('BM'),
		le32(0),
		le32(0),
		le32(54),
		le32(40),
		le32(w),
		le32(h),
		le16(1),
		le16(24)
	);
}
function jpeg(w, h) {
	// A JFIF APP0 first, so the frame marker really has to be walked to.
	return bytes(
		[0xff, 0xd8, 0xff, 0xe0],
		[0x00, 0x10],
		ascii('JFIF'),
		[0, 1, 1, 0],
		le16(1),
		le16(1),
		[0, 0],
		[0xff, 0xc0],
		[0x00, 0x11],
		[8],
		[(h >> 8) & 255, h & 255],
		[(w >> 8) & 255, w & 255],
		[3]
	);
}
function webpVP8X(w, h, animated = false) {
	return bytes(
		ascii('RIFF'),
		le32(0),
		ascii('WEBP'),
		ascii('VP8X'),
		le32(10),
		[animated ? 0x02 : 0x00, 0, 0, 0],
		le24(w - 1),
		le24(h - 1)
	);
}
function webpVP8(w, h) {
	return bytes(
		ascii('RIFF'),
		le32(0),
		ascii('WEBP'),
		ascii('VP8 '),
		le32(20),
		[0, 0, 0],
		[0x9d, 0x01, 0x2a],
		le16(w),
		le16(h)
	);
}
function webpVP8L(w, h) {
	const packed = ((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14);
	return bytes(
		ascii('RIFF'),
		le32(0),
		ascii('WEBP'),
		ascii('VP8L'),
		le32(20),
		[0x2f],
		le32(packed)
	);
}

// ---------- identity ----------

console.log('identity');

check('the identity record is frozen against modification', Object.isFrozen(logo.IDENTITY));
check(
	'identity carries a package id, executable, data directory and update feed',
	Boolean(
		logo.IDENTITY.packageId &&
		logo.IDENTITY.executable &&
		logo.IDENTITY.dataDirectory &&
		logo.IDENTITY.updateFeed
	)
);

// The rule that costs the most when broken: read the source and require that
// nothing in the identity is built from a setting.
const src = readFileSync(join(ROOT, 'app', 'js', 'core', 'logo.js'), 'utf8');
const src0 = src;
const identityBlock = (src.match(/export const IDENTITY = Object\.freeze\(\{[\s\S]*?\}\);/) || [
	''
])[0];
check(
	'every identity value is a literal, never derived from a setting',
	identityBlock.length > 0 &&
		!/\$\{|\+|state\.|settings|displayName|logo/.test(
			identityBlock
				.replace(/\/\/[^\n]*/g, '')
				.replace(/material-openweb-ui|material-openwebui/g, '')
		),
	identityBlock.replace(/\s+/g, ' ').slice(0, 100)
);

const shell = readFileSync(join(ROOT, 'electron', 'main.ts'), 'utf8');
check(
	'the desktop shell does not build a path from a display name',
	!/app\.setPath\([^)]*displayName|getPath\([^)]*name\b[^)]*\)\s*\+/.test(shell)
);

// ---------- reading real headers ----------

console.log('');
console.log('reading headers');

const CASES = [
	['PNG', png(512, 256), 512, 256, 'PNG'],
	['GIF', gif(64, 48), 64, 48, 'GIF'],
	['BMP', bmp(120, 90), 120, 90, 'BMP'],
	['JPEG past a JFIF segment', jpeg(800, 600), 800, 600, 'JPEG'],
	['WebP extended', webpVP8X(300, 200), 300, 200, 'WebP'],
	['WebP lossy', webpVP8(320, 240), 320, 240, 'WebP'],
	['WebP lossless', webpVP8L(150, 100), 150, 100, 'WebP']
];

for (const [label, data, w, h, format] of CASES) {
	let got = null;
	let err = null;
	try {
		got = logo.readDimensions(data);
	} catch (e) {
		err = e.message;
	}
	check(
		label + ' reports its real size',
		got && got.width === w && got.height === h && got.format === format,
		err || JSON.stringify(got)
	);
}

check(
	'a top-down BMP with a negative height is read as positive',
	logo.readDimensions(bmp(64, -32 >>> 0)).height > 0
);
check(
	'an animated GIF is counted as more than one frame',
	logo.readDimensions(gif(32, 32, 5)).frames === 5
);
check(
	'an APNG is counted as more than one frame',
	logo.readDimensions(png(32, 32, { apngFrames: 12 })).frames === 12
);
check('a still PNG is one frame', logo.readDimensions(png(32, 32)).frames === 1);

// ---------- acceptance ----------

console.log('');
console.log('acceptance');

const good = logo.inspect(png(256, 256), 'mark.png');
check('an ordinary PNG is accepted', good.ok === true, good.reason);
check(
	'acceptance reports what the bytes actually were',
	good.sniffed === 'PNG image' && Boolean(good.evidence),
	JSON.stringify(good.sniffed)
);
check('acceptance reports the size it read', good.width === 256 && good.height === 256);

const animated = logo.inspect(gif(64, 64, 8), 'spin.gif');
check('an animated image is accepted rather than refused', animated.ok === true, animated.reason);
check(
	'an animated image is told that only the first frame is used',
	/only the first is used/.test(animated.note || ''),
	animated.note
);

// ---------- refusals ----------

console.log('');
console.log('refusals');

// The case the contract names by name.
const pdfBytes = bytes(ascii('%PDF-1.7'), ascii('\n%'), [0xe2, 0xe3, 0xcf, 0xd3, 0x0a]);
const renamed = logo.inspect(pdfBytes, 'definitely-a-logo.png');
check('a PDF renamed to .png is refused', renamed.ok === false);
check(
	'the refusal says what the bytes really are, not what the name claimed',
	/PDF/.test(renamed.reason),
	renamed.reason
);
check(
	'the refusal points out that an extension is only a label',
	/extension is a label/.test(renamed.reason),
	renamed.reason
);
check(
	'a refusal applies nothing at all: there is no partial result',
	renamed.width === undefined && renamed.height === undefined && renamed.mime === undefined,
	JSON.stringify(renamed)
);

const empty = logo.inspect(new Uint8Array(0), 'nothing.png');
check('an empty file is refused', empty.ok === false && /no bytes/.test(empty.reason));

const huge = logo.inspect(png(60000, 60000), 'enormous.png');
check(
	'a decompression bomb is refused on its declared size, before any decoding',
	huge.ok === false && /limit on either side/.test(huge.reason),
	huge.reason
);

const wide = logo.inspect(png(4000, 4000), 'big.png');
check(
	'an image inside the side limit but over the pixel budget is refused',
	wide.ok === false && /megapixels/.test(wide.reason),
	wide.reason
);
check(
	'the pixel refusal states the memory it would have taken',
	/MB of memory/.test(wide.reason || ''),
	wide.reason
);

const oversize = logo.inspect(new Uint8Array(5 * 1024 * 1024), 'fat.png');
check(
	'a file over the byte limit is refused',
	oversize.ok === false && /the limit is/.test(oversize.reason)
);

const zero = logo.inspect(png(0, 0), 'zero.png');
check('a zero dimension is refused', zero.ok === false && /zero dimension/.test(zero.reason));

const truncated = logo.inspect(bytes(PNG_SIG, be32(13), ascii('XXXX')), 'broken.png');
check(
	'a PNG signature with no IHDR is refused',
	truncated.ok === false && /IHDR/.test(truncated.reason),
	truncated.reason
);

const text = logo.inspect(bytes(ascii('just some words in a file')), 'notes.png');
check('a plain text file is refused', text.ok === false);

// ---------- generated variants ----------

console.log('');
console.log('generated variants');

const okVariant = logo.verifyVariant(png(64, 64));
check('a real PNG variant verifies', okVariant.ok === true, okVariant.reason);
check(
	'verification reports the size it read back',
	okVariant.width === 64 && okVariant.height === 64
);

const emptyVariant = logo.verifyVariant(new Uint8Array(0));
check(
	'an encoder that returned nothing is caught',
	emptyVariant.ok === false && /no bytes/.test(emptyVariant.reason),
	emptyVariant.reason
);

const wrongVariant = logo.verifyVariant(gif(64, 64));
check(
	'an encoder that silently substituted a format is caught',
	wrongVariant.ok === false && /GIF/.test(wrongVariant.reason),
	wrongVariant.reason
);

check(
	'variants cover the sizes a platform actually asks for',
	logo.VARIANT_SIZES.includes(16) &&
		logo.VARIANT_SIZES.includes(32) &&
		logo.VARIANT_SIZES.includes(256)
);

// ---------- crop and safe area ----------

console.log('');
console.log('crop and safe area');

const c1 = logo.normaliseCrop({ x: 0.9, y: 0.9, size: 1 }, 100, 100);
check(
	'a crop is pulled back inside the image rather than running off it',
	c1.x === 0 && c1.y === 0 && c1.size === 1,
	JSON.stringify(c1)
);
check(
	'the crop size is preserved when the offset has to give way',
	logo.normaliseCrop({ x: 0.95, y: 0, size: 0.5 }, 100, 100).size === 0.5
);
check(
	'a missing crop becomes the whole image rather than nothing',
	logo.normaliseCrop(undefined, 64, 64).size === 1
);
check(
	'a nonsense crop is clamped, not trusted',
	logo.normaliseCrop({ x: -5, y: 99, size: 0 }, 64, 64).size >= 0.05
);
check('a maskable safe area is defined', logo.SAFE_AREA_INSET > 0 && logo.SAFE_AREA_INSET < 0.5);

// ---------- contrast ----------

console.log('');
console.log('contrast');

const { contrast } = await import(
	pathToFileURL(join(ROOT, 'docs', 'assets', 'js', 'colour.js')).href
);
const dark = logo.contrastWarnings(
	[0.05, 0.05, 0.06],
	[
		{ label: 'dark title bar', rgb: [0.08, 0.07, 0.09] },
		{ label: 'light title bar', rgb: [1, 1, 1] }
	],
	contrast
);
check('a dark mark on a dark surface is warned about', dark.length === 1, JSON.stringify(dark));
check(
	'the warning names the surface and the ratio',
	/dark title bar/.test(dark[0]) && /:1/.test(dark[0]),
	dark[0]
);

const fine = logo.contrastWarnings(
	[0, 0, 0],
	[{ label: 'light title bar', rgb: [1, 1, 1] }],
	contrast
);
check('a mark that can be seen produces no warning', fine.length === 0);

// ---------- presets ----------

console.log('');
console.log('presets');

check('several marks ship with the application', logo.PRESETS.length >= 4);
check(
	'every preset renders to standalone SVG',
	logo.PRESETS.every(
		(p) => logo.presetSvg(p).startsWith('<svg') && logo.presetSvg(p).includes('</svg>')
	)
);
check(
	'a preset fetches nothing from anywhere',
	logo.PRESETS.every((p) => !/https?:/.test(p.svg))
);
check(
	'every preset carries an accessible name',
	logo.PRESETS.every((p) => logo.presetSvg(p).includes('aria-label'))
);

// ---------- the display name never becomes the identity ----------
//
// The display name is an editable setting now, so the rule has to be checked
// against every line that mentions it rather than against the one file that
// happened to exist when the rule was written. A name that reaches the data
// directory loses every chat the moment it is edited; one that reaches the
// update feed stops updates without saying so. Neither announces itself.

console.log('');
console.log('the display name');

const IDENTITY_SINKS =
	/(setPath|getPath|userData|appData|app\\.setName|setAppUserModelId|updateFeed|setFeedURL|packageId|executable|dataDirectory)/;
const leaks = [];
for (const rel of [
	join('app', 'js', 'app.js'),
	join('app', 'js', 'state.js'),
	join('app', 'js', 'logo-ui.js'),
	join('app', 'js', 'core', 'logo.js'),
	join('electron', 'main.ts'),
	join('electron', 'backend.ts')
]) {
	let src;
	try {
		src = readFileSync(join(ROOT, rel), 'utf8');
	} catch {
		continue;
	}
	for (const line of src.split(String.fromCharCode(10))) {
		// Comments discuss the rule at length; only code can break it.
		const code = line.split('//')[0];
		if (!/displayName/.test(code)) continue;
		if (IDENTITY_SINKS.test(code)) leaks.push(rel + ': ' + line.trim().slice(0, 90));
	}
}
check(
	'no line anywhere passes the display name to something that decides identity',
	leaks.length === 0,
	leaks.join(' | ')
);

// And the reverse: the identity constants are not read out of settings.
const afterIdentity = src0.slice(src0.indexOf('export const IDENTITY'));
check(
	'the identity is never read out of settings',
	!/state\\.get|settings\\./.test(afterIdentity.slice(0, 600)),
	afterIdentity.slice(0, 90).replace(/\\s+/g, ' ')
);

console.log('');
if (failures) {
	console.error(failures + ' check(s) failed.');
	process.exit(1);
}
console.log('The mark is decided by its bytes, refused whole, and never touches the identity.');
process.exit(0);
