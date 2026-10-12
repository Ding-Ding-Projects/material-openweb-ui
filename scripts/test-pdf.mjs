import assert from 'node:assert/strict';
import { Worker as NodeWorker } from 'node:worker_threads';
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ADAPTERS, run, isLossy } from '../app/js/core/convert.js';
import { PDF_LIMITS, textPdf } from '../app/js/core/pdf.js';
globalThis.self = globalThis;
const { decodePdfSource, createTextPdf } = await import('../app/js/core/pdf-engine.js');
const font = readFileSync('app/vendor/pdf/MaterialOfflineTC-Regular.ttf');
const enc = text => new TextEncoder().encode(text);
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log('  pass  ' + name); }
class WorkerBridge {
	constructor(url) {
		this.worker = new NodeWorker(new URL('./fixtures/pdf/node-worker.mjs', import.meta.url), { workerData: { url: url.href } });
		this.worker.on('message', data => this.onmessage?.({ data }));
		this.worker.on('error', error => this.onerror?.(error));
	}
	postMessage(data) { this.worker.postMessage(data); }
	terminate() { this.worker.terminate(); }
}
globalThis.Worker = WorkerBridge;
const registered = ADAPTERS.find(a => a.id === 'pdf-make');
// Exercise implementation explicitly without enabling the unverified catalogue entry.
const adapter = { ...registered, available: true };
await check('registry discloses literal source, embedding cost and losses before conversion', async () => {
	assert.equal(registered.available, false); assert.equal(isLossy(adapter), true);
	await assert.rejects(run(registered,new Blob(['test'])), /file-origin/);
	assert.match(adapter.discloses, /font overhead/); assert.match(adapter.destroys.join(' '), /literally/);
	assert.match(readFileSync('app/js/pages/converter.js','utf8'), /adapter.discloses \? h/);
});
await check('strict UTF-8, controls and code-point bounds fail closed', () => {
	assert.equal(decodePdfSource(enc('a'.repeat(50000))).length,50000);
	assert.equal(decodePdfSource(enc('<script>fetch("https://example.invalid")</script>')), '<script>fetch("https://example.invalid")</script>');
	assert.throws(() => decodePdfSource(new Uint8Array([0xff])), /UTF-8/);
	for (const text of ['x\0', 'x\u202e', 'x\u200b', 'x\ufeff']) assert.throws(() => decodePdfSource(enc(text)), /control/);
	assert.throws(() => decodePdfSource(enc('a'.repeat(50001))), /50000/);
	assert.throws(() => decodePdfSource(new Uint8Array(PDF_LIMITS.bytes + 1)), /256 KiB/);
	assert.equal(decodePdfSource(enc('\ufeffa\r\nb\rc\td')), 'a\nb\nc    d');
});
await check('oversized input is rejected before reading or worker construction', async () => {
	await assert.rejects(textPdf({size:PDF_LIMITS.bytes+1,arrayBuffer(){throw Error('must not read');}}), /256 KiB/);
});
await check('missing glyphs and excess pages fail without output', async () => {
	await assert.rejects(createTextPdf(enc('unsupported: 🦄'), font), /U\+1F984/);
	await assert.rejects(createTextPdf(enc('\n'.repeat(4900)), font), /100-page/);
});
await check('blank input and exact 100-page boundary remain valid', async () => {
	const blank = await createTextPdf(enc(''),font);
	assert.equal(new TextDecoder().decode(blank.slice(0,5)), '%PDF-');
	const pages = await createTextPdf(enc('\n'.repeat(4899)),font);
	assert.equal((new TextDecoder().decode(pages).match(/\/Type \/Page\b/g) || []).length,100);
});
await check('real isolated worker runs dispatcher, blocks concurrency and preserves input', async () => {
	const input = new Blob(['廣東話：香港嘅離線文件。Traditional Chinese + Latin: café 123']);
	const pending = run(adapter,input);
	await assert.rejects(run(adapter,input), /already running/);
	const output = await pending;
	assert.equal(output.type,'application/pdf');
	assert.ok(output.size > 1000 && output.size < PDF_LIMITS.output);
	assert.equal(await output.slice(0,5).text(),'%PDF-');
	assert.equal(await input.text(),'廣東話：香港嘅離線文件。Traditional Chinese + Latin: café 123');
});
await check('timeout terminates worker and allows another attempt', async () => {
	let terminated = false;
	const realTimeout = globalThis.setTimeout;
	globalThis.Worker = class { postMessage(){} terminate(){terminated=true;} };
	globalThis.setTimeout = fn => realTimeout(fn,5);
	try { await assert.rejects(textPdf(new Blob(['test'])), /30-second/); assert.ok(terminated); }
	finally { globalThis.setTimeout=realTimeout; globalThis.Worker=WorkerBridge; }
});
await check('worker construction failure, errors, malformed output and size overflow release the slot', async () => {
	try {
		globalThis.Worker=class{constructor(){throw Error('CSP blocked worker');}};
		await assert.rejects(textPdf(new Blob(['test'])),/CSP/);
		globalThis.Worker=class{postMessage(){queueMicrotask(()=>this.onerror());}terminate(){}};
		await assert.rejects(textPdf(new Blob(['test'])),/could not start/);
		globalThis.Worker=class{postMessage(){queueMicrotask(()=>this.onmessageerror());}terminate(){}};
		await assert.rejects(textPdf(new Blob(['test'])),/unreadable/);
		for (const bytes of [new ArrayBuffer(1),new ArrayBuffer(8),new ArrayBuffer(PDF_LIMITS.output+1)]) {
			globalThis.Worker=class{postMessage(){queueMicrotask(()=>this.onmessage({data:{bytes}}));}terminate(){}};
			await assert.rejects(textPdf(new Blob(['test'])),/invalid/);
		}
	} finally { globalThis.Worker=WorkerBridge; }
});
await check('shipped package-layout assets run offline with verified asset hashes', async () => {
	const manifest=JSON.parse(readFileSync('app/vendor/pdf/manifest.json','utf8'));
	for(const [name,hash] of Object.entries(manifest)) assert.equal(createHash('sha256').update(readFileSync('app/vendor/pdf/'+name)).digest('hex'),hash,name);
	assert.match(readFileSync('electron-builder.yml','utf8'), /^\s*- app\/\*\*\/\*$/m);
	const root=mkdtempSync(join(tmpdir(),'openweb-pdf-package-'));
	try {
		cpSync('app',join(root,'app'),{recursive:true});cpSync('package.json',join(root,'package.json'));
		const copy=await import(pathToFileURL(join(root,'app/js/core/convert.js')));
		const output=await copy.run({...copy.ADAPTERS.find(a=>a.id==='pdf-make'),available:true},new Blob(['離線文字']));
		assert.equal(await output.slice(0,5).text(),'%PDF-');
	} finally {rmSync(root,{recursive:true});}
});
if(process.env.PDF_RENDER_FIXTURE) {
	// One visible glyph per row lets an independent rasterizer catch the subset
	// regression where text extraction succeeds while visible glyphs disappear.
	writeFileSync(process.env.PDF_RENDER_FIXTURE,await createTextPdf(enc('廣\n東\n話\n香\n港\n嘅\n離\n線\n文\n件\nA\nB\nC\né\n1\n2\n3'),font));
}
console.log('Offline PDF: '+checks+' integration/adversarial checks passed.');
