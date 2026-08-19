#!/usr/bin/env node
// The colour translator, against published values and its own round trips.
//
// A conversion table is the easiest thing in a project to get quietly wrong.
// Every number still looks like a colour, the swatch still fills in, and the
// only symptom is that everything drifts a few units away from what was asked
// for. So this checks two independent things:
//
//   - round trips, which catch an inverse that does not match its forward; and
//   - published values, which catch a forward that is confidently wrong in both
//     directions — the failure a round trip cannot see.
//
// The published anchors are the ones with a single correct answer: sRGB white
// is exactly L*=100 in D50 Lab and exactly 1 in OKLab, black is 0 in both, and
// black on white is exactly 21:1.
//
//   node scripts/test-colour.mjs

import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const c = await import(
	pathToFileURL(join(process.cwd(), 'docs', 'assets', 'js', 'colour.js')).href
);

let failures = 0;
function check(name, ok, detail = '') {
	if (ok) console.log('  pass  ' + name);
	else {
		console.error('  FAIL  ' + name + (detail ? ' — ' + detail : ''));
		failures++;
	}
}
function near(a, b, tol) {
	return Math.abs(a - b) <= tol;
}
function nearAll(got, want, tol) {
	return got.length === want.length && got.every((v, i) => near(v, want[i], tol));
}
function show(v) {
	return '[' + v.map((n) => Number(n.toFixed(4))).join(', ') + ']';
}

// ---------- published anchors ----------

console.log('published anchors');

// White and black have exact answers in both perceptual spaces. If the white
// point adaptation is missing or the wrong way round, white stops being L*=100.
const white = [1, 1, 1];
const black = [0, 0, 0];

check(
	'sRGB white is L* 100 in D50 CIELAB',
	near(c.rgbToLab(white)[0], 100, 0.02),
	show(c.rgbToLab(white))
);
check(
	'sRGB white is neutral in CIELAB (a* and b* at zero)',
	near(c.rgbToLab(white)[1], 0, 0.02) && near(c.rgbToLab(white)[2], 0, 0.02),
	show(c.rgbToLab(white))
);
check('sRGB black is L* 0 in CIELAB', near(c.rgbToLab(black)[0], 0, 0.02));
check(
	'sRGB white is 1 in OKLab',
	near(c.rgbToOklab(white)[0], 1, 0.0005),
	show(c.rgbToOklab(white))
);
check(
	'sRGB white is neutral in OKLab',
	near(c.rgbToOklab(white)[1], 0, 0.0005) && near(c.rgbToOklab(white)[2], 0, 0.0005),
	show(c.rgbToOklab(white))
);
check('sRGB black is 0 in OKLab', near(c.rgbToOklab(black)[0], 0, 0.0005));

// CSS Color 4 gives sRGB red as lab(54.29% 80.8 69.89) and
// oklch(62.8% 0.2577 29.23). Both are quoted to the digits asserted here.
const red = [1, 0, 0];
check(
	'sRGB red is lab(54.29% 80.8 69.89)',
	nearAll(c.rgbToLab(red), [54.29, 80.8, 69.89], 0.06),
	show(c.rgbToLab(red))
);
check(
	'sRGB red is oklch(0.628 0.2577 29.23)',
	nearAll(c.rgbToOklch(red), [0.628, 0.2577, 29.23], 0.006),
	show(c.rgbToOklch(red))
);

// Contrast has exact endpoints and one very well-known midpoint.
check(
	'black on white is exactly 21 to 1',
	near(c.contrast(black, white), 21, 1e-9),
	String(c.contrast(black, white))
);
check('a colour against itself is 1 to 1', near(c.contrast(red, red), 1, 1e-12));
check(
	'#767676 on white is the classic 4.54 to 1',
	near(c.contrast(c.parse('#767676').rgb, white), 4.54, 0.01),
	String(c.contrast(c.parse('#767676').rgb, white).toFixed(3))
);
check(
	'#767676 on white grades AA but not AAA',
	c.grade(c.contrast(c.parse('#767676').rgb, white)) === 'AA'
);
check(
	'a 3.2 to 1 ratio is honest about being large-text only',
	c.grade(3.2) === 'AA at large sizes only' && c.grade(3.2, true) === 'AA'
);

// ---------- round trips through every space ----------

console.log('');
console.log('round trips');

const SAMPLES = [
	[0.404, 0.314, 0.643], // the seed, #6750A4
	[1, 0, 0],
	[0, 1, 0],
	[0, 0, 1],
	[1, 1, 1],
	[0, 0, 0],
	[0.5, 0.5, 0.5],
	[0.02, 0.7, 0.35],
	[0.98, 0.83, 0.11]
];

// Tolerances differ per space, and the difference is not a convenience.
//
// The sRGB<->XYZ matrices are kept as exact fractions and invert to 5e-17, so
// anything built only from those is held to machine precision. The perceptual
// spaces are not: CSS publishes the Bradford D65<->D50 pair as decimals that
// are not exact inverses of each other (they miss identity by 1.6e-7), and
// OKLab's coefficients are published the same way. Cube roots amplify that to a
// few parts in a million by the time it is back in sRGB.
//
// So the loose bound is the published constants' own floor, not slack. It is
// still 400 times finer than the smallest difference eight bits can represent
// (half a step is 1/510), which is the number that decides whether anyone could
// ever see it. Holding the exact spaces to the loose bound would hide a real
// regression in them, so they keep the tight one.
const EXACT = 1e-9;
const PUBLISHED_CONSTANTS = 1e-5;

const PAIRS = [
	['CIELAB', c.rgbToLab, c.labToRgb, PUBLISHED_CONSTANTS],
	['CIELCH', c.rgbToLch, c.lchToRgb, PUBLISHED_CONSTANTS],
	['OKLab', c.rgbToOklab, c.oklabToRgb, PUBLISHED_CONSTANTS],
	['OKLCH', c.rgbToOklch, c.oklchToRgb, PUBLISHED_CONSTANTS],
	['HSL', c.rgbToHsl, c.hslToRgb, EXACT],
	['HSV', c.rgbToHsv, c.hsvToRgb, EXACT],
	['HWB', c.rgbToHwb, c.hwbToRgb, EXACT],
	['CMYK', c.rgbToCmyk, c.cmykToRgb, EXACT],
	['XYZ', c.rgbToXyz, c.xyzToRgb, EXACT]
];

let worstAnywhere = 0;
for (const [name, forward, back, tol] of PAIRS) {
	let worst = 0;
	let worstAt = null;
	for (const rgb of SAMPLES) {
		const got = back(forward(rgb));
		for (let i = 0; i < 3; i++) {
			const d = Math.abs(got[i] - rgb[i]);
			if (d > worst) {
				worst = d;
				worstAt = rgb;
			}
		}
	}
	worstAnywhere = Math.max(worstAnywhere, worst);
	check(
		'every sample survives a trip through ' + name + ' (within ' + tol.toExponential(0) + ')',
		worst < tol,
		'worst drift ' + worst.toExponential(2) + ' at ' + (worstAt ? show(worstAt) : '')
	);
}

// The bound that actually matters: no round trip may shift a colour by as much
// as the display can show.
check(
	'no round trip drifts by even half an eight-bit step',
	worstAnywhere < 1 / 510,
	'worst ' + worstAnywhere.toExponential(2) + ' vs ' + (1 / 510).toExponential(2)
);

// The text notations have to round trip too, which is what a user actually
// types. A formatter that rounds too hard breaks here and nowhere else.
console.log('');
console.log('text notations');

const seed = c.parse('#6750A4').rgb;
for (const space of ['hex', 'rgb', 'hsl', 'hsv', 'hwb', 'lab', 'lch', 'oklab', 'oklch']) {
	const text = c.formats(seed)[space];
	let got = null;
	let err = null;
	try {
		got = c.parse(text).rgb;
	} catch (e) {
		err = e.message;
	}
	check(
		space + ' survives being written out and read back',
		got && nearAll(got, seed, 0.004),
		err || text + ' -> ' + (got ? show(got) : 'nothing')
	);
}

// CMYK is the naive device conversion and is exact for in-gamut sRGB, so it is
// checked at the same strictness rather than being given a pass.
check(
	'cmyk survives being written out and read back',
	nearAll(c.parse(c.formats(seed).cmyk).rgb, seed, 0.004),
	c.formats(seed).cmyk
);

// ---------- parsing ----------

console.log('');
console.log('parsing');

check('a three-digit hex expands correctly', nearAll(c.parse('#f00').rgb, [1, 0, 0], 1e-12));
check(
	'a four-digit hex carries alpha',
	near(c.parse('#f008').alpha, 0x88 / 255, 1e-12),
	String(c.parse('#f008').alpha)
);
check('an eight-digit hex carries alpha', near(c.parse('#11223344').alpha, 0x44 / 255, 1e-12));
check(
	'rgb() in 0-255 is read as 0-255',
	nearAll(c.parse('rgb(255 128 0)').rgb, [1, 128 / 255, 0], 1e-12)
);
check(
	'rgb() in percentages is read as percentages',
	nearAll(c.parse('rgb(100% 50% 0%)').rgb, [1, 0.5, 0], 1e-12)
);
check(
	'a comma-separated rgba() still parses',
	nearAll(c.parse('rgba(255, 0, 0, 0.5)').rgb, [1, 0, 0], 1e-12)
);
check('slash alpha is read', near(c.parse('rgb(255 0 0 / 0.25)').alpha, 0.25, 1e-12));
check('percentage alpha is read', near(c.parse('rgb(255 0 0 / 25%)').alpha, 0.25, 1e-12));
check('absent alpha is opaque, never zero', c.parse('rgb(255 0 0)').alpha === 1);
check(
	'a named colour resolves',
	nearAll(c.parse('rebeccapurple').rgb, c.parse('#663399').rgb, 1e-12)
);
check(
	'transparent is black at zero alpha',
	c.parse('transparent').alpha === 0 && nearAll(c.parse('transparent').rgb, [0, 0, 0], 1e-12)
);
check(
	'every named colour parses',
	Object.keys(c.NAMED).every((n) => {
		try {
			c.parse(n);
			return true;
		} catch {
			return false;
		}
	})
);
check(
	'the named set is the full CSS list, not a sample',
	Object.keys(c.NAMED).length === 148,
	String(Object.keys(c.NAMED).length) + ' names'
);

check(
	'the space a value was WRITTEN in is remembered',
	c.parse('oklch(0.7 0.1 200)').space === 'oklch'
);
check('a hex with alpha is remembered as hex8', c.parse('#11223344').space === 'hex8');
check(
	'a name is remembered as a name',
	c.parse('tomato').space === 'named' && c.parse('tomato').name === 'tomato'
);

// ---------- gamut ----------

console.log('');
console.log('gamut');

const wild = c.oklchToRgb([0.9, 0.4, 130]);
check('a colour outside sRGB is reported as outside', !c.inGamut(wild), show(wild));
check(
	'the overshoot is measured rather than merely flagged',
	c.overshoot(wild) > 0.05,
	String(c.overshoot(wild))
);
check('an ordinary colour is inside', c.inGamut(seed));
check(
	'a round trip does not drift itself out of gamut',
	SAMPLES.every((s) => c.inGamut(c.oklchToRgb(c.rgbToOklch(s))))
);

const described = c.describe('oklch(0.9 0.4 130)');
check(
	'describe() warns before it clips rather than after',
	described.inGamut === false && c.inGamut(described.displayed),
	'displayed ' + show(described.displayed)
);
check(
	'describe() reports contrast and a grade',
	typeof described.contrast === 'number' && typeof described.grade === 'string'
);

// ---------- honesty ----------

console.log('');
console.log('honesty');

check('a name is offered on an exact match', c.formats(c.parse('#ff6347').rgb).named === 'tomato');
// A neighbour, not a near-miss of the same eight-bit value: rgb(255 107 71)
// rounds to #ff6b47, which is nobody's named colour.
check(
	'a colour that merely resembles a named one is not given its name',
	c.formats([1, 107 / 255, 71 / 255]).named === undefined,
	String(c.formats([1, 107 / 255, 71 / 255]).hex)
);
check(
	'a colour with alpha is never given a name it cannot carry',
	c.formats(c.parse('#ff6347').rgb, 0.5).named === undefined
);

// ---------- refusals ----------

console.log('');
console.log('refusals');

function throws(fn) {
	try {
		fn();
		return false;
	} catch {
		return true;
	}
}
check(
	'an empty string is refused',
	throws(() => c.parse(''))
);
check(
	'a five-digit hex is refused',
	throws(() => c.parse('#12345'))
);
check(
	'a hex with a non-hex digit is refused',
	throws(() => c.parse('#12345g'))
);
check(
	'an unknown notation is refused',
	throws(() => c.parse('cielab(1 2 3)'))
);
check(
	'a notation missing components is refused',
	throws(() => c.parse('rgb(255 0)'))
);
check(
	'a bare word that is not a colour is refused',
	throws(() => c.parse('mauveish'))
);

console.log('');
if (failures) {
	console.error(
		failures + ' check(s) failed. Every colour through this translator would be quietly wrong.'
	);
	process.exit(1);
}
console.log(
	'The translator matches published values and round-trips through every space it offers.'
);
process.exit(0);
