// Deterministic in-memory fixtures: real local headers, central records and EOCD.
// zlib is used only by the tests to make a deflated fixture, never by the app.
import { deflateRawSync } from 'node:zlib';

export function crc32(bytes) {
	let crc = 0xffffffff;
	for (const byte of bytes) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

export function extraField(id, data) {
	const header = Buffer.alloc(4);
	header.writeUInt16LE(id, 0);
	header.writeUInt16LE(data.length, 2);
	return Buffer.concat([header, data]);
}

export function unicodePath(nameBytes, unicodeName) {
	const header = Buffer.alloc(5);
	header[0] = 1;
	header.writeUInt32LE(crc32(nameBytes), 1);
	return extraField(0x7075, Buffer.concat([header, Buffer.from(unicodeName)]));
}

export function zipFixture(entries = [], { comment = Buffer.alloc(0) } = {}) {
	const locals = [];
	const records = [];
	let localOffset = 0;
	for (const entry of entries) {
		const name = Buffer.isBuffer(entry.name) ? entry.name : Buffer.from(entry.name);
		const flags = entry.flags ?? 0x0800;
		const method = entry.method ?? 0;
		const content = Buffer.from(entry.content ?? '');
		const compressed = entry.payload ?? (method === 8 ? deflateRawSync(content) : content);
		const extra = entry.extra ?? Buffer.alloc(0);
		const note = entry.comment ?? Buffer.alloc(0);
		const checksum = crc32(content);
		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt16LE(flags, 6);
		local.writeUInt16LE(method, 8);
		if (!(flags & 8)) {
			local.writeUInt32LE(checksum, 14);
			local.writeUInt32LE(compressed.length, 18);
			local.writeUInt32LE(content.length, 22);
		}
		local.writeUInt16LE(name.length, 26);
		local.writeUInt16LE(extra.length, 28);
		const descriptor = flags & 8 ? Buffer.alloc(16) : Buffer.alloc(0);
		if (descriptor.length) {
			descriptor.writeUInt32LE(0x08074b50, 0);
			descriptor.writeUInt32LE(checksum, 4);
			descriptor.writeUInt32LE(compressed.length, 8);
			descriptor.writeUInt32LE(content.length, 12);
		}
		const member = Buffer.concat([local, name, extra, compressed, descriptor]);
		locals.push(member);

		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(entry.madeBy ?? 20, 4);
		central.writeUInt16LE(20, 6);
		central.writeUInt16LE(flags, 8);
		central.writeUInt16LE(method, 10);
		central.writeUInt32LE(checksum, 16);
		central.writeUInt32LE(compressed.length, 20);
		central.writeUInt32LE(entry.uncompressed ?? content.length, 24);
		central.writeUInt16LE(name.length, 28);
		central.writeUInt16LE(extra.length, 30);
		central.writeUInt16LE(note.length, 32);
		central.writeUInt16LE(entry.disk ?? 0, 34);
		central.writeUInt32LE(entry.attributes ?? 0, 38);
		central.writeUInt32LE(localOffset, 42);
		records.push(Buffer.concat([central, name, extra, note]));
		localOffset += member.length;
	}
	const directory = Buffer.concat(records);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(directory.length, 12);
	end.writeUInt32LE(localOffset, 16);
	end.writeUInt16LE(comment.length, 20);
	return Buffer.concat([...locals, directory, end, comment]);
}

export function changeEnd(bytes, fieldOffset, value, width = 2) {
	const changed = Buffer.from(bytes);
	const end = changed.length - 22;
	// Only fixtures without archive comments use this mutation helper.
	if (changed.readUInt32LE(end) !== 0x06054b50 || changed.readUInt16LE(end + 20) !== 0)
		throw new Error('Invalid fixture EOCD offset');
	if (width === 4) changed.writeUInt32LE(value, end + fieldOffset);
	else changed.writeUInt16LE(value, end + fieldOffset);
	return changed;
}

export function changeCentral(bytes, fieldOffset, value, width = 2) {
	const changed = Buffer.from(bytes);
	const directoryOffset = changed.readUInt32LE(changed.length - 6);
	if (width === 4) changed.writeUInt32LE(value, directoryOffset + fieldOffset);
	else changed.writeUInt16LE(value, directoryOffset + fieldOffset);
	return changed;
}
