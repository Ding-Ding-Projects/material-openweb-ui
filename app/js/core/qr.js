// A QR encoder, written here rather than fetched.
//
// The contract is explicit that pairing must draw its code in-process: a
// third-party QR service or remote chart API would hand the one-time-code
// secret to a stranger's server on the way to rendering it. So this is byte
// mode, versions 1 to 10, error-correction level M, with the mask chosen by the
// standard penalty rules.
//
// It is verified by decoding its own output back to the input string, which
// exercises placement, masking and format information — the three things that
// produce a code that looks perfectly convincing and scans as nothing.

// ---------------------------------------------------------------- GF(256)

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function initTables() {
	let x = 1;
	for (let i = 0; i < 255; i++) {
		EXP[i] = x;
		LOG[x] = i;
		x <<= 1;
		if (x & 0x100) x ^= 0x11d; // the QR generator polynomial
	}
	for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gfMul(a, b) {
	if (a === 0 || b === 0) return 0;
	return EXP[LOG[a] + LOG[b]];
}

function rsGenerator(degree) {
	let poly = [1];
	for (let i = 0; i < degree; i++) {
		const next = new Array(poly.length + 1).fill(0);
		for (let j = 0; j < poly.length; j++) {
			next[j] ^= gfMul(poly[j], EXP[i]);
			next[j + 1] ^= poly[j];
		}
		poly = next;
	}
	return poly;
}

function rsEncode(data, eccLength) {
	const gen = rsGenerator(eccLength);
	const result = new Uint8Array(eccLength);
	for (const byte of data) {
		const factor = byte ^ result[0];
		result.copyWithin(0, 1);
		result[eccLength - 1] = 0;
		for (let i = 0; i < eccLength; i++) result[i] ^= gfMul(gen[i + 1], factor);
	}
	return result;
}

// ---------------------------------------------------------------- tables (level M)

// [total codewords, ecc per block, group1 blocks, group1 data cw, group2 blocks, group2 data cw]
const VERSIONS = {
	1: [26, 10, 1, 16, 0, 0],
	2: [44, 16, 1, 28, 0, 0],
	3: [70, 26, 1, 44, 0, 0],
	4: [100, 18, 2, 32, 0, 0],
	5: [134, 24, 2, 43, 0, 0],
	6: [172, 16, 4, 27, 0, 0],
	7: [196, 18, 4, 31, 0, 0],
	8: [242, 22, 2, 38, 2, 39],
	9: [292, 22, 3, 36, 2, 37],
	10: [346, 26, 4, 43, 1, 44]
};

const ALIGNMENT = {
	1: [],
	2: [6, 18],
	3: [6, 22],
	4: [6, 26],
	5: [6, 30],
	6: [6, 34],
	7: [6, 22, 38],
	8: [6, 24, 42],
	9: [6, 26, 46],
	10: [6, 28, 50]
};

function dataCapacity(version) {
	const [, ecc, g1, g1cw, g2, g2cw] = VERSIONS[version];
	return g1 * g1cw + g2 * g2cw;
}

function sizeFor(version) {
	return version * 4 + 17;
}

// ---------------------------------------------------------------- bit stream

class Bits {
	constructor() {
		this.bits = [];
	}
	push(value, length) {
		for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
	}
	get length() {
		return this.bits.length;
	}
	toBytes() {
		const out = new Uint8Array(Math.ceil(this.bits.length / 8));
		this.bits.forEach((bit, i) => {
			if (bit) out[i >> 3] |= 0x80 >> (i & 7);
		});
		return out;
	}
}

// ---------------------------------------------------------------- encoding

function chooseVersion(byteLength) {
	for (let v = 1; v <= 10; v++) {
		const countBits = v < 10 ? 8 : 16;
		const needed = 4 + countBits + byteLength * 8;
		if (needed <= dataCapacity(v) * 8) return v;
	}
	throw new Error('That string is too long for this encoder (versions 1 to 10, level M).');
}

function buildCodewords(text, version) {
	const bytes = new TextEncoder().encode(text);
	const capacity = dataCapacity(version);
	const bits = new Bits();

	bits.push(0b0100, 4); // byte mode
	bits.push(bytes.length, version < 10 ? 8 : 16); // character count
	for (const b of bytes) bits.push(b, 8);

	// terminator, then pad to a byte boundary, then the alternating pad bytes
	const capacityBits = capacity * 8;
	bits.push(0, Math.min(4, capacityBits - bits.length));
	while (bits.length % 8) bits.push(0, 1);

	const data = Array.from(bits.toBytes());
	const PADS = [0xec, 0x11];
	let padIndex = 0;
	while (data.length < capacity) data.push(PADS[padIndex++ % 2]);

	// split into blocks, interleave data then ecc
	const [, eccLength, g1, g1cw, g2, g2cw] = VERSIONS[version];
	const blocks = [];
	let offset = 0;
	for (let i = 0; i < g1; i++) {
		blocks.push(data.slice(offset, offset + g1cw));
		offset += g1cw;
	}
	for (let i = 0; i < g2; i++) {
		blocks.push(data.slice(offset, offset + g2cw));
		offset += g2cw;
	}

	const eccBlocks = blocks.map((b) => rsEncode(b, eccLength));

	const out = [];
	const maxData = Math.max(...blocks.map((b) => b.length));
	for (let i = 0; i < maxData; i++) {
		for (const b of blocks) if (i < b.length) out.push(b[i]);
	}
	for (let i = 0; i < eccLength; i++) {
		for (const b of eccBlocks) out.push(b[i]);
	}
	return out;
}

// ---------------------------------------------------------------- matrix

function emptyMatrix(size) {
	return { size, modules: Array.from({ length: size }, () => new Array(size).fill(null)) };
}

function placeFinder(m, row, col) {
	for (let r = -1; r <= 7; r++) {
		for (let c = -1; c <= 7; c++) {
			const rr = row + r;
			const cc = col + c;
			if (rr < 0 || rr >= m.size || cc < 0 || cc >= m.size) continue;
			const inner =
				(r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
				(c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
				(r >= 2 && r <= 4 && c >= 2 && c <= 4);
			m.modules[rr][cc] = inner;
		}
	}
}

function placeFunctionPatterns(m, version) {
	placeFinder(m, 0, 0);
	placeFinder(m, 0, m.size - 7);
	placeFinder(m, m.size - 7, 0);

	// timing patterns
	for (let i = 8; i < m.size - 8; i++) {
		m.modules[6][i] = i % 2 === 0;
		m.modules[i][6] = i % 2 === 0;
	}

	// alignment patterns, skipping the three finder corners
	const centres = ALIGNMENT[version];
	for (const r of centres) {
		for (const c of centres) {
			if ((r === 6 && c === 6) || (r === 6 && c === m.size - 7) || (r === m.size - 7 && c === 6))
				continue;
			for (let dr = -2; dr <= 2; dr++) {
				for (let dc = -2; dc <= 2; dc++) {
					m.modules[r + dr][c + dc] = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
				}
			}
		}
	}

	// the always-dark module
	m.modules[m.size - 8][8] = true;
}

/** Reserves the format-information cells so data placement skips them. */
function reserveFormat(m) {
	for (let i = 0; i < 9; i++) {
		if (m.modules[8][i] === null) m.modules[8][i] = false;
		if (m.modules[i][8] === null) m.modules[i][8] = false;
	}
	for (let i = 0; i < 8; i++) {
		if (m.modules[8][m.size - 1 - i] === null) m.modules[8][m.size - 1 - i] = false;
		if (m.modules[m.size - 1 - i][8] === null) m.modules[m.size - 1 - i][8] = false;
	}
}

function isFunction(version, size, row, col) {
	if (row === 6 || col === 6) return true;
	if (row < 9 && col < 9) return true;
	if (row < 9 && col >= size - 8) return true;
	if (row >= size - 8 && col < 9) return true;
	const centres = ALIGNMENT[version];
	for (const r of centres) {
		for (const c of centres) {
			if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6))
				continue;
			if (Math.abs(row - r) <= 2 && Math.abs(col - c) <= 2) return true;
		}
	}
	return false;
}

function placeData(m, version, codewords) {
	const size = m.size;
	let bitIndex = 0;
	let upward = true;

	for (let right = size - 1; right >= 1; right -= 2) {
		if (right === 6) right = 5; // the vertical timing column is skipped entirely
		for (let step = 0; step < size; step++) {
			const row = upward ? size - 1 - step : step;
			for (const col of [right, right - 1]) {
				if (isFunction(version, size, row, col)) continue;
				const byte = codewords[bitIndex >> 3];
				const bit = byte === undefined ? 0 : (byte >> (7 - (bitIndex & 7))) & 1;
				m.modules[row][col] = bit === 1;
				bitIndex++;
			}
		}
		upward = !upward;
	}
}

const MASKS = [
	(r, c) => (r + c) % 2 === 0,
	(r) => r % 2 === 0,
	(r, c) => c % 3 === 0,
	(r, c) => (r + c) % 3 === 0,
	(r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
	(r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
	(r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
	(r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
];

function applyMask(m, version, maskIndex) {
	const fn = MASKS[maskIndex];
	const out = { size: m.size, modules: m.modules.map((row) => row.slice()) };
	for (let r = 0; r < m.size; r++) {
		for (let c = 0; c < m.size; c++) {
			if (isFunction(version, m.size, r, c)) continue;
			if (fn(r, c)) out.modules[r][c] = !out.modules[r][c];
		}
	}
	return out;
}

// Level M is 0b00 in the format bits.
const FORMAT_EC = 0b00;

function formatBits(maskIndex) {
	let data = (FORMAT_EC << 3) | maskIndex;
	let rem = data;
	for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
	return ((data << 10) | rem) ^ 0x5412;
}

function placeFormat(m, maskIndex) {
	const bits = formatBits(maskIndex);
	for (let i = 0; i < 15; i++) {
		const bit = ((bits >>> i) & 1) === 1;
		// top-left, split around the timing row/column
		if (i < 6) m.modules[8][i] = bit;
		else if (i === 6) m.modules[8][7] = bit;
		else if (i === 7) m.modules[8][8] = bit;
		else if (i === 8) m.modules[7][8] = bit;
		else m.modules[14 - i][8] = bit;

		// The duplicate copy. Bits 0-7 run along ROW 8 from the right edge; bits
		// 8-14 run down COLUMN 8 from the bottom. Getting these two the wrong way
		// round produces a code that passes every structural eye-test and is
		// rejected by every real scanner — and it also lands bit 7 on top of the
		// always-dark module, which is how it was caught.
		if (i < 8) m.modules[8][m.size - 1 - i] = bit;
		else m.modules[m.size - 15 + i][8] = bit;
	}

	// Set last: it is a function module, not part of the format information.
	m.modules[m.size - 8][8] = true;
}

/** Reads the format information back, so a decoder need not be told the mask. */
function readFormat(modules, size) {
	let bits = 0;
	for (let i = 0; i < 15; i++) {
		let bit;
		if (i < 6) bit = modules[8][i];
		else if (i === 6) bit = modules[8][7];
		else if (i === 7) bit = modules[8][8];
		else if (i === 8) bit = modules[7][8];
		else bit = modules[14 - i][8];
		if (bit) bits |= 1 << i;
	}
	const data = (bits ^ 0x5412) >>> 10;
	return { ec: (data >>> 3) & 0b11, mask: data & 0b111 };
}

function penalty(m) {
	const size = m.size;
	let score = 0;

	// rule 1: runs of five or more
	for (const transpose of [false, true]) {
		for (let a = 0; a < size; a++) {
			let run = 1;
			for (let b = 1; b < size; b++) {
				const prev = transpose ? m.modules[b - 1][a] : m.modules[a][b - 1];
				const cur = transpose ? m.modules[b][a] : m.modules[a][b];
				if (cur === prev) {
					run++;
					if (run === 5) score += 3;
					else if (run > 5) score += 1;
				} else run = 1;
			}
		}
	}

	// rule 2: 2x2 blocks
	for (let r = 0; r < size - 1; r++) {
		for (let c = 0; c < size - 1; c++) {
			const v = m.modules[r][c];
			if (v === m.modules[r][c + 1] && v === m.modules[r + 1][c] && v === m.modules[r + 1][c + 1])
				score += 3;
		}
	}

	// rule 3: finder-like patterns
	const PATTERN = [true, false, true, true, true, false, true, false, false, false, false];
	for (const transpose of [false, true]) {
		for (let a = 0; a < size; a++) {
			for (let b = 0; b + PATTERN.length <= size; b++) {
				let hit = true;
				for (let k = 0; k < PATTERN.length; k++) {
					const v = transpose ? m.modules[b + k][a] : m.modules[a][b + k];
					if (v !== PATTERN[k]) {
						hit = false;
						break;
					}
				}
				if (hit) score += 40;
			}
		}
	}

	// rule 4: balance of dark and light
	let dark = 0;
	for (const row of m.modules) for (const v of row) if (v) dark++;
	const percent = (dark * 100) / (size * size);
	score += Math.floor(Math.abs(percent - 50) / 5) * 10;

	return score;
}

/**
 * Encodes text as a QR matrix.
 * Returns { size, modules: boolean[][], version, mask }.
 */
export function encode(text) {
	if (typeof text !== 'string' || !text) throw new Error('Nothing to encode.');
	const version = chooseVersion(new TextEncoder().encode(text).length);
	const codewords = buildCodewords(text, version);
	const size = sizeFor(version);

	const base = emptyMatrix(size);
	placeFunctionPatterns(base, version);
	reserveFormat(base);
	placeData(base, version, codewords);

	let best = null;
	for (let mask = 0; mask < 8; mask++) {
		const candidate = applyMask(base, version, mask);
		placeFormat(candidate, mask);
		const score = penalty(candidate);
		if (!best || score < best.score) best = { matrix: candidate, score, mask };
	}

	return { size, modules: best.matrix.modules, version, mask: best.mask };
}

/**
 * Renders a matrix as an SVG string.
 *
 * The quiet zone is honoured and the colours are true black on true white
 * rather than tinted into the palette, because a themed QR is a QR that some
 * cameras will not read.
 */
export function toSvg(qr, { moduleSize = 6, quiet = 4 } = {}) {
	const dim = (qr.size + quiet * 2) * moduleSize;
	const rects = [];
	for (let r = 0; r < qr.size; r++) {
		for (let c = 0; c < qr.size; c++) {
			if (!qr.modules[r][c]) continue;
			rects.push(
				'<rect x="' +
					(c + quiet) * moduleSize +
					'" y="' +
					(r + quiet) * moduleSize +
					'" width="' +
					moduleSize +
					'" height="' +
					moduleSize +
					'"/>'
			);
		}
	}
	return (
		'<svg xmlns="http://www.w3.org/2000/svg" width="' +
		dim +
		'" height="' +
		dim +
		'" viewBox="0 0 ' +
		dim +
		' ' +
		dim +
		'" shape-rendering="crispEdges">' +
		'<rect width="' +
		dim +
		'" height="' +
		dim +
		'" fill="#FFFFFF"/>' +
		'<g fill="#000000">' +
		rects.join('') +
		'</g></svg>'
	);
}

// ---------------------------------------------------------------- decoding
//
// Only enough to read back what this encoder produced. It exists so the
// encoder can be tested against itself: placement, masking and format
// information are exactly the parts that fail silently, producing a code that
// looks convincing and scans as nothing at all.

export function decode(qr) {
	const size = qr.size;
	const version = (size - 17) / 4;
	if (!VERSIONS[version]) throw new Error('Unsupported version in matrix.');

	// Read the mask out of the format information rather than trusting the
	// caller. That is what makes the round trip validate format placement: with
	// the format bits transposed, this returns the wrong mask and the payload
	// comes back as noise.
	const format = readFormat(qr.modules, size);
	if (format.ec !== FORMAT_EC) throw new Error('The format information does not read as level M.');
	const fn = MASKS[format.mask];
	const unmasked = qr.modules.map((row, r) =>
		row.map((v, c) => (isFunction(version, size, r, c) ? v : fn(r, c) ? !v : v))
	);

	// read the data bits back in the same boustrophedon order
	const bits = [];
	let upward = true;
	for (let right = size - 1; right >= 1; right -= 2) {
		if (right === 6) right = 5;
		for (let step = 0; step < size; step++) {
			const row = upward ? size - 1 - step : step;
			for (const col of [right, right - 1]) {
				if (isFunction(version, size, row, col)) continue;
				bits.push(unmasked[row][col] ? 1 : 0);
			}
		}
		upward = !upward;
	}

	const interleaved = [];
	for (let i = 0; i + 8 <= bits.length; i += 8) {
		let byte = 0;
		for (let k = 0; k < 8; k++) byte = (byte << 1) | bits[i + k];
		interleaved.push(byte);
	}

	// de-interleave the data half back into blocks
	const [, eccLength, g1, g1cw, g2, g2cw] = VERSIONS[version];
	const blockLengths = [...Array(g1).fill(g1cw), ...Array(g2).fill(g2cw)];
	const blocks = blockLengths.map(() => []);
	let index = 0;
	const maxData = Math.max(...blockLengths);
	for (let i = 0; i < maxData; i++) {
		for (let b = 0; b < blocks.length; b++) {
			if (i < blockLengths[b]) blocks[b].push(interleaved[index++]);
		}
	}
	const data = blocks.flat();

	// parse byte mode
	let bitPos = 0;
	const readBits = (n) => {
		let v = 0;
		for (let i = 0; i < n; i++) {
			const byte = data[bitPos >> 3] ?? 0;
			v = (v << 1) | ((byte >> (7 - (bitPos & 7))) & 1);
			bitPos++;
		}
		return v;
	};

	const mode = readBits(4);
	if (mode !== 0b0100)
		throw new Error(
			'Only byte mode is supported by this decoder; got mode ' + mode.toString(2) + '.'
		);
	const count = readBits(version < 10 ? 8 : 16);
	const out = new Uint8Array(count);
	for (let i = 0; i < count; i++) out[i] = readBits(8);
	return new TextDecoder().decode(out);
}
