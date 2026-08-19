#!/usr/bin/env node
// Negative regression for the completeness guard.
//
// A guard nobody has watched fail is a guard nobody should trust. This removes
// one asserted item at a time from a scratch copy of the tree and requires
// check-inventory.mjs to turn RED for each; then it restores the copy and
// requires it to turn GREEN again.
//
// A case that fails to turn the guard red is itself a failure here, because it
// means the guard is passing on a repository that is genuinely missing something.
//
//   node scripts/test-inventory-guard.mjs

import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = process.cwd();
const NL = String.fromCharCode(10);

// Only the files the guard actually reads need to exist in the scratch copy.
const NEEDED = [
  'INVENTORY.md',
  join('scripts', 'check-inventory.mjs'),
  join('docs', 'assets', 'js', 'content.js'),
  join('docs', 'assets', 'js', 'palette.js'),
  join('docs', 'assets', 'js', 'regex.js'),
  join('docs', 'assets', 'js', 'i18n.js'),
  join('docs', 'assets', 'js', 'settings.js'),
  join('docs', 'assets', 'js', 'ui.js'),
  join('docs', 'assets', 'js', 'store.js'),
  join('docs', 'assets', 'js', 'pages.js'),
  join('docs', 'assets', 'js', 'app.js'),
  join('docs', 'assets', 'css', 'tokens.css'),
  join('docs', 'assets', 'css', 'site.css'),
  join('electron', 'main.ts'),
  join('electron', 'hardware.ts'),
  join('electron', 'backend.ts'),
  join('electron', 'preload.ts')
];

// Any file an inventory row points at has to exist in the scratch copy, or the
// baseline goes red for the wrong reason and every case below proves nothing.
// This is derived from the inventory rather than hand-listed, because a
// hand-listed copy set is the same stale-list problem the guard exists to catch.
function anchorFiles() {
  try {
    const text = readFileSync(join(ROOT, 'INVENTORY.md'), 'utf8');
    const found = new Set();
    // Newlines are excluded from both halves on purpose. Without that, a match
    // can begin at the CLOSING backtick of an inline code span further up the
    // document and run across several lines to the next `#`, swallowing the
    // real anchor that followed it. Two anchors went missing that way, the
    // scratch copy came up short, and the baseline went red for a reason that
    // had nothing to do with any of the cases below.
    for (const m of text.matchAll(/`([^`#\n]+)#[^`\n]+`/g)) {
      found.add(m[1].split('/').join(sepOf()));
    }
    return [...found];
  } catch {
    return [];
  }
}
function sepOf() {
  return join('a', 'b').slice(1, 2);
}

function freshCopy() {
  const dir = mkdtempSync(join(tmpdir(), 'inv-guard-'));
  for (const rel of [...new Set([...NEEDED, ...anchorFiles()])]) {
    const src = join(ROOT, rel);
    if (!existsSync(src)) continue;
    const dst = join(dir, rel);
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(src, dst);
  }
  return dir;
}

function runGuard(dir) {
  try {
    execFileSync(process.execPath, [join(dir, 'scripts', 'check-inventory.mjs'), '--quiet'], {
      cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    });
    return { red: false, output: '' };
  } catch (e) {
    return { red: true, output: String(e.stderr || e.stdout || '') };
  }
}

function edit(dir, rel, fn) {
  const p = join(dir, rel);
  const before = readFileSync(p, 'utf8');
  const after = fn(before);
  if (after === before) throw new Error('mutation for ' + rel + ' changed nothing — the case is not testing what it claims');
  writeFileSync(p, after);
}

/**
 * Rewrites one cell of one inventory row, addressed by row id and column.
 *
 * Cases used to match on literal row text, which meant that changing a
 * feature's status in the normal course of work broke the case rather than the
 * guard — the mutation silently became a no-op. Addressing cells by position
 * survives a status change, which is the whole point of a regression suite that
 * is supposed to outlive the tree it tests.
 */
const COL = { id: 0, feature: 1, site: 2, app: 3, anchor: 4, docs: 5 };

/** The file one row's anchor points at, as a path relative to the tree. */
function anchorPathFor(dir, rowId) {
  const text = readFileSync(join(dir, 'INVENTORY.md'), 'utf8');
  for (const line of text.split(NL)) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    const cells = t.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 6 || cells[0] !== rowId) continue;
    const anchor = cells[4].replace(/`/g, '');
    const hash = anchor.indexOf('#');
    if (hash === -1) return null;
    return anchor.slice(0, hash).split('/').join(sepOf());
  }
  return null;
}

function setCell(dir, rowId, column, value) {
  edit(dir, 'INVENTORY.md', (s) => s.split(NL).map((line) => {
    const t = line.trim();
    if (!t.startsWith('|')) return line;
    const cells = t.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 6 || cells[COL.id] !== rowId) return line;
    cells[COL[column]] = value;
    return '| ' + cells.join(' | ') + ' |';
  }).join(NL));
}

const CASES = [
  {
    name: 'a feature is removed from the inventory but stays in the catalogue',
    apply: (dir) => edit(dir, 'INVENTORY.md', (s) =>
      s.split(NL).filter((l) => !l.trim().startsWith('| palette |')).join(NL))
  },
  {
    name: 'an inventory row names a feature that no longer exists',
    apply: (dir) => edit(dir, 'INVENTORY.md', (s) =>
      s.replace('| palette | Command palette', '| palette-gone | Command palette'))
  },
  {
    name: 'a shipped implementation is renamed without updating the inventory',
    apply: (dir) => edit(dir, join('docs', 'assets', 'js', 'regex.js'), (s) =>
      s.replace('export function searchField', 'export function searchFieldRenamed'))
  },
  {
    name: 'a shipped implementation file is deleted',
    // The path is read from the inventory rather than written here. An earlier
    // version named docs/assets/js/palette.js directly, and when the palette's
    // anchor moved to palette-core.js the case went on deleting a file no row
    // pointed at any more — passing silently while testing nothing.
    apply: (dir) => {
      const path = anchorPathFor(dir, 'palette');
      if (!path) throw new Error('no anchor path for the palette row');
      rmSync(join(dir, path));
    }
  },
  {
    name: 'a shipped claim loses its anchor',
    apply: (dir) => setCell(dir, 'notify', 'anchor', '—')
  },
  {
    name: 'a planned row quietly gains an anchor it cannot back up',
    apply: (dir) => setCell(dir, 'ladder', 'anchor', '`docs/assets/js/ui.js#notify`')
  },
  {
    name: 'an inventory row overstates what the desktop application does',
    apply: (dir) => setCell(dir, 'ladder', 'app', 'shipped')
  },
  {
    name: 'the page claims a feature is shipped while the inventory says planned',
    apply: (dir) => edit(dir, join('docs', 'assets', 'js', 'content.js'), (s) =>
      s.replace("icon: 'unlock', site: 'planned', app: 'planned'", "icon: 'unlock', site: 'shipped', app: 'planned'"))
  },
  {
    name: 'the inventory table is emptied entirely',
    apply: (dir) => edit(dir, 'INVENTORY.md', (s) =>
      s.split(NL).filter((l) => !/^\|\s*[a-z0-9-]+\s*\|/.test(l.trim())).join(NL))
  }
];

let passed = 0;
const problems = [];

// Baseline: the untouched copy must be green, or every red below proves nothing.
const base = freshCopy();
const baseline = runGuard(base);
rmSync(base, { recursive: true, force: true });

if (baseline.red) {
  console.error('FAIL: the guard is already red on an unmodified tree, so no negative case below can mean anything.');
  console.error(baseline.output.split(NL).slice(0, 8).join(NL));
  process.exit(1);
}
console.log('baseline   GREEN  (unmodified tree passes)');

for (const c of CASES) {
  const dir = freshCopy();
  try {
    c.apply(dir);
    const r = runGuard(dir);
    if (r.red) {
      console.log('turns red  ' + c.name);
      passed++;
    } else {
      console.log('STILL GREEN ' + c.name);
      problems.push(c.name);
    }
  } catch (e) {
    console.log('BROKEN CASE ' + c.name + ' — ' + e.message);
    problems.push(c.name + ' (case itself failed)');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Restoring must return it to green, so the guard is not simply always red.
const restored = freshCopy();
const after = runGuard(restored);
rmSync(restored, { recursive: true, force: true });
if (after.red) {
  problems.push('a restored copy is still red — the guard fails regardless of the tree');
} else {
  console.log('restored   GREEN  (guard is not simply always red)');
}

console.log('');
if (problems.length) {
  console.error(problems.length + ' of ' + CASES.length + ' negative cases did not behave:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}

console.log(passed + '/' + CASES.length + ' negative cases turned the guard red, and it went green again when restored.');
process.exit(0);
