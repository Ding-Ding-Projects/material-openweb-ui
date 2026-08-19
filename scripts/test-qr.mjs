#!/usr/bin/env node
// Round-trips the QR encoder through its own decoder.
//
// The encoder is written in-repo because pairing must not hand a one-time-code
// secret to a third-party QR service on its way to being drawn. That decision
// means correctness is this project's problem, and a QR that is subtly wrong is
// the worst kind: it looks completely convincing and scans as nothing.
//
// The three parts that fail silently are module placement, masking, and format
// information. Decoding the encoder's own output exercises all three — if
// placement or masking is wrong, the bytes come back as noise.
//
//   node scripts/test-qr.mjs

import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const qr = await import(pathToFileURL(join(process.cwd(), 'app', 'js', 'core', 'qr.js')).href);

let failures = 0;
function check(name, ok, detail = '') {
  if (ok) console.log('  pass  ' + name);
  else { console.error('  FAIL  ' + name + (detail ? ' — ' + detail : '')); failures++; }
}

// ---------- round trips ----------

console.log('round trips');

const CASES = [
  'HELLO',
  'otpauth://totp/Example:me?secret=JBSWY3DPEHPK3PXP&issuer=Example',
  'otpauth://totp/Ding%20Ding%20Projects:someone@example.test?secret=JBSWY3DPEHPK3PXP&algorithm=SHA256&digits=8&period=45&issuer=Ding%20Ding%20Projects',
  'a',
  '0123456789'.repeat(8),
  'Material Open WebUI — 物料設計'
];

for (const text of CASES) {
  let got = null;
  let err = null;
  try {
    const m = qr.encode(text);
    got = qr.decode(m);
  } catch (e) {
    err = e.message;
  }
  check('round trips ' + JSON.stringify(text.slice(0, 44)) + (text.length > 44 ? '…' : ''),
    got === text, err || JSON.stringify(String(got).slice(0, 60)));
}

// ---------- structure ----------

console.log('');
console.log('structure');

const m = qr.encode('otpauth://totp/Example:me?secret=JBSWY3DPEHPK3PXP');

check('the matrix is square', m.modules.length === m.size && m.modules.every((r) => r.length === m.size));
check('the size follows the version formula', m.size === m.version * 4 + 17, m.size + ' vs ' + (m.version * 4 + 17));
check('a mask was chosen from the eight', m.mask >= 0 && m.mask <= 7, String(m.mask));
check('the mask written into the format information is the one that was applied',
  (() => { const copy = { ...m, mask: 99 }; try { return qr.decode(copy) === 'otpauth://totp/Example:me?secret=JBSWY3DPEHPK3PXP'; } catch { return false; } })(),
  'decode must not depend on being told the mask');
check('every module is a boolean, with none left unset',
  m.modules.every((row) => row.every((v) => typeof v === 'boolean')));

// finder patterns: dark ring, light ring, dark core, in all three corners
function finderOk(rowOffset, colOffset) {
  const at = (r, c) => m.modules[rowOffset + r][colOffset + c];
  for (let i = 0; i < 7; i++) {
    if (!at(0, i) || !at(6, i) || !at(i, 0) || !at(i, 6)) return false; // outer ring dark
    }
  for (let i = 1; i < 6; i++) {
    if (at(1, i) && i !== 1 && i !== 5) return false; // inner ring light where expected
  }
  for (let r = 2; r <= 4; r++) for (let c = 2; c <= 4; c++) if (!at(r, c)) return false; // core dark
  return true;
}
check('the top-left finder pattern is intact', finderOk(0, 0));
check('the top-right finder pattern is intact', finderOk(0, m.size - 7));
check('the bottom-left finder pattern is intact', finderOk(m.size - 7, 0));

// timing patterns alternate
let timingOk = true;
for (let i = 8; i < m.size - 8; i++) {
  if (m.modules[6][i] !== (i % 2 === 0)) timingOk = false;
  if (m.modules[i][6] !== (i % 2 === 0)) timingOk = false;
}
check('both timing patterns alternate correctly', timingOk);

check('the always-dark module is dark', m.modules[m.size - 8][8] === true);

// ---------- rendering ----------

console.log('');
console.log('rendering');

const svg = qr.toSvg(m, { moduleSize: 5, quiet: 4 });
// The xmlns is a namespace identifier, not a fetch, so it is excluded rather
// than counted as a remote reference.
check('the SVG fetches nothing from anywhere',
  !/https?:/.test(svg.replace('http://www.w3.org/2000/svg', '')));
check('the quiet zone is honoured',
  svg.includes('width="' + ((m.size + 8) * 5) + '"'), 'expected ' + ((m.size + 8) * 5));
check('it is true black on true white rather than themed',
  svg.includes('#FFFFFF') && svg.includes('#000000') && !/var\(--/.test(svg));
check('every dark module is drawn',
  (svg.match(/<rect /g) || []).length === m.modules.flat().filter(Boolean).length + 1);

// ---------- refusals ----------

console.log('');
console.log('refusals');

function throws(fn) { try { fn(); return false; } catch { return true; } }
check('an empty string is refused', throws(() => qr.encode('')));
check('something far too long is refused', throws(() => qr.encode('x'.repeat(5000))));

console.log('');
if (failures) {
  console.error(failures + ' check(s) failed. The code would look convincing and scan as nothing.');
  process.exit(1);
}
console.log('The encoder round-trips through its own decoder, and the structure is sound.');
process.exit(0);
