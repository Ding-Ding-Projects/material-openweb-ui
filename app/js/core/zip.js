// Bounded, read-only ZIP32 central-directory listing. No extraction or decoder.
// The metadata is untrusted: payloads, local headers and CRC32 are not verified.
// Format reference: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT

export const ZIP_LIMITS = Object.freeze({
	archiveBytes: 256 * 1024 * 1024,
	directoryBytes: 4 * 1024 * 1024,
	entries: 10000,
	nameBytes: 4096,
	outputBytes: 4 * 1024 * 1024
});

const EOCD_BYTES = 22;
const MAX_COMMENT_BYTES = 65535;
const CENTRAL_BYTES = 46;
const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const ENCODER = new TextEncoder();
const CP437_HIGH =
	'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';

function invalid(reason) {
	return new Error('Cannot list this ZIP: ' + reason + '. The source file is untouched.');
}

async function readRange(file, start, end) {
	try {
		const bytes = new Uint8Array(await file.slice(start, end).arrayBuffer());
		if (bytes.length !== end - start) throw invalid('a requested metadata range is truncated');
		return bytes;
	} catch (e) {
		if (typeof e?.message === 'string' && e.message.startsWith('Cannot list this ZIP:')) throw e;
		throw invalid('the archive could not be read');
	}
}

function crc32(bytes) {
	let crc = 0xffffffff;
	for (const byte of bytes) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function decodeUtf8(bytes) {
	try {
		return UTF8.decode(bytes);
	} catch {
		throw invalid('a filename marked as UTF-8 contains invalid UTF-8');
	}
}

function filename(bytes, flags, extra) {
	let unicodeName;
	const view = new DataView(extra.buffer, extra.byteOffset, extra.byteLength);
	for (let at = 0; at < extra.length; ) {
		if (at + 4 > extra.length) throw invalid('an extra-field header is truncated');
		const id = view.getUint16(at, true);
		const size = view.getUint16(at + 2, true);
		at += 4;
		if (at + size > extra.length) throw invalid('an extra field exceeds its directory record');
		if (id === 0x0001) throw invalid('ZIP64 archives are not supported');
		if (id === 0x0017 || id === 0x9901) throw invalid('encrypted archives are not supported');
		if (id === 0x7075) {
			if (unicodeName !== undefined) throw invalid('a filename has duplicate Unicode path fields');
			if (size < 5 || extra[at] !== 1)
				throw invalid('the Unicode path extra-field version or length is unsupported');
			if (size - 5 > ZIP_LIMITS.nameBytes)
				throw invalid('a Unicode filename exceeds the 4096-byte limit');
			if (view.getUint32(at + 1, true) !== crc32(bytes))
				throw invalid('a Unicode path extra field has a mismatched filename CRC32');
			unicodeName = decodeUtf8(extra.subarray(at + 5, at + size));
		}
		at += size;
	}
	const name =
		flags & 0x0800
			? decodeUtf8(bytes)
			: (unicodeName ??
				Array.from(bytes, (b) => (b < 128 ? String.fromCharCode(b) : CP437_HIGH[b - 128])).join(
					''
				));
	if (!name.length) throw invalid('a directory entry has an empty filename');
	if (flags & 0x0800 && unicodeName !== undefined && unicodeName !== name)
		throw invalid('the UTF-8 filename disagrees with its Unicode path extra field');
	return name;
}

// One quoted field per row. Controls and direction-changing characters cannot
// forge extra entries or reverse the apparent spelling of an archive member.
function quotedName(name) {
	return JSON.stringify(name).replace(
		/[\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/g,
		(c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')
	);
}

/**
 * Reads three bounded ranges from a Blob/File, returning UTF-8/LF text.
 * The end-record search can include payload bytes or an entire small archive.
 * Large archives are not buffered in full. No payload bytes are interpreted.
 * Entry names are displayed literally, never interpreted as filesystem paths.
 * No network, external program, local-header decoding or decompression is used.
 */
export async function zipListing(file) {
	if (!file || !Number.isSafeInteger(file.size) || typeof file.slice !== 'function')
		throw invalid('the input must be a readable Blob or File');
	if (file.size > ZIP_LIMITS.archiveBytes) throw invalid('the archive exceeds the 256 MiB limit');
	if (file.size < EOCD_BYTES)
		throw invalid('the end-of-central-directory record is missing or truncated');

	const head = await readRange(file, 0, 4);
	const headView = new DataView(head.buffer, head.byteOffset, head.byteLength);
	if (headView.getUint32(0, true) !== 0x04034b50 && headView.getUint32(0, true) !== 0x06054b50)
		throw invalid(
			'a standard ZIP signature is missing (self-extracting or prefixed archives are unsupported)'
		);

	const tailStart = Math.max(0, file.size - EOCD_BYTES - MAX_COMMENT_BYTES);
	const tail = await readRange(file, tailStart, file.size);
	const endView = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
	let end = -1;
	for (let at = tail.length - EOCD_BYTES; at >= 0; at--) {
		if (
			endView.getUint32(at, true) === 0x06054b50 &&
			at + EOCD_BYTES + endView.getUint16(at + 20, true) === tail.length
		) {
			end = at;
			break;
		}
	}
	if (end < 0)
		throw invalid(
			'the end-of-central-directory record is missing, truncated or followed by trailing bytes'
		);
	const endOffset = tailStart + end;
	const disk = endView.getUint16(end + 4, true);
	const directoryDisk = endView.getUint16(end + 6, true);
	const diskEntries = endView.getUint16(end + 8, true);
	const entries = endView.getUint16(end + 10, true);
	const directorySize = endView.getUint32(end + 12, true);
	const directoryOffset = endView.getUint32(end + 16, true);
	if (
		disk === 0xffff ||
		directoryDisk === 0xffff ||
		diskEntries === 0xffff ||
		entries === 0xffff ||
		directorySize === 0xffffffff ||
		directoryOffset === 0xffffffff ||
		(end >= 20 && endView.getUint32(end - 20, true) === 0x07064b50)
	)
		throw invalid('ZIP64 archives are not supported');
	if (disk || directoryDisk || diskEntries !== entries)
		throw invalid('multi-disk or split archives are not supported');
	if (entries > ZIP_LIMITS.entries) throw invalid('the directory exceeds the 10000-entry limit');
	if (directorySize > ZIP_LIMITS.directoryBytes)
		throw invalid('the central directory exceeds the 4 MiB limit');
	if (directoryOffset + directorySize !== endOffset)
		throw invalid(
			'the central-directory bounds are invalid or contain unsupported signature/trailer records'
		);
	if (entries * CENTRAL_BYTES > directorySize || (!entries && (directorySize || directoryOffset)))
		throw invalid('the directory size does not match its entry count');

	const directory = await readRange(file, directoryOffset, directoryOffset + directorySize);
	const view = new DataView(directory.buffer, directory.byteOffset, directory.byteLength);
	const lines = [
		'ZIP central-directory listing (metadata only; payloads, local headers and CRC32 are not verified).',
		'Entries: ' + entries,
		'kind\tcompressed-bytes\tuncompressed-bytes\tmethod-id\tclaimed-crc32\tquoted-name'
	];
	let outputBytes = ENCODER.encode(lines.join('\n') + '\n').length;
	let at = 0;
	for (let index = 0; index < entries; index++) {
		if (at + CENTRAL_BYTES > directory.length || view.getUint32(at, true) !== 0x02014b50)
			throw invalid('central-directory entry ' + (index + 1) + ' is missing or truncated');
		const flags = view.getUint16(at + 8, true);
		const method = view.getUint16(at + 10, true);
		const compressed = view.getUint32(at + 20, true);
		const uncompressed = view.getUint32(at + 24, true);
		const nameSize = view.getUint16(at + 28, true);
		const extraSize = view.getUint16(at + 30, true);
		const commentSize = view.getUint16(at + 32, true);
		const startDisk = view.getUint16(at + 34, true);
		const localOffset = view.getUint32(at + 42, true);
		if (
			compressed === 0xffffffff ||
			uncompressed === 0xffffffff ||
			localOffset === 0xffffffff ||
			startDisk === 0xffff
		)
			throw invalid('ZIP64 archives are not supported');
		if (startDisk) throw invalid('multi-disk or split archives are not supported');
		if (flags & 0x2041 || method === 99) throw invalid('encrypted archives are not supported');
		if (nameSize > ZIP_LIMITS.nameBytes) throw invalid('a filename exceeds the 4096-byte limit');
		const next = at + CENTRAL_BYTES + nameSize + extraSize + commentSize;
		if (next > directory.length)
			throw invalid('a filename, extra field or comment exceeds its directory record');
		if (localOffset + 30 + compressed > directoryOffset)
			throw invalid('a claimed local-file range lies outside the archive data area');
		const nameStart = at + CENTRAL_BYTES;
		const name = filename(
			directory.subarray(nameStart, nameStart + nameSize),
			flags,
			directory.subarray(nameStart + nameSize, nameStart + nameSize + extraSize)
		);
		const attributes = view.getUint32(at + 38, true);
		const unixType = directory[at + 5] === 3 ? (attributes >>> 28) & 0xf : 0;
		const kind =
			unixType === 0xa
				? 'symlink'
				: name.endsWith('/') || attributes & 0x10 || unixType === 4
					? 'directory'
					: 'file';
		const checksum = view
			.getUint32(at + 16, true)
			.toString(16)
			.padStart(8, '0');
		const line = [kind, compressed, uncompressed, method, checksum, quotedName(name)].join('\t');
		outputBytes += ENCODER.encode(line + '\n').length;
		if (outputBytes > ZIP_LIMITS.outputBytes)
			throw invalid('the text listing exceeds the 4 MiB output limit');
		lines.push(line);
		at = next;
	}
	if (at !== directory.length)
		throw invalid('the directory contains uncounted entries or unsupported trailer records');
	return lines.join('\n') + '\n';
}
