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

import {
	mkdtempSync,
	cpSync,
	readFileSync,
	writeFileSync,
	rmSync,
	existsSync,
	mkdirSync
} from 'node:fs';
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
			cwd: dir,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe']
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
	if (after === before)
		throw new Error(
			'mutation for ' + rel + ' changed nothing — the case is not testing what it claims'
		);
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

/**
 * Finds a row matching a predicate.
 *
 * Cases used to name a feature directly — `ladder`, `notify`, `palette` — and
 * every one of them went stale the moment that feature's status changed,
 * turning the case into a silent no-op. A regression suite that breaks when the
 * project makes progress is worse than none, because it trains people to ignore
 * it. Cases now describe the SHAPE of row they need and take whichever one fits.
 */
function findRow(dir, predicate) {
	const text = readFileSync(join(dir, 'INVENTORY.md'), 'utf8');
	for (const line of text.split(NL)) {
		const t = line.trim();
		if (!t.startsWith('|')) continue;
		const cells = t
			.split('|')
			.slice(1, -1)
			.map((c) => c.trim());
		if (cells.length < 6) continue;
		const row = {
			id: cells[0],
			feature: cells[1],
			site: cells[2],
			app: cells[3],
			anchor: cells[4]
		};
		if (!['shipped', 'partial', 'planned', 'na'].includes(row.site)) continue;
		if (predicate(row)) return row;
	}
	return null;
}

/** Whether a table line is the row for this id, whatever the column padding. */
function isRowFor(line, id) {
	const t = line.trim();
	if (!t.startsWith('|')) return false;
	const cells = t.split('|').slice(1, -1).map((c) => c.trim());
	return cells.length >= 6 && cells[0] === id;
}

const hasAnchor = (r) => r.anchor && r.anchor !== '—' && r.anchor !== '-';

/**
 * A row that is not built on either surface, so an anchor on it is fiction.
 *
 * If the project has none left, one is ADDED to the scratch copy rather than
 * the case giving up. Three cases used to require a real unbuilt row and began
 * failing the moment the last planned feature shipped — the suite breaking
 * because the project finished, which is the worst possible time to lose it.
 *
 * The synthetic row is added to the catalogue as well as the inventory, so the
 * baseline stays green and each case still measures its own mutation rather
 * than the inconsistency the fixture introduced.
 */
const SYNTHETIC_ID = 'guard-fixture-unbuilt';

function unbuiltRow(dir) {
	const found = findRow(dir, (x) => x.site === 'planned' && x.app === 'planned' && !hasAnchor(x));
	if (found) return found;

	const catalogue = join(dir, 'docs', 'assets', 'js', 'content.js');
	const text = readFileSync(catalogue, 'utf8');
	const entry = [
		'  {',
		"    id: '" + SYNTHETIC_ID + "', name: 'A feature that is not built', group: 'Tools',",
		"    icon: 'info', site: 'planned', app: 'planned',",
		"    blurb: 'Added by the negative regression when the project has no unbuilt feature left.',",
		"    detail: 'This exists only inside a scratch copy of the tree, so that the cases which need an unbuilt row keep working once everything real has shipped.',",
		"    verify: 'It is never present in the repository itself.'",
		'  },'
	].join(NL);
	const marker = 'export const FEATURES = [' + NL;
	if (!text.includes(marker))
		throw new Error('the catalogue no longer starts the way this fixture expects');
	writeFileSync(catalogue, text.replace(marker, marker + entry + NL));

	const inventoryPath = join(dir, 'INVENTORY.md');
	const inventory = readFileSync(inventoryPath, 'utf8');
	const lines = inventory.split(NL);
	const lastRow = lines
		.map((l, i) => ({ l, i }))
		.filter((x) => /^\|\s*[a-z0-9-]+\s*\|/.test(x.l.trim()))
		.pop();
	if (!lastRow) throw new Error('no inventory rows to insert alongside');
	lines.splice(
		lastRow.i + 1,
		0,
		'| ' + SYNTHETIC_ID + ' | A feature that is not built | planned | planned | — | content.js |'
	);
	writeFileSync(inventoryPath, lines.join(NL));

	const added = findRow(dir, (x) => x.id === SYNTHETIC_ID);
	if (!added) throw new Error('the synthetic unbuilt row did not take');

	// The scratch copy must still be green with the row added, or every case
	// built on it would go red for the fixture rather than for its mutation.
	const still = runGuard(dir);
	if (still.red) {
		throw new Error(
			'adding a synthetic unbuilt row turned the guard red by itself: ' +
				still.output.split(NL).slice(0, 2).join(' ')
		);
	}
	return added;
}

/** A row that IS built, so its anchor must resolve. */
function builtRow(dir) {
	const r = findRow(dir, (x) => (x.site === 'shipped' || x.app === 'shipped') && hasAnchor(x));
	if (!r) throw new Error('no built row in the inventory to test with');
	return r;
}

/** The file one row's anchor points at, as a path relative to the tree. */
function anchorPathFor(dir, rowId) {
	const text = readFileSync(join(dir, 'INVENTORY.md'), 'utf8');
	for (const line of text.split(NL)) {
		const t = line.trim();
		if (!t.startsWith('|')) continue;
		const cells = t
			.split('|')
			.slice(1, -1)
			.map((c) => c.trim());
		if (cells.length < 6 || cells[0] !== rowId) continue;
		const anchor = cells[4].replace(/`/g, '');
		const hash = anchor.indexOf('#');
		if (hash === -1) return null;
		return anchor.slice(0, hash).split('/').join(sepOf());
	}
	return null;
}

function setCell(dir, rowId, column, value) {
	edit(dir, 'INVENTORY.md', (s) =>
		s
			.split(NL)
			.map((line) => {
				const t = line.trim();
				if (!t.startsWith('|')) return line;
				const cells = t
					.split('|')
					.slice(1, -1)
					.map((c) => c.trim());
				if (cells.length < 6 || cells[COL.id] !== rowId) return line;
				cells[COL[column]] = value;
				return '| ' + cells.join(' | ') + ' |';
			})
			.join(NL)
	);
}

const CASES = [
	{
		name: 'a feature is removed from the inventory but stays in the catalogue',
		// Addressed by SHAPE, not by literal row text. These two cases matched
		// '| palette |' and stopped matching anything the day a formatter padded
		// the table's columns — the mutation became a silent no-op and the case
		// reported itself broken rather than the guard.
		apply: (dir) => {
			const row = builtRow(dir);
			edit(dir, 'INVENTORY.md', (s) =>
				s
					.split(NL)
					.filter((l) => !isRowFor(l, row.id))
					.join(NL)
			);
		}
	},
	{
		name: 'an inventory row names a feature that no longer exists',
		apply: (dir) => {
			const row = builtRow(dir);
			setCell(dir, row.id, 'id', row.id + '-gone');
		}
	},
	{
		name: 'a shipped implementation is renamed without updating the inventory',
		apply: (dir) =>
			edit(dir, join('docs', 'assets', 'js', 'regex.js'), (s) =>
				s.replace('export function searchField', 'export function searchFieldRenamed')
			)
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
		apply: (dir) => setCell(dir, builtRow(dir).id, 'anchor', '—')
	},
	{
		name: 'a planned row quietly gains an anchor it cannot back up',
		apply: (dir) =>
			setCell(dir, unbuiltRow(dir).id, 'anchor', '`docs/assets/js/ui.js#export function notify`')
	},
	{
		name: 'an inventory row overstates what the desktop application does',
		apply: (dir) => setCell(dir, unbuiltRow(dir).id, 'app', 'shipped')
	},
	{
		name: 'the page claims a feature is shipped while the inventory says planned',
		apply: (dir) => {
			const row = unbuiltRow(dir);
			edit(dir, join('docs', 'assets', 'js', 'content.js'), (src) => {
				// The dotAll flag rather than a [\s\S] class: inside a double-quoted JS
				// string "\s" is just "s", so the class silently collapses to [sS] and
				// matches nothing across a line break. The flag needs no escaping and
				// cannot lose a level the same way.
				const re = new RegExp("(id: '" + row.id + "',.*?site: ')planned(', app: ')planned(')", 's');
				return src.replace(re, '$1shipped$2planned$3');
			});
		}
	},
	{
		name: 'the inventory table is emptied entirely',
		apply: (dir) =>
			edit(dir, 'INVENTORY.md', (s) =>
				s
					.split(NL)
					.filter((l) => !/^\|\s*[a-z0-9-]+\s*\|/.test(l.trim()))
					.join(NL)
			)
	}
];

let passed = 0;
const problems = [];

// Baseline: the untouched copy must be green, or every red below proves nothing.
const base = freshCopy();
const baseline = runGuard(base);
rmSync(base, { recursive: true, force: true });

if (baseline.red) {
	console.error(
		'FAIL: the guard is already red on an unmodified tree, so no negative case below can mean anything.'
	);
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

console.log(
	passed +
		'/' +
		CASES.length +
		' negative cases turned the guard red, and it went green again when restored.'
);
process.exit(0);
