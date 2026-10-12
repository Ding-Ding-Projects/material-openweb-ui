import '../../vendor/pdf/jspdf.js';
import { PDF_LIMITS } from './pdf.js';

export function decodePdfSource(bytes) {
	if (!(bytes instanceof Uint8Array) || bytes.byteLength > PDF_LIMITS.bytes)
		throw new Error('PDF source exceeds the 256 KiB input limit.');
	let text;
	try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
	catch { throw new Error('PDF source must be valid UTF-8 text.'); }
	if (Array.from(text).length > PDF_LIMITS.characters) throw new Error('PDF source exceeds the 50000-character limit.');
	if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(text))
		throw new Error('PDF source contains unsupported control or bidirectional formatting characters.');
	return text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
}

export async function createTextPdf(bytes, fontBytes) {
	const text = decodePdfSource(bytes);
	const doc = new globalThis.jspdf.jsPDF({ unit: 'pt', format: 'a4', compress: true, putOnlyUsedFonts: true });
	let binary = '';
	for (let offset = 0; offset < fontBytes.length; offset += 32768)
		binary += String.fromCharCode(...fontBytes.subarray(offset, offset + 32768));
	doc.addFileToVFS('MaterialOfflineTC-Regular.ttf', binary);
	doc.addFont('MaterialOfflineTC-Regular.ttf', 'MaterialOfflineTC', 'normal');
	doc.setFont('MaterialOfflineTC');
	doc.setFontSize(11);
	const font = doc.getFont();
	if (typeof font.metadata?.characterToGlyph !== 'function') throw new Error('The bundled PDF font could not be parsed.');
	const widths = new Map();
	for (const char of text) {
		if (char === '\n') continue;
		const cp = char.codePointAt(0);
		if (cp > 0xffff || !font.metadata.characterToGlyph(cp)) throw new Error('Bundled PDF font does not support U+' + cp.toString(16).toUpperCase().padStart(4, '0') + '. Nothing was written.');
		if (!widths.has(char)) widths.set(char, doc.getTextWidth(char));
	}
	const lines = [];
	let line = '', width = 0;
	const push = () => {
		if (lines.length >= PDF_LIMITS.pages * 49) throw new Error('PDF source exceeds the 100-page layout limit.');
		lines.push(line); line = ''; width = 0;
	};
	for (const char of text) {
		if (char === '\n') { push(); continue; }
		const advance = widths.get(char);
		if (width + advance > 499 && line) push();
		line += char; width += advance;
	}
	push();
	doc.setProperties({ creator: 'Material Open WebUI offline text converter' });
	for (let offset = 0; offset < lines.length; offset += 49) {
		if (offset) doc.addPage();
		for (let index = offset; index < Math.min(lines.length, offset + 49); index++)
			doc.text(lines[index], 48, 57.89 + (index - offset) * 15);
	}
	const output = new Uint8Array(doc.output('arraybuffer'));
	if (output.byteLength > PDF_LIMITS.output) throw new Error('PDF output exceeds the 16 MiB limit.');
	return output;
}
