// Test-only bridge: exercise the shipped browser worker in a Node worker thread.
import { parentPort, workerData } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
globalThis.self = globalThis;
globalThis.postMessage = (data, transfer) => parentPort.postMessage(data, transfer);
globalThis.fetch = async (url) => {
	const target = new URL(url);
	if (
		target.protocol !== 'file:' ||
		!target.pathname.endsWith('/app/vendor/pdf/MaterialOfflineTC-Regular.ttf')
	)
		throw Error('Network forbidden');
	return new Response(await readFile(target));
};
await import(workerData.url);
parentPort.on('message', (data) => self.onmessage({ data }));
