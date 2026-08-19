// Open WebUI MD3 — core data + pure logic (no UI)
export const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function b32decode(s) {
  s = (s || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, val = 0, out = [];
  for (const c of s) { val = (val << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  return new Uint8Array(out);
}
export async function totp(secret, period = 30, digits = 6, tsMs = Date.now()) {
  const keyData = b32decode(secret);
  if (!keyData.length) throw new Error('empty secret');
  const counter = Math.floor(tsMs / 1000 / period);
  const buf = new ArrayBuffer(8); const dv = new DataView(buf);
  dv.setUint32(4, counter); // counters fit 32 bits until year ~6053
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf));
  const off = sig[19] & 0xf;
  const code = ((sig[off] & 0x7f) << 24 | sig[off + 1] << 16 | sig[off + 2] << 8 | sig[off + 3]) % (10 ** digits);
  return String(code).padStart(digits, '0');
}

export const OLLAMA_STORE = [
  { name: 'llama3.3', desc: 'Meta Llama 3.3: state-of-the-art 70B instruction-tuned model.', caps: ['tools'], pulls: '1.9M', updated: '2025-12', tags: [{ tag: '70b', gb: 43 }] },
  { name: 'llama3.2', desc: 'Meta Llama 3.2: small instruction models for edge devices.', caps: ['tools'], pulls: '12.4M', updated: '2025-09', tags: [{ tag: '1b', gb: 1.3 }, { tag: '3b', gb: 2.0 }] },
  { name: 'qwen3', desc: 'Qwen 3: Alibaba dense + MoE family with thinking mode.', caps: ['tools', 'thinking'], pulls: '6.2M', updated: '2026-01', tags: [{ tag: '0.6b', gb: 0.5 }, { tag: '4b', gb: 2.6 }, { tag: '8b', gb: 5.2 }, { tag: '32b', gb: 20 }] },
  { name: 'deepseek-r1', desc: 'DeepSeek R1: open reasoning model family, distilled sizes.', caps: ['thinking'], pulls: '9.8M', updated: '2025-11', tags: [{ tag: '7b', gb: 4.7 }, { tag: '14b', gb: 9.0 }, { tag: '70b', gb: 43 }] },
  { name: 'gemma3', desc: 'Google Gemma 3: multimodal, 128K context, single-GPU friendly.', caps: ['vision'], pulls: '7.1M', updated: '2026-02', tags: [{ tag: '1b', gb: 0.8 }, { tag: '4b', gb: 3.3 }, { tag: '12b', gb: 8.1 }, { tag: '27b', gb: 17 }] },
  { name: 'phi4', desc: 'Microsoft Phi-4: 14B model strong at reasoning for its size.', caps: [], pulls: '2.3M', updated: '2025-08', tags: [{ tag: '14b', gb: 9.1 }] },
  { name: 'mistral', desc: 'Mistral 7B v0.3 with function calling.', caps: ['tools'], pulls: '11.7M', updated: '2025-05', tags: [{ tag: '7b', gb: 4.1 }] },
  { name: 'llava', desc: 'LLaVA: large language-and-vision assistant.', caps: ['vision'], pulls: '4.4M', updated: '2024-12', tags: [{ tag: '7b', gb: 4.7 }, { tag: '13b', gb: 8.0 }] },
  { name: 'qwen2.5-coder', desc: 'Code-specialized Qwen: generation, repair, completion.', caps: ['tools'], pulls: '5.5M', updated: '2025-06', tags: [{ tag: '1.5b', gb: 1.0 }, { tag: '7b', gb: 4.7 }, { tag: '32b', gb: 20 }] },
  { name: 'nomic-embed-text', desc: 'High-performing open text embedding model.', caps: ['embedding'], pulls: '3.1M', updated: '2024-07', tags: [{ tag: 'latest', gb: 0.27 }] },
  { name: 'mxbai-embed-large', desc: 'mixedbread.ai large embedding model.', caps: ['embedding'], pulls: '1.6M', updated: '2024-06', tags: [{ tag: 'latest', gb: 0.67 }] },
  { name: 'tinyllama', desc: 'Compact 1.1B Llama trained on 3T tokens.', caps: [], pulls: '2.8M', updated: '2024-01', tags: [{ tag: '1.1b', gb: 0.64 }] }
];
export const SIM_RAM_GB = 16;
export function fitVerdict(gb) {
  if (gb <= SIM_RAM_GB * 0.5) return { v: 'Fits', why: gb + ' GB weights vs ' + SIM_RAM_GB + ' GB RAM (simulated probe)' };
  if (gb <= SIM_RAM_GB * 0.85) return { v: 'Tight', why: gb + ' GB weights leaves little headroom on ' + SIM_RAM_GB + ' GB RAM' };
  return { v: 'Too big', why: gb + ' GB weights exceeds usable ' + SIM_RAM_GB + ' GB RAM' };
}

export const DIM_SUM = [
  { id: 'hk-dish-0002', name: 'Scallop Har Gow', canto: '帶子蝦餃', img: 'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-0002-scallop-har-gow.png' },
  { id: 'hk-dish-0003', name: 'Bamboo Shoot Har Gow', canto: '筍尖蝦餃', img: 'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-0003-bamboo-shoot-har-gow.png' },
  { id: 'hk-dish-0001', name: 'Har Gow', canto: '蝦餃', img: null },
  { id: 'hk-dish-0004', name: 'Siu Mai', canto: '燒賣', img: null },
  { id: 'hk-dish-0005', name: 'Char Siu Bao', canto: '叉燒包', img: null },
  { id: 'hk-dish-0006', name: 'Cheung Fun', canto: '腸粉', img: null }
];

export const CHANGELOG = [
  { version: '1.0.0', date: '2026-08-19', sections: [
    { title: 'Added', items: ['Material Design 3 Expressive rewrite of every Open WebUI surface', 'Browser-style tab strip with per-tab locks and context menu', 'Ctrl+Shift+F command palette with teleport to any feature', 'Full regex builder anchored beside every search field', 'Local Ollama suite manager (simulated local API in this prototype)', 'Local file converter with byte-based type detection', 'Authenticator with real TOTP codes computed locally', 'Personal-vocabulary JSON upload with validated states', 'App-logo customization: presets plus local upload', 'School mode with renameable label and local PIN unlock', 'Funny-level sliders, TTS narrator, scheduled settings, Status Hub card', 'Destructive-action super confirmation (phrase + slider gate)', 'Dim-sum startup surprise (10% chance)'] },
    { title: 'Notes', items: ['This build is a design prototype: all state is stored locally in your browser; the Ollama API is simulated.'] }
  ] }
];

export function sniffBytes(u8) {
  const h = Array.from(u8.slice(0, 12)).map(b => b.toString(16).padStart(2, '0')).join(' ');
  const at = (i, ...b) => b.every((x, j) => u8[i + j] === x);
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return { type: 'PNG image', cat: 'Images', mime: 'image/png' };
  if (at(0, 0xff, 0xd8, 0xff)) return { type: 'JPEG image', cat: 'Images', mime: 'image/jpeg' };
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return { type: 'GIF image', cat: 'Images', mime: 'image/gif' };
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return { type: 'WebP image', cat: 'Images', mime: 'image/webp' };
  if (at(0, 0x25, 0x50, 0x44, 0x46)) return { type: 'PDF document', cat: 'Documents/PDF', mime: 'application/pdf' };
  if (at(0, 0x50, 0x4b, 0x03, 0x04)) return { type: 'ZIP archive', cat: 'Archives', mime: 'application/zip' };
  if (at(0, 0x1f, 0x8b)) return { type: 'GZIP archive', cat: 'Archives', mime: 'application/gzip' };
  if (at(0, 0x49, 0x44, 0x33) || at(0, 0xff, 0xfb)) return { type: 'MP3 audio', cat: 'Audio', mime: 'audio/mpeg' };
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x41, 0x56, 0x45)) return { type: 'WAV audio', cat: 'Audio', mime: 'audio/wav' };
  if (at(4, 0x66, 0x74, 0x79, 0x70)) return { type: 'MP4 video', cat: 'Video', mime: 'video/mp4' };
  // text heuristics
  let printable = 0, n = Math.min(u8.length, 512);
  for (let i = 0; i < n; i++) { const b = u8[i]; if (b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127) || b >= 128) printable++; }
  if (n && printable / n > 0.95) {
    const txt = new TextDecoder().decode(u8.slice(0, 512)).trim();
    if (txt.startsWith('{') || txt.startsWith('[')) return { type: 'JSON / structured text', cat: 'Structured Data/Spreadsheets', mime: 'application/json' };
    if (/^[^,\n]+(,[^,\n]+)+\n/.test(txt)) return { type: 'CSV table', cat: 'Structured Data/Spreadsheets', mime: 'text/csv' };
    if (txt.startsWith('<')) return { type: 'Markup text (HTML/XML/SVG)', cat: 'Code/Text', mime: 'text/html' };
    return { type: 'Plain text', cat: 'Code/Text', mime: 'text/plain' };
  }
  return { type: 'Unknown binary (header ' + h + ')', cat: 'Binary Encodings', mime: 'application/octet-stream' };
}

// Adapter registry. available:false entries state the exact missing dependency.
export const ADAPTERS = [
  { cat: 'Images', from: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], to: 'PNG', available: true, kind: 'canvas', mime: 'image/png', ext: 'png' },
  { cat: 'Images', from: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], to: 'JPEG', available: true, kind: 'canvas', mime: 'image/jpeg', ext: 'jpg' },
  { cat: 'Images', from: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], to: 'WebP', available: true, kind: 'canvas', mime: 'image/webp', ext: 'webp' },
  { cat: 'Images', from: ['image/png', 'image/jpeg', 'image/webp'], to: 'AVIF', available: false, reason: 'No AVIF encoder in this runtime; needs libavif adapter' },
  { cat: 'Documents/PDF', from: ['text/plain', 'text/html', 'application/json', 'text/csv'], to: 'PDF', available: false, reason: 'Needs a bundled PDF writer adapter (e.g. pdf-lib); not installed in this prototype' },
  { cat: 'Documents/PDF', from: ['application/pdf'], to: 'Plain text', available: false, reason: 'Needs a PDF text-extraction adapter (pdf.js); not installed' },
  { cat: 'Audio', from: ['audio/mpeg', 'audio/wav'], to: 'WAV (PCM)', available: false, reason: 'Needs an ffmpeg.wasm adapter; not installed' },
  { cat: 'Video', from: ['video/mp4'], to: 'WebM', available: false, reason: 'Needs an ffmpeg.wasm adapter; not installed' },
  { cat: 'Archives', from: ['application/zip'], to: 'File listing (text)', available: false, reason: 'Needs a ZIP central-directory reader adapter; not installed' },
  { cat: 'Structured Data/Spreadsheets', from: ['application/json'], to: 'CSV', available: true, kind: 'json2csv', mime: 'text/csv', ext: 'csv' },
  { cat: 'Structured Data/Spreadsheets', from: ['text/csv'], to: 'JSON', available: true, kind: 'csv2json', mime: 'application/json', ext: 'json' },
  { cat: 'Structured Data/Spreadsheets', from: ['application/json'], to: 'Pretty-printed JSON', available: true, kind: 'jsonpretty', mime: 'application/json', ext: 'json' },
  { cat: 'Code/Text', from: ['text/plain', 'text/html', 'application/json', 'text/csv'], to: 'UTF-8 text (normalized LF)', available: true, kind: 'textlf', mime: 'text/plain', ext: 'txt' },
  { cat: 'Code/Text', from: ['text/html'], to: 'Plain text (tags stripped)', available: true, kind: 'striphtml', mime: 'text/plain', ext: 'txt' },
  { cat: 'Binary Encodings', from: ['*'], to: 'Base64 text', available: true, kind: 'b64', mime: 'text/plain', ext: 'b64.txt' },
  { cat: 'Binary Encodings', from: ['*'], to: 'Hex dump', available: true, kind: 'hex', mime: 'text/plain', ext: 'hex.txt' },
  { cat: 'Binary Encodings', from: ['text/plain'], to: 'Bytes from Base64', available: true, kind: 'unb64', mime: 'application/octet-stream', ext: 'bin' }
];
export const ADAPTER_CATS = ['Documents/PDF', 'Images', 'Audio', 'Video', 'Archives', 'Structured Data/Spreadsheets', 'Code/Text', 'Binary Encodings'];

export async function runAdapter(a, file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const text = () => new TextDecoder().decode(buf);
  if (a.kind === 'canvas') {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    return await new Promise(res => c.toBlob(res, a.mime, 0.92));
  }
  if (a.kind === 'json2csv') {
    const data = JSON.parse(text()); const rows = Array.isArray(data) ? data : [data];
    const keys = [...new Set(rows.flatMap(r => Object.keys(r)))];
    const esc = v => { const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return new Blob([keys.join(',') + '\n' + rows.map(r => keys.map(k => esc(r[k])).join(',')).join('\n')], { type: a.mime });
  }
  if (a.kind === 'csv2json') {
    const lines = text().split(/\r?\n/).filter(l => l.length);
    const parse = l => { const out = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const c = l[i]; if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; };
    const keys = parse(lines[0]);
    return new Blob([JSON.stringify(lines.slice(1).map(l => Object.fromEntries(parse(l).map((v, i) => [keys[i] || 'col' + i, v]))), null, 2)], { type: a.mime });
  }
  if (a.kind === 'jsonpretty') return new Blob([JSON.stringify(JSON.parse(text()), null, 2)], { type: a.mime });
  if (a.kind === 'textlf') return new Blob([text().replace(/\r\n?/g, '\n')], { type: a.mime });
  if (a.kind === 'striphtml') { const d = document.createElement('div'); d.innerHTML = text(); return new Blob([d.textContent], { type: a.mime }); }
  if (a.kind === 'b64') { let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return new Blob([btoa(s)], { type: a.mime }); }
  if (a.kind === 'hex') { let out = []; for (let i = 0; i < Math.min(buf.length, 1 << 20); i += 16) { out.push(i.toString(16).padStart(8, '0') + '  ' + Array.from(buf.subarray(i, i + 16)).map(b => b.toString(16).padStart(2, '0')).join(' ')); } return new Blob([out.join('\n')], { type: a.mime }); }
  if (a.kind === 'unb64') { const bin = atob(text().replace(/\s/g, '')); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: a.mime }); }
  throw new Error('unknown adapter kind');
}

export function validateVocabulary(obj) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return 'Root must be a JSON object';
  if (!obj.version) return 'Missing "version" field';
  const terms = obj.terms || obj.vocabulary || obj.entries;
  if (!Array.isArray(terms)) return 'Missing "terms" array';
  if (terms.length > 5000) return 'Too many terms (max 5000)';
  for (const t of terms.slice(0, 50)) { if (typeof t !== 'object' || (!t.alias && !t.term)) return 'Each term needs an "alias" or "term" field'; }
  return null;
}

const REPLIES = [
  'Here is a concise answer.\n\nThe key point is that this build runs entirely locally: every setting, chat, and credential you create stays in this window. The model responding right now is a simulated Ollama runtime, so responses are canned rather than generated.',
  'Good question. In a production build this request would stream from the local Ollama HTTP API at 127.0.0.1:11434. This prototype simulates that stream so the full chat surface — markdown, code blocks, message actions — can be exercised without a running daemon.\n\n```python\nimport requests\nr = requests.post("http://127.0.0.1:11434/api/chat", json={...})\n```',
  'Summary:\n\n- **Local-first** — no cloud calls leave this window\n- **Material 3** — tokens, shape, motion follow the M3 Expressive spec\n- **Simulated model** — swap in a real Ollama daemon for live generation\n\nAnything else you want to check?'
];
export function simulatedReply(i) { return REPLIES[i % REPLIES.length]; }

export function fuzzyScore(q, s) {
  q = q.toLowerCase(); s = s.toLowerCase();
  if (s.includes(q)) return 100 - s.indexOf(q);
  let qi = 0; for (const c of s) if (c === q[qi]) qi++;
  return qi === q.length ? 40 : -1;
}
export function matchQuery(q, s, useRegex, flags) {
  if (!q) return true;
  if (useRegex) { try { return new RegExp(q, flags || 'i').test(s); } catch (e) { return false; } }
  return s.toLowerCase().includes(q.toLowerCase());
}
export function fmtTime(ts) { const d = new Date(ts); return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
export function uid() { return Math.random().toString(36).slice(2, 10); }
