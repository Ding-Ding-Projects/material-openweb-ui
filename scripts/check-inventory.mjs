#!/usr/bin/env node
// Checks the repository against the hand-written INVENTORY.md.
//
// The point of reading a hand-written list rather than deriving one: a checklist
// that discovers its own items can never notice that an item disappeared. This
// one fails when the tree and the list disagree in either direction.
//
//   node scripts/check-inventory.mjs           # exits non-zero on any failure
//   node scripts/check-inventory.mjs --quiet   # only prints failures

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const NL = String.fromCharCode(10);
const INVENTORY = join(ROOT, 'INVENTORY.md');
const CATALOGUE = join(ROOT, 'docs', 'assets', 'js', 'content.js');

const quiet = process.argv.includes('--quiet');
const failures = [];
const notes = [];

/**
 * Substring matching is not good enough here, and the negative regression is
 * what proved it: renaming `searchField` to `searchFieldRenamed` leaves the old
 * needle present as a substring, so a plain `includes` stays green while the
 * thing it claims to find no longer exists.
 *
 * So a needle only counts when it sits on real identifier boundaries.
 */
function isWordChar(c) {
  return c !== undefined && c !== '' && /[A-Za-z0-9_$]/.test(c);
}

function containsExact(body, needle) {
  if (!needle) return false;
  let i = body.indexOf(needle);
  while (i !== -1) {
    const before = i === 0 ? '' : body[i - 1];
    const after = body[i + needle.length] ?? '';
    const startOk = !isWordChar(needle[0]) || !isWordChar(before);
    const endOk = !isWordChar(needle[needle.length - 1]) || !isWordChar(after);
    if (startOk && endOk) return true;
    i = body.indexOf(needle, i + 1);
  }
  return false;
}

function fail(msg) { failures.push(msg); }
function note(msg) { if (!quiet) notes.push(msg); }

// ---------- read the hand-written list ----------

if (!existsSync(INVENTORY)) {
  console.error('FAIL: INVENTORY.md is missing. The completeness inventory is the contract; without it there is nothing to check against.');
  process.exit(1);
}
if (!existsSync(CATALOGUE)) {
  console.error('FAIL: docs/assets/js/content.js is missing, so the catalogue cannot be compared with the inventory.');
  process.exit(1);
}

const inventoryText = readFileSync(INVENTORY, 'utf8');
const catalogueText = readFileSync(CATALOGUE, 'utf8');

const VALID_STATUS = new Set(['shipped', 'partial', 'planned', 'na']);

const rows = [];
for (const line of inventoryText.split(NL)) {
  const t = line.trim();
  if (!t.startsWith('|')) continue;
  const cells = t.split('|').slice(1, -1).map((c) => c.trim());
  if (cells.length < 6) continue;
  if (cells[0] === 'id' || /^-+$/.test(cells[0])) continue;
  const [id, feature, site, app, anchor] = cells;
  if (!VALID_STATUS.has(site) || !VALID_STATUS.has(app)) continue; // not a feature row
  rows.push({ id, feature, site, app, anchor });
}

if (!rows.length) {
  console.error('FAIL: INVENTORY.md parsed to zero feature rows. Either the table shape changed or the inventory was emptied.');
  process.exit(1);
}

// ---------- read the catalogue the site actually renders ----------

const catalogue = [];
const featureRe = /\{\s*[\r\n\s]*id:\s*'([^']+)'[\s\S]*?site:\s*'([^']+)',\s*app:\s*'([^']+)'/g;
let m;
while ((m = featureRe.exec(catalogueText)) !== null) {
  catalogue.push({ id: m[1], site: m[2], app: m[3] });
}

if (!catalogue.length) {
  fail('Parsed zero features out of content.js. The catalogue shape changed, and this guard is now checking nothing.');
}

// ---------- 1. every catalogued feature has a row ----------

const rowById = new Map(rows.map((r) => [r.id, r]));
for (const f of catalogue) {
  if (!rowById.has(f.id)) {
    fail('Feature "' + f.id + '" is in the catalogue but has no row in INVENTORY.md. A feature that vanishes from the inventory is exactly what this guard exists to catch.');
  }
}

// ---------- 2. every row names a real feature ----------

const catById = new Map(catalogue.map((f) => [f.id, f]));
for (const r of rows) {
  if (!catById.has(r.id)) {
    fail('INVENTORY.md row "' + r.id + '" names a feature that is not in the catalogue. Either it was deleted and the row is stale, or the id is wrong.');
  }
}

// ---------- 3. shipped/partial claims must resolve ----------

for (const r of rows) {
  const claimsCode = r.site === 'shipped' || r.site === 'partial';
  const hasAnchor = r.anchor && r.anchor !== '—' && r.anchor !== '-';

  if (claimsCode && !hasAnchor) {
    fail('Row "' + r.id + '" claims site: ' + r.site + ' but names no implementation anchor. A claim with nothing behind it is the thing an inventory is supposed to prevent.');
    continue;
  }

  if (!claimsCode && hasAnchor) {
    fail('Row "' + r.id + '" is site: ' + r.site + ' yet carries an anchor (' + r.anchor + '). Either it actually shipped and the status is wrong, or the anchor is fiction.');
    continue;
  }

  if (!hasAnchor) continue;

  const cleaned = r.anchor.replace(/`/g, '');
  const hash = cleaned.indexOf('#');
  if (hash === -1) {
    fail('Row "' + r.id + '" anchor "' + r.anchor + '" is not in path#needle form, so it cannot be checked.');
    continue;
  }
  const path = cleaned.slice(0, hash);
  const needle = cleaned.slice(hash + 1);
  const full = join(ROOT, path);

  if (!existsSync(full)) {
    fail('Row "' + r.id + '" points at ' + path + ', which does not exist.');
    continue;
  }
  const body = readFileSync(full, 'utf8');
  if (!containsExact(body, needle)) {
    const softHit = body.includes(needle);
    fail('Row "' + r.id + '" points at ' + path + '#' + needle + ', but that file does not contain "' + needle + '"'
      + (softHit ? ' on an identifier boundary — it only appears as part of a longer name, which is what a rename looks like.' : '. A rename or deletion that skipped the inventory looks exactly like this.'));
    continue;
  }
  note('ok  ' + r.id.padEnd(15) + ' → ' + path + '#' + needle);
}

// ---------- 4. the page and the inventory must agree ----------

for (const f of catalogue) {
  const r = rowById.get(f.id);
  if (!r) continue;
  if (r.site !== f.site) {
    fail('Feature "' + f.id + '" is ' + f.site + ' in the catalogue the site renders, but ' + r.site + ' in INVENTORY.md. The page must never claim more than the inventory does.');
  }
  if (r.app !== f.app) {
    fail('Feature "' + f.id + '" is app: ' + f.app + ' in the catalogue but app: ' + r.app + ' in INVENTORY.md.');
  }
}

// ---------- report ----------

if (!quiet) {
  for (const n of notes) console.log(n);
  console.log('');
  console.log('inventory rows: ' + rows.length + ', catalogue features: ' + catalogue.length);
}

if (failures.length) {
  console.error('');
  for (const f of failures) console.error('FAIL: ' + f);
  console.error('');
  console.error(failures.length + ' inventory failure(s).');
  process.exit(1);
}

console.log('Inventory is consistent: every catalogued feature has a row, every row names a real feature, every shipped claim resolves, and the page agrees with the list.');
process.exit(0);
