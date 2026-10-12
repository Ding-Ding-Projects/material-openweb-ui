import { createTextPdf } from './pdf-engine.js';
import { validatePdfSize } from './pdf.js';
let started = false;
self.onmessage = async ({ data: file }) => {
	if (started) return;
	started = true;
	try {
		validatePdfSize(file);
		const source = new Uint8Array(await file.arrayBuffer());
		const response = await fetch(
			new URL('../../vendor/pdf/MaterialOfflineTC-Regular.ttf', import.meta.url)
		);
		if (!response.ok) throw new Error('The bundled offline PDF font could not be loaded.');
		const font = new Uint8Array(await response.arrayBuffer());
		if (font.byteLength > 8 * 1024 * 1024)
			throw new Error('The bundled PDF font exceeds its size limit.');
		const bytes = await createTextPdf(source, font);
		self.postMessage({ bytes: bytes.buffer }, [bytes.buffer]);
	} catch (error) {
		self.postMessage({ error: error instanceof Error ? error.message : 'PDF creation failed.' });
	}
};
