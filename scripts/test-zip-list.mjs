#!/usr/bin/env node
// Converter integration, adversarial metadata and packaged-asset offline smoke.
// This is also imported by test-convert.mjs, so the existing build gates run it.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ADAPTERS, adaptersFor, sniff, run, outputName, isLossy } from '../app/js/core/convert.js';
import { ZIP_LIMITS } from '../app/js/core/zip.js';
import { zipFixture, extraField, unicodePath, changeEnd, changeCentral } from './fixtures/zip.mjs';

const adapter = ADAPTERS.find((a) => a.id === 'zip-list');
let checks = 0;
async function check(name, action) {
	await action();
	checks++;
	console.log('  pass  ' + name);
}
const blob = (bytes) => new Blob([bytes]);
const list = async (bytes) => await (await run(adapter, blob(bytes))).text();
const reject = async (bytes, reason) => {
	const input = blob(bytes);
	await assert.rejects(run(adapter, input), reason);
	assert.deepEqual(Buffer.from(await input.arrayBuffer()), bytes);
};
const rows = (text) =>
	text
		.trimEnd()
		.split('\n')
		.slice(3)
		.map((line) => {
			const [kind, compressed, uncompressed, method, crc, name] = line.split('\t');
			return {
				kind,
				compressed: Number(compressed),
				uncompressed: Number(uncompressed),
				method: Number(method),
				crc,
				name: JSON.parse(name)
			};
		});
const valid = zipFixture([{ name: 'hello.txt', content: 'hello' }]);

console.log('');
console.log('offline ZIP listing');
await check('the registry selects and actually runs the bundled adapter by bytes', async () => {
	assert.equal(adapter.available, true);
	assert.equal(
		adaptersFor(sniff(valid).mime).find((a) => a.id === adapter.id),
		adapter
	);
	const source = new File([valid], 'renamed.png');
	const output = await run(adapter, source);
	assert.equal(output.type, 'text/plain;charset=utf-8');
	assert.equal(outputName('renamed.png', adapter), 'renamed.listing.txt');
	assert.equal(isLossy(adapter), true);
	assert.deepEqual(rows(await output.text()), [
		{ kind: 'file', compressed: 5, uncompressed: 5, method: 0, crc: '3610a686', name: 'hello.txt' }
	]);
	assert.match(await output.text(), /metadata only.*not verified/);
	assert.deepEqual(Buffer.from(await source.arrayBuffer()), valid);
});
await check(
	'an independently generated Python ZIP32 fixture converts through the real dispatcher',
	async () => {
		const fixture = JSON.parse(
			readFileSync(new URL('./fixtures/zip32-python.json', import.meta.url), 'utf8')
		);
		const parsed = rows(await list(Buffer.from(fixture.base64, 'base64')));
		assert.deepEqual(
			parsed.map((row) => row.name),
			['folder/', 'folder/readme.txt', 'folder/雪.txt']
		);
		assert.deepEqual(
			parsed.map((row) => row.uncompressed),
			[0, 20, 13]
		);
		assert.deepEqual(
			parsed.map((row) => row.kind),
			['directory', 'file', 'file']
		);
		assert.ok(parsed.every((row) => row.method === 8));
	}
);
await check('empty ZIP32 archives return an explicit zero-entry listing', async () => {
	const text = await list(zipFixture());
	assert.match(text, /Entries: 0\n/);
	assert.deepEqual(rows(text), []);
});
await check(
	'stored, deflated, data-descriptor, directory and symlink entries are listed in archive order',
	async () => {
		const members = [
			{ name: 'dir/', attributes: 0x10 },
			{ name: 'dir/廣東話.txt', content: 'not rendered', method: 8 },
			{ name: 'stream.txt', content: 'streamed', flags: 0x0808, method: 8 },
			{ name: 'link', content: '../../target', madeBy: 0x0314, attributes: 0xa1ff0000 },
			{ name: 'other-method', method: 93, payload: Buffer.from([1, 2]), uncompressed: 100 }
		];
		const parsed = rows(await list(zipFixture(members)));
		assert.deepEqual(
			parsed.map((row) => row.name),
			members.map((member) => member.name)
		);
		assert.deepEqual(
			parsed.map((row) => row.kind),
			['directory', 'file', 'file', 'symlink', 'file']
		);
		assert.equal(parsed[1].uncompressed, Buffer.byteLength('not rendered'));
		assert.equal(parsed[4].method, 93);
	}
);
await check(
	'CP437, validated Unicode path fields and UTF-8 BOM filenames preserve their names',
	async () => {
		const legacy = Buffer.from([0x82, 0x2e, 0x74, 0x78, 0x74]);
		const fallback = Buffer.from('fallback.txt');
		assert.deepEqual(
			rows(
				await list(
					zipFixture([
						{ name: legacy, flags: 0 },
						{ name: fallback, flags: 0, extra: unicodePath(fallback, '雪.txt') },
						{ name: '\ufeffleading.txt' }
					])
				)
			).map((row) => row.name),
			['é.txt', '雪.txt', '\ufeffleading.txt']
		);
	}
);
await check(
	'path-like, duplicate, HTML, control and bidi names remain inert one-row quoted data',
	async () => {
		const names = [
			'../outside.txt',
			'/etc/passwd',
			'C:\\outside.txt',
			'__proto__',
			'<script>alert(1)</script>',
			'a\tnew\nrow\r\u0000\u0085\u202eexe.txt',
			'../outside.txt'
		];
		const text = await list(zipFixture(names.map((name) => ({ name }))));
		assert.deepEqual(
			rows(text).map((row) => row.name),
			names
		);
		assert.equal(text.split('\n').length, names.length + 4);
		assert.doesNotMatch(text, /[\u0000\u0085\u202e]/);
		assert.match(text, /\\u202e/);
	}
);
await check(
	'archive comments, including signature-shaped bytes, are bounded and ignored',
	async () => {
		const comment = Buffer.alloc(65535, 65);
		comment.writeUInt32LE(0x06054b50, 100);
		assert.equal(rows(await list(zipFixture([{ name: 'a' }], { comment })))[0].name, 'a');
	}
);
await check(
	'huge claimed uncompressed sizes are listed without allocating or inflating payloads',
	async () => {
		assert.equal(
			rows(await list(zipFixture([{ name: 'bomb', content: 'x', uncompressed: 0xfffffffe }])))[0]
				.uncompressed,
			0xfffffffe
		);
	}
);
await check(
	'the converter enforces per-range and aggregate read budgets for large and small ZIPs',
	async () => {
		const large = zipFixture([{ name: 'large.bin', content: Buffer.alloc(2 * 1024 * 1024, 65) }]);
		for (const source of [large, valid]) {
			const input = blob(source);
			const ranges = [];
			const monitored = {
				size: input.size,
				arrayBuffer() {
					throw new Error('Use the bounded slice path');
				},
				slice(start, end) {
					ranges.push([start, end]);
					return input.slice(start, end);
				}
			};
			const originalFetch = globalThis.fetch;
			globalThis.fetch = () => {
				throw new Error('Network access is forbidden');
			};
			try {
				assert.equal(rows(await (await run(adapter, monitored)).text()).length, 1);
			} finally {
				globalThis.fetch = originalFetch;
			}
			assert.equal(ranges.length, 3);
			assert.deepEqual(ranges[0], [0, 4]);
			assert.deepEqual(ranges[1], [Math.max(0, input.size - 65557), input.size]);
			const directorySize = source.readUInt32LE(source.length - 10);
			const directoryOffset = source.readUInt32LE(source.length - 6);
			assert.deepEqual(ranges[2], [directoryOffset, directoryOffset + directorySize]);
			assert.ok(ranges[1][1] - ranges[1][0] <= 65557);
			assert.ok(ranges[2][1] - ranges[2][0] <= ZIP_LIMITS.directoryBytes);
			assert.ok(ranges.every(([start, end]) => start >= 0 && end <= input.size));
			const totalRead = ranges.reduce((total, [start, end]) => total + end - start, 0);
			assert.equal(totalRead, 4 + Math.min(input.size, 65557) + directorySize);
			assert.ok(totalRead <= 4 + 65557 + ZIP_LIMITS.directoryBytes);
			assert.equal(
				ranges.some(([start, end]) => start === 0 && end === input.size),
				source === valid
			);
		}
	}
);
await check('all truncations fail with a readable error and no partial output', async () => {
	for (let length = 0; length < valid.length; length++) {
		await reject(valid.subarray(0, length), /Cannot list this ZIP:.*source file is untouched/);
	}
	await reject(Buffer.concat([valid, Buffer.from('trailing')]), /trailing bytes/);
	await reject(Buffer.alloc(22), /signature/);
});
await check('ZIP64 markers, locators and extra fields fail explicitly', async () => {
	for (const [offset, value, width] of [
		[4, 0xffff, 2],
		[6, 0xffff, 2],
		[8, 0xffff, 2],
		[10, 0xffff, 2],
		[12, 0xffffffff, 4],
		[16, 0xffffffff, 4]
	])
		await reject(changeEnd(valid, offset, value, width), /ZIP64/);
	for (const [offset, value, width] of [
		[20, 0xffffffff, 4],
		[24, 0xffffffff, 4],
		[34, 0xffff, 2],
		[42, 0xffffffff, 4]
	])
		await reject(changeCentral(valid, offset, value, width), /ZIP64/);
	await reject(zipFixture([{ name: 'a', extra: extraField(1, Buffer.alloc(0)) }]), /ZIP64/);
	const locator = Buffer.alloc(20);
	locator.writeUInt32LE(0x07064b50);
	await reject(Buffer.concat([valid.subarray(0, -22), locator, valid.subarray(-22)]), /ZIP64/);
});
await check('multi-disk, split and encrypted variants fail explicitly', async () => {
	for (const offset of [4, 6, 8])
		await reject(changeEnd(valid, offset, offset === 8 ? 2 : 1), /multi-disk/);
	await reject(changeCentral(valid, 34, 1), /multi-disk/);
	for (const flag of [1, 0x40, 0x2000])
		await reject(zipFixture([{ name: 'a', flags: flag }]), /encrypted/);
	await reject(zipFixture([{ name: 'a', method: 99 }]), /encrypted/);
	for (const id of [0x0017, 0x9901])
		await reject(zipFixture([{ name: 'a', extra: extraField(id, Buffer.alloc(0)) }]), /encrypted/);
});
await check(
	'invalid directory bounds, record signatures, counts, lengths and offsets are refused',
	async () => {
		await reject(changeEnd(valid, 16, valid.length, 4), /bounds/);
		await reject(changeEnd(valid, 12, 0, 4), /bounds/);
		await reject(changeEnd(valid, 10, 0), /multi-disk/);
		await reject(changeEnd(changeEnd(valid, 10, 2), 8, 2), /entry count|missing or truncated/);
		await reject(changeEnd(changeEnd(valid, 10, 0), 8, 0), /entry count/);
		await reject(changeCentral(valid, 0, 0, 4), /entry 1/);
		await reject(changeCentral(valid, 28, 200), /exceeds its directory record/);
		await reject(changeCentral(valid, 30, 65535), /exceeds its directory record/);
		await reject(changeCentral(valid, 32, 65535), /exceeds its directory record/);
		await reject(changeCentral(valid, 42, valid.length, 4), /local-file range/);
		await reject(changeCentral(valid, 20, valid.length, 4), /local-file range/);
		const pair = zipFixture([{ name: 'a' }, { name: 'b' }]);
		await reject(changeEnd(changeEnd(pair, 8, 1), 10, 1), /uncounted entries/);
	}
);
await check(
	'malformed UTF-8 and extra fields cannot silently replace or hide filename data',
	async () => {
		await reject(zipFixture([{ name: Buffer.from([0xc3, 0x28]) }]), /invalid UTF-8/);
		await reject(zipFixture([{ name: '' }]), /empty filename/);
		await reject(zipFixture([{ name: 'a', extra: Buffer.from([1]) }]), /extra-field header/);
		await reject(
			zipFixture([{ name: 'a', extra: Buffer.from([2, 0, 4, 0, 1]) }]),
			/exceeds its directory record/
		);
		const name = Buffer.from('a');
		const unicode = unicodePath(name, 'a');
		const wrongCrc = Buffer.from(unicode);
		wrongCrc[5] ^= 1;
		await reject(zipFixture([{ name, extra: wrongCrc }]), /mismatched filename CRC32/);
		await reject(
			zipFixture([{ name, extra: Buffer.concat([unicode, unicode]) }]),
			/duplicate Unicode/
		);
		await reject(zipFixture([{ name, extra: unicodePath(name, 'different') }]), /disagrees/);
		await reject(
			zipFixture([{ name, extra: extraField(0x7075, Buffer.alloc(4)) }]),
			/version or length/
		);
	}
);
await check(
	'size and entry-count caps reject before reading an oversized directory or input',
	async () => {
		let reads = 0;
		await assert.rejects(
			run(adapter, {
				size: ZIP_LIMITS.archiveBytes + 1,
				slice() {
					reads++;
					throw new Error();
				}
			}),
			/256 MiB/
		);
		assert.equal(reads, 0);
		await reject(
			changeEnd(changeEnd(valid, 8, ZIP_LIMITS.entries + 1), 10, ZIP_LIMITS.entries + 1),
			/10000-entry/
		);
		await reject(changeEnd(valid, 12, ZIP_LIMITS.directoryBytes + 1, 4), /4 MiB/);
		await assert.rejects(run(adapter, { size: NaN, slice() {} }), /Blob or File/);
		await assert.rejects(
			run(adapter, {
				size: 22,
				slice() {
					return { arrayBuffer: async () => new ArrayBuffer(0) };
				}
			}),
			/range is truncated/
		);
		await assert.rejects(
			run(adapter, {
				size: 22,
				slice() {
					throw new Error('filesystem detail');
				}
			}),
			/could not be read/
		);
		for (const value of [null, undefined, 'read rejected', { message: 42 }]) {
			await assert.rejects(
				run(adapter, {
					size: 22,
					slice() {
						return {
							arrayBuffer: async () => {
								throw value;
							}
						};
					}
				}),
				/could not be read/
			);
		}
	}
);
await check(
	'filename and entry limits accept the boundary, then fail closed above it',
	async () => {
		assert.equal(
			rows(await list(zipFixture([{ name: 'x'.repeat(ZIP_LIMITS.nameBytes) }])))[0].name.length,
			ZIP_LIMITS.nameBytes
		);
		await reject(zipFixture([{ name: 'x'.repeat(ZIP_LIMITS.nameBytes + 1) }]), /4096-byte/);
		const entries = Array.from({ length: ZIP_LIMITS.entries }, (_, i) => ({ name: String(i) }));
		assert.equal(rows(await list(zipFixture(entries))).length, ZIP_LIMITS.entries);
	}
);
await check('escaped output is bounded independently of the input directory', async () => {
	const entries = Array.from({ length: 700 }, () => ({ name: '\u0000'.repeat(1024) }));
	const source = zipFixture(entries);
	assert.ok(source.readUInt32LE(source.length - 10) < ZIP_LIMITS.directoryBytes);
	await reject(source, /4 MiB output limit/);
});
await check(
	'shipped assets run from a package-layout copy with no PATH tools or network',
	async () => {
		const config = readFileSync('electron-builder.yml', 'utf8');
		assert.match(config, /^\s*- app\/\*\*\/\*$/m);
		const root = mkdtempSync(join(tmpdir(), 'openweb-zip-package-'));
		mkdirSync(join(root, 'app/js/core'), { recursive: true });
		for (const name of ['convert.js', 'zip.js', 'pdf.js'])
			copyFileSync('app/js/core/' + name, join(root, 'app/js/core', name));
		copyFileSync('package.json', join(root, 'package.json'));
		const script = `globalThis.fetch=()=>{throw Error('network forbidden')};
		const {ADAPTERS,run}=await import('./app/js/core/convert.js');
		const bytes=new Uint8Array(${JSON.stringify([...valid])});
		const output=await run(ADAPTERS.find(a=>a.id==='zip-list'),new Blob([bytes]));
		if(!(await output.text()).includes('"hello.txt"'))throw Error('missing listing');
		console.log('offline packaged-asset conversion passed');`;
		const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
			cwd: root,
			env: { ...process.env, PATH: '', HTTP_PROXY: '', HTTPS_PROXY: '', ALL_PROXY: '' },
			encoding: 'utf8'
		});
		rmSync(root, { recursive: true });
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /conversion passed/);
	}
);
console.log('ZIP listing: ' + checks + ' integration/adversarial checks passed.');
