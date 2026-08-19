// Colour, in every space the contract names, converted properly.
//
// The rule this file exists to honour is that a colour control must be a
// continuous spectrum plus numeric entry — never a swatch-only chooser. That
// means the numbers have to be right in both directions, because a translator
// that is subtly wrong is worse than none: it looks authoritative and quietly
// shifts every colour that passes through it.
//
// Two decisions worth stating, because getting them wrong is invisible:
//
//   1. CSS `lab()` and `lch()` are D50-referred, while sRGB is D65. This does
//      the Bradford adaptation between them rather than pretending one white
//      point fits both. Skipping it moves every Lab value by a few units — far
//      too small to notice and far too large to be correct.
//   2. `cmyk()` here is the naive device conversion, with no ICC profile
//      anywhere. That is what a browser can do, so that is what is offered, and
//      the surface says so rather than implying a print-accurate result.

// ---------------------------------------------------------------- constants

const EPS = 216 / 24389;
const KAPPA = 24389 / 27;

// D50 reference white, as CSS Color 4 specifies for lab()/lch().
const D50 = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];

// Matrices are kept as exact fractions where CSS gives them that way, so a
// round trip does not drift on the last digit.
const LIN_SRGB_TO_XYZ_D65 = [
	[506752 / 1228815, 87881 / 245763, 12673 / 70218],
	[87098 / 409605, 175762 / 245763, 12673 / 175545],
	[7918 / 409605, 87881 / 737289, 1001167 / 1053270]
];
const XYZ_D65_TO_LIN_SRGB = [
	[12831 / 3959, -329 / 214, -1974 / 3959],
	[-851781 / 878810, 1648619 / 878810, 36519 / 878810],
	[705 / 12673, -2585 / 12673, 705 / 667]
];
const D65_TO_D50 = [
	[1.0479298208405488, 0.022946793341019088, -0.05019222954313557],
	[0.029627815688159344, 0.990434484573249, -0.01707382502938514],
	[-0.009243058152591178, 0.015055144896577895, 0.7518742899580008]
];
const D50_TO_D65 = [
	[0.9554734527042182, -0.023098536874261423, 0.0632593086610217],
	[-0.028369706963208136, 1.0099954580058226, 0.021041398966943008],
	[0.012314001688319899, -0.020507696433477912, 1.3303659366080753]
];

function mul(m, v) {
	return [
		m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
		m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
		m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
	];
}

// ---------------------------------------------------------------- named colours

/** The full CSS named-colour set. A partial list would silently fail to parse. */
export const NAMED = {
	aliceblue: '#f0f8ff',
	antiquewhite: '#faebd7',
	aqua: '#00ffff',
	aquamarine: '#7fffd4',
	azure: '#f0ffff',
	beige: '#f5f5dc',
	bisque: '#ffe4c4',
	black: '#000000',
	blanchedalmond: '#ffebcd',
	blue: '#0000ff',
	blueviolet: '#8a2be2',
	brown: '#a52a2a',
	burlywood: '#deb887',
	cadetblue: '#5f9ea0',
	chartreuse: '#7fff00',
	chocolate: '#d2691e',
	coral: '#ff7f50',
	cornflowerblue: '#6495ed',
	cornsilk: '#fff8dc',
	crimson: '#dc143c',
	cyan: '#00ffff',
	darkblue: '#00008b',
	darkcyan: '#008b8b',
	darkgoldenrod: '#b8860b',
	darkgray: '#a9a9a9',
	darkgreen: '#006400',
	darkgrey: '#a9a9a9',
	darkkhaki: '#bdb76b',
	darkmagenta: '#8b008b',
	darkolivegreen: '#556b2f',
	darkorange: '#ff8c00',
	darkorchid: '#9932cc',
	darkred: '#8b0000',
	darksalmon: '#e9967a',
	darkseagreen: '#8fbc8f',
	darkslateblue: '#483d8b',
	darkslategray: '#2f4f4f',
	darkslategrey: '#2f4f4f',
	darkturquoise: '#00ced1',
	darkviolet: '#9400d3',
	deeppink: '#ff1493',
	deepskyblue: '#00bfff',
	dimgray: '#696969',
	dimgrey: '#696969',
	dodgerblue: '#1e90ff',
	firebrick: '#b22222',
	floralwhite: '#fffaf0',
	forestgreen: '#228b22',
	fuchsia: '#ff00ff',
	gainsboro: '#dcdcdc',
	ghostwhite: '#f8f8ff',
	gold: '#ffd700',
	goldenrod: '#daa520',
	gray: '#808080',
	green: '#008000',
	greenyellow: '#adff2f',
	grey: '#808080',
	honeydew: '#f0fff0',
	hotpink: '#ff69b4',
	indianred: '#cd5c5c',
	indigo: '#4b0082',
	ivory: '#fffff0',
	khaki: '#f0e68c',
	lavender: '#e6e6fa',
	lavenderblush: '#fff0f5',
	lawngreen: '#7cfc00',
	lemonchiffon: '#fffacd',
	lightblue: '#add8e6',
	lightcoral: '#f08080',
	lightcyan: '#e0ffff',
	lightgoldenrodyellow: '#fafad2',
	lightgray: '#d3d3d3',
	lightgreen: '#90ee90',
	lightgrey: '#d3d3d3',
	lightpink: '#ffb6c1',
	lightsalmon: '#ffa07a',
	lightseagreen: '#20b2aa',
	lightskyblue: '#87cefa',
	lightslategray: '#778899',
	lightslategrey: '#778899',
	lightsteelblue: '#b0c4de',
	lightyellow: '#ffffe0',
	lime: '#00ff00',
	limegreen: '#32cd32',
	linen: '#faf0e6',
	magenta: '#ff00ff',
	maroon: '#800000',
	mediumaquamarine: '#66cdaa',
	mediumblue: '#0000cd',
	mediumorchid: '#ba55d3',
	mediumpurple: '#9370db',
	mediumseagreen: '#3cb371',
	mediumslateblue: '#7b68ee',
	mediumspringgreen: '#00fa9a',
	mediumturquoise: '#48d1cc',
	mediumvioletred: '#c71585',
	midnightblue: '#191970',
	mintcream: '#f5fffa',
	mistyrose: '#ffe4e1',
	moccasin: '#ffe4b5',
	navajowhite: '#ffdead',
	navy: '#000080',
	oldlace: '#fdf5e6',
	olive: '#808000',
	olivedrab: '#6b8e23',
	orange: '#ffa500',
	orangered: '#ff4500',
	orchid: '#da70d6',
	palegoldenrod: '#eee8aa',
	palegreen: '#98fb98',
	paleturquoise: '#afeeee',
	palevioletred: '#db7093',
	papayawhip: '#ffefd5',
	peachpuff: '#ffdab9',
	peru: '#cd853f',
	pink: '#ffc0cb',
	plum: '#dda0dd',
	powderblue: '#b0e0e6',
	purple: '#800080',
	rebeccapurple: '#663399',
	red: '#ff0000',
	rosybrown: '#bc8f8f',
	royalblue: '#4169e1',
	saddlebrown: '#8b4513',
	salmon: '#fa8072',
	sandybrown: '#f4a460',
	seagreen: '#2e8b57',
	seashell: '#fff5ee',
	sienna: '#a0522d',
	silver: '#c0c0c0',
	skyblue: '#87ceeb',
	slateblue: '#6a5acd',
	slategray: '#708090',
	slategrey: '#708090',
	snow: '#fffafa',
	springgreen: '#00ff7f',
	steelblue: '#4682b4',
	tan: '#d2b48c',
	teal: '#008080',
	thistle: '#d8bfd8',
	tomato: '#ff6347',
	turquoise: '#40e0d0',
	violet: '#ee82ee',
	wheat: '#f5deb3',
	white: '#ffffff',
	whitesmoke: '#f5f5f5',
	yellow: '#ffff00',
	yellowgreen: '#9acd32'
};

// ---------------------------------------------------------------- sRGB <-> linear

function toLinear(c) {
	const s = c < 0 ? -1 : 1;
	const a = Math.abs(c);
	return s * (a <= 0.04045 ? a / 12.92 : Math.pow((a + 0.055) / 1.055, 2.4));
}
function fromLinear(c) {
	const s = c < 0 ? -1 : 1;
	const a = Math.abs(c);
	return s * (a <= 0.0031308 ? a * 12.92 : 1.055 * Math.pow(a, 1 / 2.4) - 0.055);
}

// ---------------------------------------------------------------- spaces

export function rgbToXyz(rgb) {
	return mul(LIN_SRGB_TO_XYZ_D65, rgb.map(toLinear));
}
export function xyzToRgb(xyz) {
	return mul(XYZ_D65_TO_LIN_SRGB, xyz).map(fromLinear);
}

export function rgbToLab(rgb) {
	const xyz = mul(D65_TO_D50, rgbToXyz(rgb));
	const f = xyz.map((v, i) => {
		const t = v / D50[i];
		return t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116;
	});
	return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])];
}
export function labToRgb(lab) {
	const [L, a, b] = lab;
	const fy = (L + 16) / 116;
	const fx = a / 500 + fy;
	const fz = fy - b / 200;
	const xyzD50 = [
		(Math.pow(fx, 3) > EPS ? Math.pow(fx, 3) : (116 * fx - 16) / KAPPA) * D50[0],
		(L > KAPPA * EPS ? Math.pow((L + 16) / 116, 3) : L / KAPPA) * D50[1],
		(Math.pow(fz, 3) > EPS ? Math.pow(fz, 3) : (116 * fz - 16) / KAPPA) * D50[2]
	];
	return xyzToRgb(mul(D50_TO_D65, xyzD50));
}

export function rgbToOklab(rgb) {
	const [r, g, b] = rgb.map(toLinear);
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
	];
}
export function oklabToRgb(oklab) {
	const [L, A, B] = oklab;
	const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3);
	const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3);
	const s = Math.pow(L - 0.0894841775 * A - 1.291485548 * B, 3);
	return [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
	].map(fromLinear);
}

/** Polar forms. Hue is undefined at zero chroma, so it is reported as 0 there. */
function toPolar(rect) {
	const [L, a, b] = rect;
	const c = Math.sqrt(a * a + b * b);
	let hue = c < 1e-8 ? 0 : (Math.atan2(b, a) * 180) / Math.PI;
	if (hue < 0) hue += 360;
	return [L, c, hue];
}
function fromPolar(polar) {
	const [L, c, hue] = polar;
	const r = (hue * Math.PI) / 180;
	return [L, c * Math.cos(r), c * Math.sin(r)];
}
export const rgbToLch = (rgb) => toPolar(rgbToLab(rgb));
export const lchToRgb = (lch) => labToRgb(fromPolar(lch));
export const rgbToOklch = (rgb) => toPolar(rgbToOklab(rgb));
export const oklchToRgb = (lch) => oklabToRgb(fromPolar(lch));

export function rgbToHsl(rgb) {
	const [r, g, b] = rgb;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	const d = max - min;
	if (d < 1e-10) return [0, 0, l * 100];
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let hue;
	if (max === r) hue = ((g - b) / d) % 6;
	else if (max === g) hue = (b - r) / d + 2;
	else hue = (r - g) / d + 4;
	hue *= 60;
	if (hue < 0) hue += 360;
	return [hue, s * 100, l * 100];
}
export function hslToRgb(hsl) {
	const [h, s, l] = hsl;
	const S = s / 100;
	const L = l / 100;
	const k = (n) => (n + h / 30) % 12;
	const a = S * Math.min(L, 1 - L);
	const f = (n) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
	return [f(0), f(8), f(4)];
}

export function rgbToHsv(rgb) {
	const [r, g, b] = rgb;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const d = max - min;
	let hue = 0;
	if (d >= 1e-10) {
		if (max === r) hue = ((g - b) / d) % 6;
		else if (max === g) hue = (b - r) / d + 2;
		else hue = (r - g) / d + 4;
		hue *= 60;
		if (hue < 0) hue += 360;
	}
	return [hue, max < 1e-10 ? 0 : (d / max) * 100, max * 100];
}
export function hsvToRgb(hsv) {
	const [h, s, v] = hsv;
	const S = s / 100;
	const V = v / 100;
	const f = (n) => {
		const k = (n + h / 60) % 6;
		return V - V * S * Math.max(0, Math.min(k, Math.min(4 - k, 1)));
	};
	return [f(5), f(3), f(1)];
}

export function rgbToHwb(rgb) {
	const hue = rgbToHsv(rgb)[0];
	return [
		hue,
		Math.min(rgb[0], rgb[1], rgb[2]) * 100,
		(1 - Math.max(rgb[0], rgb[1], rgb[2])) * 100
	];
}
export function hwbToRgb(hwb) {
	const [h, w, b] = hwb;
	const W = w / 100;
	const B = b / 100;
	if (W + B >= 1) {
		const grey = W / (W + B);
		return [grey, grey, grey];
	}
	return hslToRgb([h, 100, 50]).map((c) => c * (1 - W - B) + W);
}

/**
 * The naive device conversion. There is no ICC profile here and no printer
 * anywhere in the loop, so this is a convenience for reading values out, not a
 * print-accurate result — and the surface has to say so.
 */
export function rgbToCmyk(rgb) {
	const [r, g, b] = rgb;
	const k = 1 - Math.max(r, g, b);
	if (k >= 1 - 1e-10) return [0, 0, 0, 100];
	return [
		((1 - r - k) / (1 - k)) * 100,
		((1 - g - k) / (1 - k)) * 100,
		((1 - b - k) / (1 - k)) * 100,
		k * 100
	];
}
export function cmykToRgb(cmyk) {
	const [c, m, y, k] = cmyk;
	const K = k / 100;
	return [(1 - c / 100) * (1 - K), (1 - m / 100) * (1 - K), (1 - y / 100) * (1 - K)];
}

// ---------------------------------------------------------------- parsing

const NUM = '[-+]?(?:\\d*\\.\\d+|\\d+)';

function nums(body, count) {
	const found = body.match(new RegExp(NUM, 'g')) || [];
	if (found.length < count) {
		throw new Error('Expected ' + count + ' numbers, found ' + found.length + '.');
	}
	return found.slice(0, count).map(Number);
}

/**
 * Alpha, which may be written as a number or a percentage, after either a comma
 * or a slash. Absent alpha is opaque — never zero, which would silently make
 * every colour invisible.
 */
function alphaOf(body, componentCount) {
	const all = body.match(new RegExp(NUM + '\\s*%?', 'g')) || [];
	if (all.length <= componentCount) return 1;
	const tail = all[componentCount].trim();
	const value = parseFloat(tail);
	if (!Number.isFinite(value)) return 1;
	return Math.max(0, Math.min(1, tail.endsWith('%') ? value / 100 : value));
}

/** Whether the first component was written as a percentage. */
function firstIsPercent(body) {
	const m = body.trim().match(new RegExp('^' + NUM + '\\s*%'));
	return Boolean(m);
}

/**
 * Parses any supported notation into { rgb, alpha, space }.
 *
 * `space` records what the value was WRITTEN as, not what it was converted to.
 * Losing that is how a picker starts telling someone their OKLCH value is a hex
 * colour — true of the result, false about their intent.
 */
export function parse(input) {
	const text = String(input === undefined || input === null ? '' : input)
		.trim()
		.toLowerCase();
	if (!text) throw new Error('Nothing to read.');

	if (NAMED[text]) {
		const base = parse(NAMED[text]);
		return { rgb: base.rgb, alpha: 1, space: 'named', name: text };
	}
	if (text === 'transparent')
		return { rgb: [0, 0, 0], alpha: 0, space: 'named', name: 'transparent' };

	if (text[0] === '#') {
		const hex = text.slice(1);
		if (!/^[0-9a-f]+$/.test(hex) || ![3, 4, 6, 8].includes(hex.length)) {
			throw new Error('A hex colour needs 3, 4, 6 or 8 hex digits.');
		}
		const wide = hex.length >= 6;
		const step = wide ? 2 : 1;
		const chan = (i) => {
			const part = hex.substr(i * step, step);
			return parseInt(wide ? part : part + part, 16) / 255;
		};
		const withAlpha = hex.length === 4 || hex.length === 8;
		return {
			rgb: [chan(0), chan(1), chan(2)],
			alpha: withAlpha ? chan(3) : 1,
			space: withAlpha ? 'hex8' : 'hex'
		};
	}

	const fn = text.match(/^([a-z-]+)\s*\(([^)]*)\)$/);
	if (!fn) throw new Error('That is not a colour this can read.');
	const name = fn[1];
	const body = fn[2];

	switch (name) {
		case 'rgb':
		case 'rgba': {
			const v = nums(body, 3);
			// Percentages and 0-255 are both legal and mean different things, so the
			// notation decides the scale rather than a guess about magnitude.
			const percent = (body.match(new RegExp(NUM + '\\s*%', 'g')) || []).length >= 3;
			return {
				rgb: v.map((c) => (percent ? c / 100 : c / 255)),
				alpha: alphaOf(body, 3),
				space: 'rgb'
			};
		}
		case 'hsl':
		case 'hsla':
			return { rgb: hslToRgb(nums(body, 3)), alpha: alphaOf(body, 3), space: 'hsl' };
		case 'hsv':
			return { rgb: hsvToRgb(nums(body, 3)), alpha: alphaOf(body, 3), space: 'hsv' };
		case 'hwb':
			return { rgb: hwbToRgb(nums(body, 3)), alpha: alphaOf(body, 3), space: 'hwb' };
		case 'lab':
			return { rgb: labToRgb(nums(body, 3)), alpha: alphaOf(body, 3), space: 'lab' };
		case 'lch':
			return { rgb: lchToRgb(nums(body, 3)), alpha: alphaOf(body, 3), space: 'lch' };
		case 'oklab': {
			const v = nums(body, 3);
			// OKLab lightness is 0-1, but CSS also allows a percentage of that range.
			const L = firstIsPercent(body) ? v[0] / 100 : v[0];
			return { rgb: oklabToRgb([L, v[1], v[2]]), alpha: alphaOf(body, 3), space: 'oklab' };
		}
		case 'oklch': {
			const v = nums(body, 3);
			const L = firstIsPercent(body) ? v[0] / 100 : v[0];
			return { rgb: oklchToRgb([L, v[1], v[2]]), alpha: alphaOf(body, 3), space: 'oklch' };
		}
		case 'cmyk':
		case 'device-cmyk':
			return { rgb: cmykToRgb(nums(body, 4)), alpha: alphaOf(body, 4), space: 'cmyk' };
		default:
			throw new Error('"' + name + '()" is not a colour notation this understands.');
	}
}

// ---------------------------------------------------------------- gamut

/**
 * Whether an sRGB triple is representable without clipping.
 *
 * The tolerance is there because a legitimate round trip lands a hair outside
 * on the last bit. Anything further out is a genuinely out-of-gamut colour, and
 * the surface must warn BEFORE applying it rather than silently clamping and
 * showing something else.
 */
export function inGamut(rgb, tolerance = 1e-5) {
	return rgb.every((c) => c >= -tolerance && c <= 1 + tolerance);
}

export function clip(rgb) {
	return rgb.map((c) => Math.max(0, Math.min(1, c)));
}

/** How far outside sRGB a colour sits, as the largest single-channel overshoot. */
export function overshoot(rgb) {
	return Math.max(
		0,
		Math.max.apply(
			null,
			rgb.map((c) => Math.max(-c, c - 1))
		)
	);
}

// ---------------------------------------------------------------- contrast

export function relativeLuminance(rgb) {
	const [r, g, b] = clip(rgb).map(toLinear);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio, 1 to 21. */
export function contrast(a, b) {
	const la = relativeLuminance(a);
	const lb = relativeLuminance(b);
	const hi = Math.max(la, lb);
	const lo = Math.min(la, lb);
	return (hi + 0.05) / (lo + 0.05);
}

/** The WCAG grade a ratio earns, stated plainly rather than as a bare number. */
export function grade(ratio, large = false) {
	if (large) {
		if (ratio >= 4.5) return 'AAA';
		if (ratio >= 3) return 'AA';
		return 'fails';
	}
	if (ratio >= 7) return 'AAA';
	if (ratio >= 4.5) return 'AA';
	if (ratio >= 3) return 'AA at large sizes only';
	return 'fails';
}

// ---------------------------------------------------------------- formatting

function r2(n, places = 2) {
	const v = Number(n.toFixed(places));
	return Object.is(v, -0) ? 0 : v;
}
function hex2(v) {
	return Math.round(Math.max(0, Math.min(1, v)) * 255)
		.toString(16)
		.padStart(2, '0');
}

/** Every supported notation for one colour, with alpha carried through each. */
export function formats(rgb, alpha = 1) {
	const c = clip(rgb);
	const a = Math.max(0, Math.min(1, alpha));
	const hasAlpha = a < 1 - 1e-9;
	const hsl = rgbToHsl(c);
	const hsv = rgbToHsv(c);
	const hwb = rgbToHwb(c);
	const lab = rgbToLab(c);
	const lch = rgbToLch(c);
	const oklab = rgbToOklab(c);
	const oklch = rgbToOklch(c);
	const cmyk = rgbToCmyk(c);
	const al = hasAlpha ? ' / ' + r2(a, 3) : '';

	const out = {
		hex: '#' + hex2(c[0]) + hex2(c[1]) + hex2(c[2]),
		hex8: '#' + hex2(c[0]) + hex2(c[1]) + hex2(c[2]) + hex2(a),
		rgb: 'rgb(' + c.map((v) => Math.round(v * 255)).join(' ') + al + ')',
		hsl: 'hsl(' + r2(hsl[0], 1) + ' ' + r2(hsl[1], 1) + '% ' + r2(hsl[2], 1) + '%' + al + ')',
		hsv: 'hsv(' + r2(hsv[0], 1) + ' ' + r2(hsv[1], 1) + '% ' + r2(hsv[2], 1) + '%' + al + ')',
		hwb: 'hwb(' + r2(hwb[0], 1) + ' ' + r2(hwb[1], 1) + '% ' + r2(hwb[2], 1) + '%' + al + ')',
		lab: 'lab(' + r2(lab[0]) + '% ' + r2(lab[1]) + ' ' + r2(lab[2]) + al + ')',
		lch: 'lch(' + r2(lch[0]) + '% ' + r2(lch[1]) + ' ' + r2(lch[2], 1) + al + ')',
		oklab: 'oklab(' + r2(oklab[0], 4) + ' ' + r2(oklab[1], 4) + ' ' + r2(oklab[2], 4) + al + ')',
		oklch: 'oklch(' + r2(oklch[0], 4) + ' ' + r2(oklch[1], 4) + ' ' + r2(oklch[2], 1) + al + ')',
		cmyk: 'cmyk(' + cmyk.map((v) => r2(v, 1) + '%').join(' ') + ')'
	};

	// A name is offered only on an exact match. "Close to tomato" is a different
	// colour, and presenting it as a name would quietly change the value.
	const exact = Object.keys(NAMED).find((n) => NAMED[n] === out.hex);
	if (exact && !hasAlpha) out.named = exact;
	return out;
}

/** A CSS string that keeps alpha, for actually applying the colour. */
export function css(rgb, alpha = 1) {
	const f = formats(rgb, alpha);
	return alpha < 1 - 1e-9 ? f.rgb : f.hex;
}

/**
 * Everything a picker needs to describe a colour honestly: the value, the space
 * it was written in, whether sRGB can show it, and how it reads against a
 * background.
 */
export function describe(input, background = [1, 1, 1]) {
	const parsed = parse(input);
	const ok = inGamut(parsed.rgb);
	const shown = clip(parsed.rgb);
	const ratio = contrast(shown, background);
	return {
		rgb: parsed.rgb,
		alpha: parsed.alpha,
		space: parsed.space,
		name: parsed.name,
		inGamut: ok,
		overshoot: ok ? 0 : overshoot(parsed.rgb),
		displayed: shown,
		formats: formats(shown, parsed.alpha),
		contrast: ratio,
		grade: grade(ratio),
		css: css(shown, parsed.alpha)
	};
}
