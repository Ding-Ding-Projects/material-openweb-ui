#!/usr/bin/env node
// Every changelog entry names the commit it shipped in, and that commit exists.
//
// A changelog is the one document nobody checks, because checking it means
// remembering what happened — which is the thing the changelog was supposed to
// do. So each entry carries a commit and the commit is resolved against the
// repository. An entry naming a commit that does not exist is a build failure
// rather than a documentation slip: it means either the entry describes work
// that was never committed, or the commit was rewritten and the entry now
// points at nothing.
//
//   node scripts/test-changelog.mjs

import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = process.cwd();
const { CHANGELOG } = await import(
	pathToFileURL(join(ROOT, 'docs', 'assets', 'js', 'content.js')).href
);

let failures = 0;
function check(name, ok, detail = '') {
	if (ok) console.log('  pass  ' + name);
	else {
		console.error('  FAIL  ' + name + (detail ? ' — ' + detail : ''));
		failures++;
	}
}

// ---------- shape ----------

console.log('shape');

check('there is a changelog', Array.isArray(CHANGELOG) && CHANGELOG.length > 0);
check(
	'every release has a version',
	CHANGELOG.every((v) => typeof v.version === 'string' && v.version)
);
check(
	'every release has a date in ISO form',
	CHANGELOG.every((v) => /^\d{4}-\d{2}-\d{2}$/.test(v.date)),
	CHANGELOG.filter((v) => !/^\d{4}-\d{2}-\d{2}$/.test(v.date))
		.map((v) => v.version)
		.join(',')
);
check(
	'releases are newest first, so the top of the page is the current one',
	CHANGELOG.every((v, i) => i === 0 || CHANGELOG[i - 1].date >= v.date),
	CHANGELOG.map((v) => v.version + '@' + v.date).join(' ')
);
check(
	'every release has at least one section',
	CHANGELOG.every((v) => v.sections && v.sections.length)
);
check(
	'every section has at least one item',
	CHANGELOG.every((v) => v.sections.every((s) => s.items && s.items.length))
);
check(
	'every item has text',
	CHANGELOG.every((v) =>
		v.sections.every((s) => s.items.every((i) => i.text && i.text.length > 10))
	)
);

const versions = CHANGELOG.map((v) => v.version);
check('no version appears twice', new Set(versions).size === versions.length, versions.join(','));

// ---------- the commits ----------

console.log('');
console.log('the commits');

// The section travels WITH the item. An earlier version rebuilt each item with
// a spread and then looked its section up by reference, which could never match
// — so every entry reported "unknown section" and three checks failed for a
// reason that had nothing to do with the changelog.
const items = CHANGELOG.flatMap((v) =>
	v.sections.flatMap((s) => s.items.map((i) => ({ ...i, version: v.version, section: s.title })))
);
const withSha = items.filter((i) => i.sha);
const withoutSha = items.filter((i) => !i.sha);

check('there are entries to check', items.length > 0, String(items.length) + ' entries');
check(
	'most entries name a commit',
	withSha.length > withoutSha.length,
	withSha.length + ' with a commit, ' + withoutSha.length + ' without'
);

// The ones without a commit are notes rather than changes, and they have to be
// in a section that says so — otherwise "no commit" becomes a way to add a
// claim about the code that nothing backs up.
for (const item of withoutSha) {
	check(
		'an entry with no commit is a note rather than a change: "' + item.text.slice(0, 46) + '…"',
		/note/i.test(item.section || ''),
		item.section || 'no section recorded'
	);
}

let repo = true;
try {
	execFileSync('git', ['rev-parse', '--git-dir'], { cwd: ROOT, stdio: 'ignore' });
} catch {
	repo = false;
}

if (!repo) {
	// Said out loud rather than skipped in silence: a gate that quietly does
	// nothing outside a repository is a gate that quietly does nothing.
	console.log('  note  not a git repository here, so the commits cannot be resolved');
	check('this check ran somewhere it could resolve commits', false, 'run it inside the repository');
} else {
	const bad = [];
	for (const item of withSha) {
		try {
			const type = execFileSync('git', ['cat-file', '-t', item.sha], {
				cwd: ROOT,
				encoding: 'utf8'
			}).trim();
			if (type !== 'commit') bad.push(item.sha + ' is a ' + type + ', not a commit');
		} catch {
			bad.push(
				item.sha + ' (' + item.version + ': ' + item.text.slice(0, 40) + '…) does not resolve'
			);
		}
	}
	for (const b of bad) console.error('  FAIL  ' + b);
	failures += bad.length;
	check(
		'every commit named by the changelog exists in this repository',
		bad.length === 0,
		String(withSha.length) + ' checked'
	);

	// A commit that resolves but is not an ancestor of HEAD describes work that
	// is not in this branch, which is a different kind of wrong from a typo.
	const unreachable = [];
	for (const item of withSha) {
		try {
			execFileSync('git', ['merge-base', '--is-ancestor', item.sha, 'HEAD'], {
				cwd: ROOT,
				stdio: 'ignore'
			});
		} catch {
			unreachable.push(item.sha);
		}
	}
	check(
		'every commit named is actually reachable from this branch',
		unreachable.length === 0,
		unreachable.join(', ')
	);
}

console.log('');
if (failures) {
	console.error(
		failures +
			' check(s) failed. A changelog nobody can verify is a changelog nobody should believe.'
	);
	process.exit(1);
}
console.log('Every changelog entry names a commit, and every commit resolves in this repository.');
process.exit(0);
