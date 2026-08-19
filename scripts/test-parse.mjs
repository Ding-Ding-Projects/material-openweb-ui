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

// Parsing is not enough. A module with a wrong relative import parses
// perfectly and then 404s at load, taking the whole page down with it — which
// is exactly what `../state.js` did when it should have been `./state.js`.
// Nothing resolves these paths until a browser tries to, so they are resolved
// here instead.
let imports = 0;
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const dir = join(file, '..');
  const specifiers = new Set();

  for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)[^'"\n]*from\s*['"]([^'"]+)['"]/g)) specifiers.add(m[1]);
  for (const m of src.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) specifiers.add(m[1]);
  for (const m of src.matchAll(/(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g)) specifiers.add(m[1]);

  for (const spec of specifiers) {
    if (!spec.startsWith('.')) continue; // bare specifiers are not ours to resolve
    imports++;
    const target = join(dir, spec);
    if (!statSafe(target)) {
      failures.push({
        rel: relative(ROOT, file),
        kind: 'import',
        reason: 'imports "' + spec + '", which resolves to ' + relative(ROOT, target) + ' and does not exist',
        detail: 'A wrong relative path parses fine and then 404s at load, taking the page with it.'
      });
    }
  }
}

function statSafe(p) {
  try { return statSync(p).isFile(); } catch { return false; }
}

console.log('resolved ' + imports + ' relative imports');

if (failures.length) {
  console.error('');
  for (const f of failures) {
    console.error('FAIL: ' + f.rel + (f.kind === 'import' ? ' has an import that does not resolve.' : ' is not valid JavaScript.'));
    console.error('      ' + f.reason);
    console.error(f.detail.split('\n').map((l) => '      ' + l).join('\n'));
    console.error('');
  }
  const syntax = failures.filter((f) => f.kind === 'syntax').length;
  const unresolved = failures.filter((f) => f.kind === 'import').length;
  console.error(
    [syntax ? syntax + ' syntax error(s)' : null, unresolved ? unresolved + ' unresolvable import(s)' : null]
      .filter(Boolean).join(' and ') + '. Either one renders as a blank page.');
  process.exit(1);
}


// ---------------------------------------------------------------- stray bytes
//
// Files in this project are written through several layers of shell quoting,
// and that has twice turned an escape sequence into something else. Once it was
// harmless; once it put a literal BACKSPACE (0x08) into a regular expression
// where a word boundary was meant. The pattern then required an unprintable
// character before the word it was looking for, matched nothing at all, and the
// guard built on it reported green while checking nothing.
//
// What made that expensive was that reading the file back did not show it: a
// terminal renders 0x08 by deleting the character before it, so the line looked
// exactly right. Only a hex dump revealed it.
//
// So: no source file this project writes may contain a control character other
// than tab, newline and carriage return. Vendored upstream code is excluded,
// because a minified bundle legitimately carries such bytes inside strings and
// is not ours to change.

const OWN = ['docs', 'app', 'scripts', 'electron', '.github'];
const CHECKED = /\.(js|mjs|ts|css|html|json|md|yml|yaml|ps1|bat)$/;

function everyOwnFile(dir, found = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.git') continue;
    const p = join(dir, entry);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) everyOwnFile(p, found);
    else if (CHECKED.test(entry)) found.push(p);
  }
  return found;
}

const strays = [];
for (const dir of OWN) {
  for (const file of everyOwnFile(join(ROOT, dir))) {
    const text = readFileSync(file, 'utf8');
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) {
        const line = text.slice(0, i).split(String.fromCharCode(10)).length;
        strays.push(file.slice(ROOT.length + 1) + ' line ' + line +
          ': byte 0x' + code.toString(16).padStart(2, '0'));
        break;
      }
    }
  }
}

if (strays.length) {
  console.error('');
  console.error('A control character survived into source, where it is invisible on screen:');
  for (const s of strays) console.error('  ' + s);
  console.error('This is how an escape sequence collapses into something that looks correct');
  console.error('and behaves differently. Rewrite the line, building any backslash rather');
  console.error('than typing it through a shell.');
  process.exit(1);
}
console.log('No stray control character in any file this project writes.');

console.log('Every shipped module parses and every relative import resolves.');
process.exit(0);
