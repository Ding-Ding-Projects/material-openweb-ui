#!/usr/bin/env node
// Prints the line-count table a release publishes.
//
// CI runs this over the tagged commit so the number in the release notes is
// produced by the same run that built the artifacts, at exactly the commit
// being released. A hand-typed count drifts from the tree the day after it is
// written; this one cannot.
//
//   node scripts/count-lines.mjs            # human table
//   node scripts/count-lines.mjs --json     # machine readable
//   node scripts/count-lines.mjs --markdown # release-notes table

import { readdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, extname, relative, sep } from 'node:path';

const ROOT = process.cwd();
const NL = String.fromCharCode(10);

// Directories that hold somebody else's lines, or no lines at all.
const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'build', 'dist', '.svelte-kit', '.venv', 'venv',
  '__pycache__', '.pytest_cache', '.mypy_cache', 'coverage', 'out'
]);

// design/ is a verbatim third-party export, and the vendored fonts are binary.
// Counting either would inflate the figure with lines nobody here wrote.
const SKIP_PATHS = [
  'design' + sep,
  'docs' + sep + 'assets' + sep + 'fonts' + sep
];

// Generated or machine-maintained files. A lockfile is a build artifact that
// happens to be committed; counting it says nothing about the project.
const SKIP_FILES = new Set([
  'package-lock.json', 'uv.lock', 'yarn.lock', 'pnpm-lock.yaml', 'poetry.lock'
]);

const GROUPS = [
  { name: 'Site (JavaScript)',  match: (p) => p.startsWith('docs' + sep) && extname(p) === '.js' },
  { name: 'Site (CSS)',         match: (p) => p.startsWith('docs' + sep) && extname(p) === '.css' },
  { name: 'Site (HTML)',        match: (p) => p.startsWith('docs' + sep) && extname(p) === '.html' },
  { name: 'Frontend (Svelte)',  match: (p) => p.startsWith('src' + sep) && extname(p) === '.svelte' },
  { name: 'Frontend (TS/JS)',   match: (p) => p.startsWith('src' + sep) && ['.ts', '.js'].includes(extname(p)) },
  { name: 'Desktop (Electron)', match: (p) => p.startsWith('electron' + sep) },
  { name: 'Backend (Python)',   match: (p) => p.startsWith('backend' + sep) && extname(p) === '.py' },
  { name: 'Scripts',            match: (p) => p.startsWith('scripts' + sep) },
  { name: 'Documentation',      match: (p) => extname(p) === '.md' }
];

const COUNTABLE = new Set(['.js', '.mjs', '.cjs', '.ts', '.svelte', '.css', '.html', '.py', '.md', '.bat', '.sh', '.json', '.yaml', '.yml']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name), out);
    } else if (entry.isFile()) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

function countLines(file) {
  try {
    const text = readFileSync(file, 'utf8');
    if (text.indexOf(String.fromCharCode(0)) !== -1) return null; // binary
    return text.length ? text.split(NL).length : 0;
  } catch {
    return null;
  }
}

const files = walk(ROOT)
  .map((f) => relative(ROOT, f))
  .filter((p) => !SKIP_PATHS.some((s) => p.startsWith(s)))
  .filter((p) => !SKIP_FILES.has(p.split(sep).pop()))
  .filter((p) => COUNTABLE.has(extname(p)));

const rows = new Map();
let total = 0;
let counted = 0;

for (const p of files) {
  const n = countLines(join(ROOT, p));
  if (n === null) continue;
  const group = GROUPS.find((g) => g.match(p));
  const name = group ? group.name : 'Other';
  const cur = rows.get(name) || { lines: 0, files: 0 };
  cur.lines += n;
  cur.files += 1;
  rows.set(name, cur);
  total += n;
  counted += 1;
}

// This repository is a fork, so the tree total is mostly somebody else's work.
// The number that says anything about THIS project is the delta against the
// commit the fork started from — so both are reported, and neither is passed
// off as the other.
function git(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function forkDelta() {
  const head = git('git rev-parse HEAD');

  // Preferred: the real merge base against upstream. CI fetches upstream, so
  // this is the branch that normally runs.
  let base = git('git merge-base HEAD upstream/main');

  // Without an upstream ref, merge-base against our own remote returns HEAD,
  // which would report a delta of zero and quietly claim this fork wrote
  // nothing. Fall back to the parent of the first commit authored here.
  if (!base || base === head) {
    const ours = git('git log --format=%H --author="Claude Fable 5" --reverse');
    const first = ours.split(NL).map((s) => s.trim()).filter(Boolean)[0];
    base = first ? git('git rev-parse ' + first + '~1') : '';
  }
  if (!base) return null;
  try {
    const stat = execSync('git diff --numstat ' + base + ' HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    let added = 0;
    let removed = 0;
    let changedFiles = 0;
    for (const line of stat.split(NL)) {
      if (!line.trim()) continue;
      const parts = line.split(String.fromCharCode(9));
      const a = parts[0];
      const r = parts[1];
      const f = parts[2];
      if (a === '-' || !f) continue; // binary file
      const norm = f.split('/').join(sep);
      if (SKIP_PATHS.some((s) => norm.startsWith(s))) continue;
      if (SKIP_FILES.has(norm.split(sep).pop())) continue;
      added += Number(a);
      removed += Number(r);
      changedFiles += 1;
    }
    return { base: base.slice(0, 9), added, removed, changedFiles };
  } catch {
    return null;
  }
}

const ordered = [...rows.entries()].sort((a, b) => b[1].lines - a[1].lines);
const payload = {
  total,
  files: counted,
  fork: forkDelta(),
  excluded: [
    'design/ (verbatim third-party design export)',
    'vendored font binaries',
    'lockfiles and other generated files',
    'dependency and build directories'
  ],
  groups: ordered.map(([name, v]) => ({ name, lines: v.lines, files: v.files }))
};

const arg = process.argv[2];

if (arg === '--json') {
  console.log(JSON.stringify(payload, null, 2));
} else if (arg === '--markdown') {
  const out = [];
  out.push('| Area | Files | Lines |');
  out.push('| --- | ---: | ---: |');
  for (const g of payload.groups) out.push('| ' + g.name + ' | ' + g.files + ' | ' + g.lines.toLocaleString('en-US') + ' |');
  out.push('| **Total** | **' + payload.files + '** | **' + payload.total.toLocaleString('en-US') + '** |');
  if (payload.fork) {
    out.push('');
    out.push('Written in this fork since `' + payload.fork.base + '`: **+' + payload.fork.added.toLocaleString('en-US')
      + ' / -' + payload.fork.removed.toLocaleString('en-US') + '** across ' + payload.fork.changedFiles
      + ' files. Everything else in the tree is upstream Open WebUI.');
  }
  out.push('');
  out.push('Counted by `node scripts/count-lines.mjs --markdown`. Excludes ' + payload.excluded.join(', ') + '.');
  console.log(out.join(NL));
} else {
  const w = Math.max(...payload.groups.map((g) => g.name.length), 5);
  for (const g of payload.groups) {
    console.log(g.name.padEnd(w) + '  ' + String(g.files).padStart(5) + ' files  ' + String(g.lines).padStart(8) + ' lines');
  }
  console.log('-'.repeat(w + 24));
  console.log('Total'.padEnd(w) + '  ' + String(payload.files).padStart(5) + ' files  ' + String(payload.total).padStart(8) + ' lines');
  if (payload.fork) {
    console.log('');
    console.log('Written in this fork since ' + payload.fork.base + ': +' + payload.fork.added
      + ' / -' + payload.fork.removed + ' across ' + payload.fork.changedFiles + ' files.');
    console.log('Everything else in the tree is upstream Open WebUI.');
  }
  console.log('');
  console.log('Excluded: ' + payload.excluded.join('; ') + '.');
}
