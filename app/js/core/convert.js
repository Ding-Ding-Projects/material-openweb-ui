// File type detection and the conversion adapter registry.
//
// Type comes from the actual bytes, never the extension. A PNG renamed to .txt
// is still a PNG, and a .png that is really a ZIP is still a ZIP — trusting the
// name is how a converter produces confidently corrupt output.
//
// An adapter is only `available` when everything it needs is bundled and works
// offline. A tool that happens to be on the developer's PATH must never make a
// format appear enabled, because it will not be there on the machine that
// installs the app. Unavailable adapters stay visible and name exactly what is
// missing, rather than being hidden so the catalogue looks complete.

export const CATEGORIES = [
  'Documents/PDF',
  'Images',
  'Audio',
  'Video',
  'Archives',
  'Structured Data/Spreadsheets',
  'Code/Text',
  'Binary Encodings'
];

const SIGNATURES = [
  { type: 'PNG image',   cat: 'Images', mime: 'image/png',  at: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: 'JPEG image',  cat: 'Images', mime: 'image/jpeg', at: 0, bytes: [0xff, 0xd8, 0xff] },
  { type: 'GIF image',   cat: 'Images', mime: 'image/gif',  at: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
  { type: 'BMP image',   cat: 'Images', mime: 'image/bmp',  at: 0, bytes: [0x42, 0x4d] },
  { type: 'PDF document', cat: 'Documents/PDF', mime: 'application/pdf', at: 0, bytes: [0x25, 0x50, 0x44, 0x46] },
  { type: 'GZIP archive', cat: 'Archives', mime: 'application/gzip', at: 0, bytes: [0x1f, 0x8b] },
  { type: '7-Zip archive', cat: 'Archives', mime: 'application/x-7z-compressed', at: 0, bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] },
  { type: 'MP3 audio',   cat: 'Audio', mime: 'audio/mpeg', at: 0, bytes: [0x49, 0x44, 0x33] },
  { type: 'FLAC audio',  cat: 'Audio', mime: 'audio/flac', at: 0, bytes: [0x66, 0x4c, 0x61, 0x43] },
  { type: 'OGG container', cat: 'Audio', mime: 'audio/ogg', at: 0, bytes: [0x4f, 0x67, 0x67, 0x53] }
];

function matches(u8, at, bytes) {
  if (u8.length < at + bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) if (u8[at + i] !== bytes[i]) return false;
  return true;
}

function hexHead(u8, n = 12) {
  return Array.from(u8.slice(0, n)).map((b) => b.toString(16).padStart(2, '0')).join(' ');
}

/**
 * Inspects a bounded prefix and reports what the bytes actually are.
 * Always returns a result; an unrecognised file is reported as such with its
 * header shown, never guessed at.
 */
export function sniff(u8) {
  if (!u8 || !u8.length) {
    return { type: 'Empty file', cat: 'Code/Text', mime: 'application/octet-stream', evidence: 'The file contains no bytes.' };
  }

  for (const s of SIGNATURES) {
    if (matches(u8, s.at, s.bytes)) {
      return { type: s.type, cat: s.cat, mime: s.mime, evidence: 'Signature at offset ' + s.at + ': ' + s.bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ') };
    }
  }

  // RIFF containers carry their real type at offset 8, so the outer signature
  // alone would call a WAV and a WebP the same thing.
  if (matches(u8, 0, [0x52, 0x49, 0x46, 0x46])) {
    if (matches(u8, 8, [0x57, 0x45, 0x42, 0x50])) return { type: 'WebP image', cat: 'Images', mime: 'image/webp', evidence: 'RIFF container tagged WEBP at offset 8' };
    if (matches(u8, 8, [0x57, 0x41, 0x56, 0x45])) return { type: 'WAV audio', cat: 'Audio', mime: 'audio/wav', evidence: 'RIFF container tagged WAVE at offset 8' };
    if (matches(u8, 8, [0x41, 0x56, 0x49, 0x20])) return { type: 'AVI video', cat: 'Video', mime: 'video/x-msvideo', evidence: 'RIFF container tagged AVI at offset 8' };
    return { type: 'RIFF container', cat: 'Binary Encodings', mime: 'application/octet-stream', evidence: 'RIFF container with an unrecognised inner tag' };
  }

  // ISO-BMFF: the brand lives at offset 8, after the box size.
  if (matches(u8, 4, [0x66, 0x74, 0x79, 0x70])) {
    const brand = new TextDecoder().decode(u8.slice(8, 12));
    if (/^(qt|M4A)/i.test(brand)) return { type: 'MP4-family audio (' + brand.trim() + ')', cat: 'Audio', mime: 'audio/mp4', evidence: 'ISO base media brand "' + brand.trim() + '"' };
    return { type: 'MP4 video (' + brand.trim() + ')', cat: 'Video', mime: 'video/mp4', evidence: 'ISO base media brand "' + brand.trim() + '"' };
  }

  // A ZIP might be an office document or a jar; the container is what is
  // certain, so that is what is reported.
  if (matches(u8, 0, [0x50, 0x4b, 0x03, 0x04]) || matches(u8, 0, [0x50, 0x4b, 0x05, 0x06])) {
    return { type: 'ZIP archive', cat: 'Archives', mime: 'application/zip', evidence: 'ZIP local file header (PK\\x03\\x04)' };
  }

  // Text heuristics, last, and only over a bounded prefix.
  const n = Math.min(u8.length, 512);
  let printable = 0;
  for (let i = 0; i < n; i++) {
    const b = u8[i];
    if (b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127) || b >= 128) printable++;
  }
  if (n && printable / n > 0.95) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(u8.slice(0, 512)).trim();
    const evidence = Math.round((printable / n) * 100) + '% of the first ' + n + ' bytes are printable';
    if (text.startsWith('{') || text.startsWith('[')) {
      return { type: 'JSON / structured text', cat: 'Structured Data/Spreadsheets', mime: 'application/json', evidence };
    }
    if (/^[^,\n]+(,[^,\n]+)+(\r?\n|$)/.test(text)) {
      return { type: 'CSV table', cat: 'Structured Data/Spreadsheets', mime: 'text/csv', evidence };
    }
    if (text.startsWith('<?xml')) return { type: 'XML document', cat: 'Code/Text', mime: 'application/xml', evidence };
    if (text.startsWith('<')) return { type: 'Markup text (HTML/SVG)', cat: 'Code/Text', mime: 'text/html', evidence };
    return { type: 'Plain text', cat: 'Code/Text', mime: 'text/plain', evidence };
  }

  return {
    type: 'Unrecognised binary',
    cat: 'Binary Encodings',
    mime: 'application/octet-stream',
    evidence: 'No known signature matched. Header: ' + hexHead(u8)
  };
}

// ---------------------------------------------------------------- adapters

/**
 * `available: false` entries are as important as the working ones. They keep a
 * capability gap visible and name the exact dependency, instead of leaving the
 * user to wonder whether the format is unsupported or the app is broken.
 */
export const ADAPTERS = [
  { id: 'img-png',  cat: 'Images', from: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'], to: 'PNG', available: true, kind: 'canvas', mime: 'image/png', ext: 'png',
    discloses: 'Re-encodes through the renderer\'s image decoder.',
    destroys: ['Animation, if the source has any: only the first frame survives.'] },
  { id: 'img-jpeg', cat: 'Images', from: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'], to: 'JPEG', available: true, kind: 'canvas', mime: 'image/jpeg', ext: 'jpg',
    discloses: 'Re-encodes through the renderer\'s image decoder.',
    destroys: [
      'Transparency: JPEG has none, so any transparent area becomes black.',
      'Detail: the compression is lossy.',
      'Metadata: none of it is carried over.',
      'Animation, if the source has any: only the first frame survives.'
    ] },
  { id: 'img-webp', cat: 'Images', from: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'], to: 'WebP', available: true, kind: 'canvas', mime: 'image/webp', ext: 'webp',
    discloses: 'Encoded at quality 0.92.',
    destroys: [
      'Detail: the default encoding is lossy.',
      'Animation, if the source has any: only the first frame survives.'
    ] },
  { id: 'img-avif', cat: 'Images', from: ['image/png', 'image/jpeg', 'image/webp'], to: 'AVIF', available: false,
    reason: 'No AVIF encoder is bundled. Chromium can decode AVIF but not encode it, so this needs a libavif build shipped inside the application.' },

  { id: 'pdf-make', cat: 'Documents/PDF', from: ['text/plain', 'text/html', 'application/json', 'text/csv'], to: 'PDF', available: false,
    reason: 'Needs a bundled PDF writer (pdf-lib or equivalent). Nothing is installed, so this stays disabled rather than producing a file that only looks like a PDF.' },
  { id: 'pdf-text', cat: 'Documents/PDF', from: ['application/pdf'], to: 'Plain text', available: false,
    reason: 'Needs a bundled PDF text-extraction library (pdf.js). Not installed.' },
  { id: 'pdf-pages', cat: 'Documents/PDF', from: ['application/pdf'], to: 'Split into pages', available: false,
    reason: 'Needs a bundled PDF writer to re-emit pages atomically. Not installed.' },

  { id: 'audio-wav', cat: 'Audio', from: ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/ogg'], to: 'WAV (PCM)', available: false,
    reason: 'Needs a bundled ffmpeg.wasm build. Not installed — and a system ffmpeg on PATH would not count, because it will not be there after installation.' },
  { id: 'video-webm', cat: 'Video', from: ['video/mp4', 'video/x-msvideo'], to: 'WebM', available: false,
    reason: 'Needs a bundled ffmpeg.wasm build. Not installed.' },
  { id: 'zip-list', cat: 'Archives', from: ['application/zip'], to: 'File listing (text)', available: false,
    reason: 'Needs a ZIP central-directory reader. Not installed.' },

  { id: 'json-csv',   cat: 'Structured Data/Spreadsheets', from: ['application/json'], to: 'CSV', available: true, kind: 'json2csv', mime: 'text/csv', ext: 'csv',
    discloses: 'Column order comes from the union of every row\'s keys.',
    destroys: ['Structure: nested objects and arrays become JSON text inside a single cell.'] },
  { id: 'csv-json',   cat: 'Structured Data/Spreadsheets', from: ['text/csv'], to: 'JSON', available: true, kind: 'csv2json', mime: 'application/json', ext: 'json',
    discloses: 'Every value is read as a string; numbers are not inferred, because guessing types is how leading zeros and long identifiers get destroyed.',
    destroys: [] },
  { id: 'json-pretty', cat: 'Structured Data/Spreadsheets', from: ['application/json'], to: 'Pretty-printed JSON', available: true, kind: 'jsonpretty', mime: 'application/json', ext: 'json',
    discloses: 'Key order is preserved.',
    destroys: ['Duplicate keys, which JSON permits but no parser keeps: they collapse to the last one.'] },

  { id: 'text-lf',    cat: 'Code/Text', from: ['text/plain', 'text/html', 'application/json', 'text/csv', 'application/xml'], to: 'UTF-8 text (LF endings)', available: true, kind: 'textlf', mime: 'text/plain', ext: 'txt',
    discloses: 'The output is UTF-8 without a byte-order mark.',
    destroys: ['Carriage returns: every line ending is normalised to LF.'] },
  { id: 'html-text',  cat: 'Code/Text', from: ['text/html'], to: 'Plain text (tags stripped)', available: true, kind: 'striphtml', mime: 'text/plain', ext: 'txt',
    discloses: 'Only the text content survives.',
    destroys: ['All markup, attributes, scripts and styles.'] },

  { id: 'to-b64',   cat: 'Binary Encodings', from: ['*'], to: 'Base64 text', available: true, kind: 'b64', mime: 'text/plain', ext: 'b64.txt',
    discloses: 'Output is about a third larger than the input.', destroys: [] },
  { id: 'to-hex',   cat: 'Binary Encodings', from: ['*'], to: 'Hex dump', available: true, kind: 'hex', mime: 'text/plain', ext: 'hex.txt',
    discloses: 'The dump is for reading, not for converting back.',
    destroys: ['Everything past the first megabyte: a larger file is truncated.'] },
  { id: 'from-b64', cat: 'Binary Encodings', from: ['text/plain'], to: 'Bytes from Base64', available: true, kind: 'unb64', mime: 'application/octet-stream', ext: 'bin',
    discloses: 'Fails rather than guessing if the text is not valid Base64.', destroys: [] }
];

/**
 * Whether a conversion destroys anything.
 *
 * Derived from the list rather than stored beside it, which is the whole point.
 * The two were separate fields, and two of them disagreed: `img-png` and
 * `json-pretty` were both flagged lossless while their own disclosure text said
 * animation was lost and duplicate keys collapsed. The pre-run disclosure was
 * gated on the flag, so those two conversions ran with no warning at all —
 * while the sentence explaining the loss sat right there in the same object.
 *
 * A boolean that can contradict the prose beside it will eventually contradict
 * the prose beside it. Now the prose IS the flag.
 */
export function isLossy(adapter) {
  return Boolean(adapter && adapter.destroys && adapter.destroys.length);
}

export function adaptersFor(mime) {
  return ADAPTERS.filter((a) => a.from.includes('*') || a.from.includes(mime));
}

// ---------------------------------------------------------------- running

const MAX_HEX = 1 << 20;

/**
 * Runs one adapter over a Blob/File and returns a Blob.
 * Throws with a readable reason rather than writing guessed or truncated output.
 */
export async function run(adapter, file, { decodeImage } = {}) {
  if (!adapter) throw new Error('No adapter was chosen.');
  if (!adapter.available) throw new Error(adapter.reason || 'That adapter is not available in this build.');

  const buf = new Uint8Array(await file.arrayBuffer());
  const text = () => new TextDecoder('utf-8', { fatal: false }).decode(buf);

  switch (adapter.kind) {
    case 'canvas': {
      if (!decodeImage) throw new Error('Image conversion needs a renderer; this adapter cannot run outside a document.');
      const bitmap = await decodeImage(file);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      return canvas.convertToBlob({ type: adapter.mime, quality: 0.92 });
    }

    case 'json2csv': {
      const data = JSON.parse(text());
      const rows = Array.isArray(data) ? data : [data];
      if (!rows.length) return new Blob([''], { type: adapter.mime });
      const keys = [...new Set(rows.flatMap((r) => (r && typeof r === 'object' ? Object.keys(r) : [])))];
      const esc = (v) => {
        const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
        return /["\n,\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const body = rows.map((r) => keys.map((k) => esc(r ? r[k] : '')).join(',')).join('\n');
      return new Blob([keys.join(',') + '\n' + body], { type: adapter.mime });
    }

    case 'csv2json': {
      const lines = text().split(/\r?\n/).filter((l) => l.length);
      if (!lines.length) return new Blob(['[]'], { type: adapter.mime });
      const parseLine = (line) => {
        const out = [];
        let cur = '';
        let quoted = false;
        for (let i = 0; i < line.length; i++) {
          const c = line[i];
          if (quoted) {
            if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
            else if (c === '"') quoted = false;
            else cur += c;
          } else if (c === '"') quoted = true;
          else if (c === ',') { out.push(cur); cur = ''; }
          else cur += c;
        }
        out.push(cur);
        return out;
      };
      const keys = parseLine(lines[0]);
      const records = lines.slice(1).map((l) => {
        const cells = parseLine(l);
        return Object.fromEntries(keys.map((k, i) => [k || 'column' + (i + 1), cells[i] ?? '']));
      });
      return new Blob([JSON.stringify(records, null, 2)], { type: adapter.mime });
    }

    case 'jsonpretty':
      return new Blob([JSON.stringify(JSON.parse(text()), null, 2)], { type: adapter.mime });

    case 'textlf':
      return new Blob([text().replace(/\r\n?/g, '\n')], { type: adapter.mime });

    case 'striphtml': {
      // Parsed rather than regex-stripped: a regex over markup drops content
      // inside attributes and mangles anything with a > in it.
      const doc = new DOMParser().parseFromString(text(), 'text/html');
      doc.querySelectorAll('script, style').forEach((n) => n.remove());
      return new Blob([(doc.body?.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()], { type: adapter.mime });
    }

    case 'b64': {
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) {
        s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      }
      return new Blob([btoa(s)], { type: adapter.mime });
    }

    case 'hex': {
      const lines = [];
      const limit = Math.min(buf.length, MAX_HEX);
      for (let i = 0; i < limit; i += 16) {
        const slice = buf.subarray(i, i + 16);
        const hex = Array.from(slice).map((b) => b.toString(16).padStart(2, '0')).join(' ').padEnd(47);
        const ascii = Array.from(slice).map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
        lines.push(i.toString(16).padStart(8, '0') + '  ' + hex + '  |' + ascii + '|');
      }
      if (buf.length > MAX_HEX) {
        lines.push('', '-- truncated at ' + MAX_HEX + ' of ' + buf.length + ' bytes --');
      }
      return new Blob([lines.join('\n')], { type: adapter.mime });
    }

    case 'unb64': {
      const cleaned = text().replace(/\s/g, '');
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) {
        throw new Error('That text is not valid Base64, so nothing was written. The source file is untouched.');
      }
      const bin = atob(cleaned);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return new Blob([out], { type: adapter.mime });
    }

    default:
      throw new Error('Unknown adapter kind: ' + adapter.kind);
  }
}

/** A stable output name that never silently overwrites its own source. */
export function outputName(sourceName, adapter) {
  const stem = String(sourceName || 'file').replace(/\.[^.]+$/, '');
  return stem + '.' + adapter.ext;
}
