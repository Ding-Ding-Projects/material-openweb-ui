// The application mark.
//
// This is presentation and nothing else. The rule the contract is emphatic
// about — and the one that is easy to break by being helpful — is that the mark
// and the display name never move the application's IDENTITY. The data
// directory, the package identifier, the executable name and the update feed
// are derived from a constant, so renaming the window cannot orphan someone's
// settings or point their updates at nothing.
//
// The other half is the decoder. A file called `logo.png` is not a PNG; the
// bytes decide. Everything here inspects the actual header, bounds what it will
// hand to a decoder, and refuses as a whole — a rejected image must not leave
// half of itself applied, because the half that lands is the half nobody
// checked.

import { sniff } from './convert.js';

// ---------------------------------------------------------------- identity

/**
 * Fixed for the life of the application.
 *
 * Every one of these is deliberately a literal rather than anything derived
 * from a setting. A display name that reaches the data directory means renaming
 * the window loses every chat; one that reaches the update feed means renaming
 * it silently stops updates. Neither failure announces itself.
 */
export const IDENTITY = Object.freeze({
	packageId: 'com.dingdingprojects.material-openwebui',
	executable: 'material-openwebui',
	dataDirectory: 'material-openweb-ui',
	updateFeed: 'https://github.com/Ding-Ding-Projects/material-openweb-ui/releases'
});

// ---------------------------------------------------------------- bounds

export const LIMITS = Object.freeze({
	maxBytes: 4 * 1024 * 1024,
	maxDimension: 4096,
	maxPixels: 8 * 1024 * 1024,
	maxFrames: 1
});

// ---------------------------------------------------------------- presets

/**
 * Marks that ship with the application, drawn in code.
 *
 * Drawn rather than shipped as files so a preset cannot be the thing that
 * fails to load, and so each one scales to any variant size without a second
 * asset.
 */
export const PRESETS = [
	{
		id: 'seed',
		label: 'Seed',
		svg: '<rect width="64" height="64" rx="16" fill="#6750A4"/><path d="M20 44V20h8l4 12 4-12h8v24h-6V30l-4 12h-4l-4-12v14z" fill="#FFFFFF"/>'
	},
	{
		id: 'ring',
		label: 'Ring',
		svg: '<rect width="64" height="64" rx="16" fill="#EADDFF"/><circle cx="32" cy="32" r="16" fill="none" stroke="#21005D" stroke-width="7"/>'
	},
	{
		id: 'steam',
		label: 'Steam basket',
		svg: '<rect width="64" height="64" rx="16" fill="#7D5260"/><path d="M14 38h36a4 4 0 0 1-4 10H18a4 4 0 0 1-4-10z" fill="#FFD8E4"/><path d="M24 26c0-4 4-4 4-8M32 24c0-4 4-4 4-8M40 26c0-4 4-4 4-8" stroke="#FFD8E4" stroke-width="3" fill="none" stroke-linecap="round"/>'
	},
	{
		id: 'mono',
		label: 'Monochrome',
		svg: '<rect width="64" height="64" rx="16" fill="#1D1B20"/><path d="M32 16l14 8v16l-14 8-14-8V24z" fill="none" stroke="#E6E0E9" stroke-width="4"/>'
	}
];

export function presetSvg(preset, size = 64) {
	return (
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="' +
		size +
		'" height="' +
		size +
		'" role="img" aria-label="' +
		preset.label +
		' application mark">' +
		preset.svg +
		'</svg>'
	);
}

// ---------------------------------------------------------------- header reading

function be32(u8, at) {
	return ((u8[at] << 24) | (u8[at + 1] << 16) | (u8[at + 2] << 8) | u8[at + 3]) >>> 0;
}
function le16(u8, at) {
	return u8[at] | (u8[at + 1] << 8);
}
function le32(u8, at) {
	return (u8[at] | (u8[at + 1] << 8) | (u8[at + 2] << 16) | (u8[at + 3] << 24)) >>> 0;
}
function has(u8, at, bytes) {
	if (u8.length < at + bytes.length) return false;
	for (let i = 0; i < bytes.length; i++) if (u8[at + i] !== bytes[i]) return false;
	return true;
}

/**
 * Width, height and frame count read from the file's own header.
 *
 * Read rather than asked of a decoder, because the whole point is to decide
 * whether this file should be handed to a decoder AT ALL. A 60000x60000 PNG is
 * a few kilobytes on disk and fourteen gigabytes once decoded; discovering that
 * from the decoder is discovering it too late.
 */
export function readDimensions(u8) {
	// PNG: IHDR is always the first chunk, at a fixed offset.
	if (has(u8, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
		if (u8.length < 24 || !has(u8, 12, [0x49, 0x48, 0x44, 0x52])) {
			throw new Error(
				'The PNG signature is present but the IHDR header is not where a PNG puts it.'
			);
		}
		// An APNG announces itself with an acTL chunk before the first frame.
		const head = u8.subarray(0, Math.min(u8.length, 4096));
		let frames = 1;
		for (let i = 8; i + 8 < head.length; i++) {
			if (has(head, i, [0x61, 0x63, 0x54, 0x4c])) {
				frames = be32(head, i + 4) || 2;
				break;
			}
		}
		return { width: be32(u8, 16), height: be32(u8, 20), frames, format: 'PNG' };
	}

	// GIF: the logical screen descriptor is little-endian at offset 6. Each frame
	// is introduced by an image separator, so they can be counted.
	if (has(u8, 0, [0x47, 0x49, 0x46, 0x38])) {
		let frames = 0;
		for (let i = 13; i < u8.length; i++) if (u8[i] === 0x2c) frames++;
		return { width: le16(u8, 6), height: le16(u8, 8), frames: Math.max(1, frames), format: 'GIF' };
	}

	// BMP: the DIB header carries a signed height, negative for top-down rows.
	if (has(u8, 0, [0x42, 0x4d])) {
		if (u8.length < 26) throw new Error('The BMP header is truncated.');
		const height = le32(u8, 22) | 0;
		return { width: le32(u8, 18), height: Math.abs(height), frames: 1, format: 'BMP' };
	}

	// WebP: three sub-formats, each storing its size somewhere different.
	if (has(u8, 0, [0x52, 0x49, 0x46, 0x46]) && has(u8, 8, [0x57, 0x45, 0x42, 0x50])) {
		if (has(u8, 12, [0x56, 0x50, 0x38, 0x58])) {
			// VP8X, extended
			const width = 1 + (u8[24] | (u8[25] << 8) | (u8[26] << 16));
			const height = 1 + (u8[27] | (u8[28] << 8) | (u8[29] << 16));
			const animated = (u8[20] & 0x02) !== 0;
			return { width, height, frames: animated ? 2 : 1, format: 'WebP' };
		}
		if (has(u8, 12, [0x56, 0x50, 0x38, 0x20])) {
			// VP8, lossy
			return {
				width: le16(u8, 26) & 0x3fff,
				height: le16(u8, 28) & 0x3fff,
				frames: 1,
				format: 'WebP'
			};
		}
		if (has(u8, 12, [0x56, 0x50, 0x38, 0x4c])) {
			// VP8L, lossless: 14 bits each, bit-packed
			const bits = u8[21] | (u8[22] << 8) | (u8[23] << 16) | (u8[24] << 24);
			return {
				width: (bits & 0x3fff) + 1,
				height: ((bits >>> 14) & 0x3fff) + 1,
				frames: 1,
				format: 'WebP'
			};
		}
		throw new Error('The WebP container carries no recognised bitstream.');
	}

	// JPEG: the size lives in whichever start-of-frame marker appears first, so
	// the segment chain has to be walked.
	if (has(u8, 0, [0xff, 0xd8, 0xff])) {
		let i = 2;
		while (i + 9 < u8.length) {
			if (u8[i] !== 0xff) {
				i++;
				continue;
			}
			const marker = u8[i + 1];
			if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
				i += 2;
				continue;
			}
			const length = (u8[i + 2] << 8) | u8[i + 3];
			const isFrame =
				marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
			if (isFrame) {
				return {
					width: (u8[i + 7] << 8) | u8[i + 8],
					height: (u8[i + 5] << 8) | u8[i + 6],
					frames: 1,
					format: 'JPEG'
				};
			}
			if (length < 2) break;
			i += 2 + length;
		}
		throw new Error('The JPEG carries no start-of-frame marker, so its size cannot be read.');
	}

	throw new Error('That is not an image format this can read the size of.');
}

// ---------------------------------------------------------------- inspection

const ACCEPTED = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp']);

/**
 * Everything decided before a decoder is involved.
 *
 * Returns a verdict object rather than throwing, so the caller can show the
 * exact reason. `ok: false` means nothing at all has been applied — the whole
 * point of doing this first.
 *
 * @param u8        the file's bytes
 * @param filename  only used to point out a mismatch, never to decide anything
 */
export function inspect(u8, filename = '', limits = LIMITS) {
	if (!u8 || !u8.length) {
		return { ok: false, reason: 'That file contains no bytes.' };
	}
	if (u8.length > limits.maxBytes) {
		return {
			ok: false,
			reason:
				'That file is ' +
				(u8.length / 1048576).toFixed(1) +
				' MB, and the limit is ' +
				limits.maxBytes / 1048576 +
				' MB. An application mark is drawn a few dozen pixels across.'
		};
	}

	const found = sniff(u8);
	if (!ACCEPTED.has(found.mime)) {
		const claimed = (filename.match(/\.([a-z0-9]+)$/i) || [])[1];
		return {
			ok: false,
			reason:
				'The bytes in that file are ' +
				found.type +
				', not an image this can use.' +
				(claimed
					? ' The name says .' +
						claimed.toLowerCase() +
						', but an extension is a label, not the contents.'
					: ''),
			evidence: found.evidence,
			sniffed: found.type
		};
	}

	let dims;
	try {
		dims = readDimensions(u8);
	} catch (e) {
		return { ok: false, reason: e.message, sniffed: found.type };
	}

	if (!dims.width || !dims.height) {
		return {
			ok: false,
			reason: 'That image reports a zero dimension, which no decoder can use.',
			sniffed: found.type
		};
	}
	if (dims.width > limits.maxDimension || dims.height > limits.maxDimension) {
		return {
			ok: false,
			reason:
				'That image is ' +
				dims.width +
				' by ' +
				dims.height +
				' pixels, and the limit on either side is ' +
				limits.maxDimension +
				'.',
			sniffed: found.type
		};
	}
	if (dims.width * dims.height > limits.maxPixels) {
		return {
			ok: false,
			reason:
				'That image is ' +
				((dims.width * dims.height) / 1048576).toFixed(1) +
				' megapixels, which is more than ' +
				'this will decode. Decoded, it would need roughly ' +
				((dims.width * dims.height * 4) / 1048576).toFixed(0) +
				' MB of memory.',
			sniffed: found.type
		};
	}

	// Animation is a note rather than a refusal: an application mark is a still
	// image, so the first frame is used and the surface says so. Refusing would
	// be tidier and would also reject a perfectly usable picture.
	const note =
		dims.frames > limits.maxFrames
			? 'That image has ' +
				dims.frames +
				' frames. An application mark is a still picture, so only the first is used.'
			: '';

	return {
		ok: true,
		width: dims.width,
		height: dims.height,
		frames: dims.frames,
		format: dims.format,
		mime: found.mime,
		sniffed: found.type,
		evidence: found.evidence,
		bytes: u8.length,
		note
	};
}

// ---------------------------------------------------------------- crop and focal point

/**
 * The square region actually used, from a crop rectangle and a focal point.
 *
 * Values are fractions of the source, so a crop survives the image being
 * re-decoded at a different size — which it is, once per variant.
 */
export function normaliseCrop(crop, width, height) {
	const c = {
		x: Math.max(0, Math.min(1, crop && Number.isFinite(crop.x) ? crop.x : 0)),
		y: Math.max(0, Math.min(1, crop && Number.isFinite(crop.y) ? crop.y : 0)),
		size: Math.max(0.05, Math.min(1, crop && Number.isFinite(crop.size) ? crop.size : 1))
	};
	// A crop may not run off the edge: the offset gives way, not the size, since
	// shrinking the size silently changes what was framed.
	const shortest = Math.min(width, height);
	const px = c.size * shortest;
	c.x = Math.min(c.x, Math.max(0, (width - px) / width));
	c.y = Math.min(c.y, Math.max(0, (height - px) / height));
	return c;
}

/**
 * The maskable safe area, as a fraction inset.
 *
 * Platforms crop an application mark to their own shape — a circle, a squircle,
 * a rounded square — and the corners are the first thing to go. Anything
 * outside this inset may not survive, so the preview shows the boundary rather
 * than letting someone discover it after installing.
 */
export const SAFE_AREA_INSET = 0.1;

export function safeAreaWarnings({ width, height, crop }) {
	const warnings = [];
	const c = normaliseCrop(crop, width, height);
	if (c.size > 0.98 && Math.min(width, height) / Math.max(width, height) < 0.9) {
		warnings.push(
			'The crop covers the whole of a non-square image, so the shorter side will be padded.'
		);
	}
	return warnings;
}

// ---------------------------------------------------------------- variants

export const VARIANT_SIZES = [16, 24, 32, 48, 64, 128, 256];

/**
 * Confirms a generated variant is what it claims to be.
 *
 * The contract asks for variants "verified by signature", and this is why: a
 * canvas export can fail and hand back a blob that is empty, or a data URL for
 * a format the platform silently substituted. Checking the bytes catches both,
 * where checking the requested MIME type catches neither.
 */
export function verifyVariant(u8, expectedMime = 'image/png') {
	if (!u8 || !u8.length) return { ok: false, reason: 'The encoder returned no bytes.' };
	const found = sniff(u8);
	if (found.mime !== expectedMime) {
		return {
			ok: false,
			reason: 'The encoder was asked for ' + expectedMime + ' and produced ' + found.type + '.',
			evidence: found.evidence
		};
	}
	let dims;
	try {
		dims = readDimensions(u8);
	} catch (e) {
		return { ok: false, reason: 'The generated image has an unreadable header: ' + e.message };
	}
	return {
		ok: true,
		width: dims.width,
		height: dims.height,
		bytes: u8.length,
		evidence: found.evidence
	};
}

// ---------------------------------------------------------------- contrast

/**
 * Whether the mark will be visible on the surfaces it is drawn on.
 *
 * A dark mark on a dark title bar is not a broken image and nothing errors —
 * it simply cannot be seen, which is exactly the kind of problem to raise
 * before it is applied rather than after.
 */
export function contrastWarnings(averageRgb, surfaces, contrastFn) {
	const out = [];
	for (const s of surfaces) {
		const ratio = contrastFn(averageRgb, s.rgb);
		if (ratio < 1.6) {
			out.push(
				'On the ' +
					s.label +
					' the mark is at ' +
					ratio.toFixed(2) +
					':1 against the background, which is close to invisible.'
			);
		}
	}
	return out;
}
