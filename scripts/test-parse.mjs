#!/usr/bin/env node
// Parses every module that ships untranspiled.
//
// Both the documentation site and the desktop frontend are served as raw ES
// modules with no build step, so nothing sits between a syntax error and the
// reader: the page simply does not render. There is no bundler to fail first.
//
// This exists because one did ship. An apostrophe inside a single-quoted string
// — "the daemon's own timings" — broke the site's feature catalogue, and it got
// past the local gates because they checked inventories and behaviour but never
// asked whether the files were still valid JavaScript. CI caught it after the
// deploy. This moves that check to where it belongs.
//
//   node scripts/test-parse.mjs

import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const ROOTS = [
  join(ROOT, 'docs', 'assets', 'js'),
  join(ROOT, 'app', 'js')
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

const files = ROOTS
  .filter((d) => { try { return statSync(d).isDirectory(); } catch { return false; } })
  .flatMap((d) => walk(d));

if (!files.length) {
  console.error('FAIL: no modules found to parse. The layout changed and this guard is checking nothing.');
  process.exit(1);
}

const failures = [];

for (const file of files) {
  const rel = relative(ROOT, file);
  try {
    execFileSync(process.execPath, ['--input-type=module', '--check'], {
      input: readFileSync(file, 'utf8'),
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch (e) {
    const out = String(e.stderr || e.stdout || e.message);
    // Keep the line that names the problem, not the whole node stack.
    const reason = out.split('\n').find((l) => /Error/.test(l)) || out.split('\n')[0];
    failures.push({ rel, reason: reason.trim(), detail: out.split('\n').slice(0, 4).join('\n') });
  }
}

console.log('parsed ' + files.length + ' shipped modules');

if (failures.length) {
  console.error('');
  for (const f of failures) {
    console.error('FAIL: ' + f.rel + ' is not valid JavaScript.');
    console.error('      ' + f.reason);
    console.error(f.detail.split('\n').map((l) => '      ' + l).join('\n'));
    console.error('');
  }
  console.error(failures.length + ' module(s) would render as a blank page.');
  process.exit(1);
}

console.log('Every shipped module is valid JavaScript.');
process.exit(0);
