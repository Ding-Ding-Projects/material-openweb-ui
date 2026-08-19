#!/usr/bin/env node
// Renders the application mark to the icon files the installer needs.
//
// Written as a rasteriser rather than as a checked-in binary, for one reason:
// an icon pasted in as bytes is a file nobody can regenerate, and the day the
// seed colour changes it becomes quietly wrong with no way to tell. This reads
// the same #6750A4 the token sheet uses and draws the same shape the seed
// preset draws, so the icon and the application cannot drift apart.
//
// No image library. A rounded rectangle and a polygon are a few lines of
// arithmetic each, and zlib — which encodes the PNG — is in Node already.
//
//   node scripts/make-icon.mjs

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'build-resources');

/** The seed, read from the token sheet rather than repeated here. */
function seedColour() {
	const tokens = readFileSync(join(ROOT, 'docs', 'assets', 'css', 'tokens.css'), 'utf8');
	const m = tokens.match(/--p:\s*#([0-9a-fA-F]{6})/);
	if (!m) throw new Error('The seed colour could not be read from tokens.css.');
	const hex = m[1];
	return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

// ---------------------------------------------------------------- drawing

function canvas(size) {
	// RGBA, transparent to begin with.
	return { size, px: new Uint8Array(size * size * 4) };
}

function set(c, x, y, [r, g, b], a = 255) {
	if (x < 0 || y < 0 || x >= c.size || y >= c.size) return;
	const i = (y * c.size + x) * 4;
	// Source-over, so an antialiased edge blends with what is underneath.
	const sa = a / 255;
	const da = c.px[i + 3] / 255;
	const out = sa + da * (1 - sa);
	if (out === 0) return;
	c.px[i] = Math.round((r * sa + c.px[i] * da * (1 - sa)) / out);
	c.px[i + 1] = Math.round((g * sa + c.px[i + 1] * da * (1 - sa)) / out);
	c.px[i + 2] = Math.round((b * sa + c.px[i + 2] * da * (1 - sa)) / out);
	c.px[i + 3] = Math.round(out * 255);
}

/**
 * Coverage of one pixel by a shape, sampled on a 4x4 grid.
 *
 * Sampling rather than an exact area calculation: an icon is looked at, not
 * measured, and sixteen samples is the difference between a jagged edge and one
 * nobody notices.
 */
function coverage(x, y, inside) {
	let hits = 0;
	for (let sy = 0; sy < 4; sy++) {
		for (let sx = 0; sx < 4; sx++) {
			if (inside(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) hits++;
		}
	}
	return hits / 16;
}

function fill(c, colour, inside) {
	for (let y = 0; y < c.size; y++) {
		for (let x = 0; x < c.size; x++) {
			const a = coverage(x, y, inside);
			if (a > 0) set(c, x, y, colour, Math.round(a * 255));
		}
	}
}

/** A rounded rectangle, as the Material shape scale draws it. */
function roundedRect(x0, y0, w, h, r) {
	return (px, py) => {
		if (px < x0 || py < y0 || px > x0 + w || py > y0 + h) return false;
		const cx = Math.min(Math.max(px, x0 + r), x0 + w - r);
		const cy = Math.min(Math.max(py, y0 + r), y0 + h - r);
		return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
	};
}

/** Point-in-polygon, even-odd. */
function polygon(points) {
	return (px, py) => {
		let inside = false;
		for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
			const [xi, yi] = points[i];
			const [xj, yj] = points[j];
			if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
		}
		return inside;
	};
}

/**
 * The seed mark: a rounded square in the seed colour, with the same white
 * zig-zag the preset in app/js/core/logo.js draws, scaled from its 64-unit
 * viewBox to whatever size is asked for.
 */
function drawMark(size) {
	const c = canvas(size);
	const u = size / 64;
	fill(c, seedColour(), roundedRect(0, 0, size, size, 16 * u));
	// M 20 44 V 20 h8 l4 12 l4-12 h8 v24 h-6 V30 l-4 12 h-4 l-4-12 v14 z
	const pts = [
		[20, 44], [20, 20], [28, 20], [32, 32], [36, 20], [44, 20],
		[44, 44], [38, 44], [38, 30], [34, 42], [30, 42], [26, 30], [26, 44]
	].map(([x, y]) => [x * u, y * u]);
	fill(c, [255, 255, 255], polygon(pts));
	return c;
}

// ---------------------------------------------------------------- PNG

function crc32(buf) {
	let c;
	const table = [];
	for (let n = 0; n < 256; n++) {
		c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	let crc = 0xffffffff;
	for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([len, body, crc]);
}

function toPng(c) {
	const raw = Buffer.alloc((c.size * 4 + 1) * c.size);
	for (let y = 0; y < c.size; y++) {
		// Filter type 0 (none) per scanline. Good enough: these are flat colours
		// and zlib handles them well without a predictor.
		raw[y * (c.size * 4 + 1)] = 0;
		Buffer.from(c.px.buffer, y * c.size * 4, c.size * 4).copy(raw, y * (c.size * 4 + 1) + 1);
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(c.size, 0);
	ihdr.writeUInt32BE(c.size, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // colour type: RGBA
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', deflateSync(raw, { level: 9 })),
		chunk('IEND', Buffer.alloc(0))
	]);
}

// ---------------------------------------------------------------- ICO

/**
 * A Windows icon containing several PNG-encoded sizes.
 *
 * PNG inside ICO is what Vista and later expect for anything 256 wide; the
 * smaller entries are there because Windows picks by size rather than scaling,
 * and a 256 icon shrunk to 16 for the taskbar looks like porridge.
 */
function toIco(images) {
	const header = Buffer.alloc(6);
	header.writeUInt16LE(0, 0);
	header.writeUInt16LE(1, 2); // type: icon
	header.writeUInt16LE(images.length, 4);

	const entries = [];
	const bodies = [];
	let offset = 6 + images.length * 16;
	for (const { size, png } of images) {
		const e = Buffer.alloc(16);
		e[0] = size >= 256 ? 0 : size; // 0 means 256
		e[1] = size >= 256 ? 0 : size;
		e[2] = 0; // colours in palette
		e[3] = 0; // reserved
		e.writeUInt16LE(1, 4); // colour planes
		e.writeUInt16LE(32, 6); // bits per pixel
		e.writeUInt32BE(0, 8);
		e.writeUInt32LE(png.length, 8);
		e.writeUInt32LE(offset, 12);
		entries.push(e);
		bodies.push(png);
		offset += png.length;
	}
	return Buffer.concat([header, ...entries, ...bodies]);
}

// ---------------------------------------------------------------- write

mkdirSync(OUT, { recursive: true });

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const images = SIZES.map((size) => ({ size, png: toPng(drawMark(size)) }));

writeFileSync(join(OUT, 'icon.png'), images[images.length - 1].png);
writeFileSync(join(OUT, 'icon.ico'), toIco(images));

console.log('build-resources/icon.png  ' + images[images.length - 1].png.length + ' bytes (256x256)');
console.log('build-resources/icon.ico  ' + toIco(images).length + ' bytes (' + SIZES.join(', ') + ')');
console.log('Drawn from the seed in tokens.css, so the icon cannot drift from the palette.');
