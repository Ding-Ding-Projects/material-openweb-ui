// The worker owns font parsing and PDF allocation. No renderer or network service.
export const PDF_LIMITS = Object.freeze({ bytes: 256 * 1024, characters: 50000, pages: 100, output: 16 * 1024 * 1024, timeout: 30000 });
let busy = false;
export function validatePdfSize(file) {
	if (!file || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > PDF_LIMITS.bytes)
		throw new Error('PDF source exceeds the 256 KiB input limit.');
}
export async function textPdf(file) {
	validatePdfSize(file);
	if (busy) throw new Error('A PDF conversion is already running. Wait for it to finish.');
	if (typeof Worker !== 'function') throw new Error('PDF creation needs the application worker runtime.');
	busy = true;
	let worker;
	let timer;
	try {
		return await new Promise((resolve, reject) => {
			const fail = (message) => reject(new Error(message));
			timer = setTimeout(() => fail('PDF conversion exceeded the 30-second time limit. Nothing was written.'), PDF_LIMITS.timeout);
			worker = new Worker(new URL('./pdf-worker.js', import.meta.url), { type: 'module' });
			worker.onerror = () => fail('The offline PDF worker could not start or failed. Nothing was written.');
			worker.onmessageerror = () => fail('The PDF worker returned an unreadable result.');
			worker.onmessage = ({ data }) => {
				if (data?.error) return fail(data.error);
				if (!(data?.bytes instanceof ArrayBuffer) || data.bytes.byteLength > PDF_LIMITS.output || data.bytes.byteLength < 5)
					return fail('The PDF worker returned an invalid or oversized result.');
				if (new TextDecoder().decode(new Uint8Array(data.bytes, 0, 5)) !== '%PDF-')
					return fail('The PDF worker returned an invalid PDF signature.');
				resolve(new Blob([data.bytes], { type: 'application/pdf' }));
			};
			worker.postMessage(file);
		});
	} finally {
		clearTimeout(timer);
		worker?.terminate();
		busy = false;
	}
}
