#!/usr/bin/env node
// Guards one specific, genuinely nasty mistake.
//
// `Element.append()` stringifies anything that is not a Node, so a conditional
// child written as `cond ? el : null` appends a text node reading "null" when
// the condition is false. It renders as the literal word on screen, and because
// a text node is not an element it does not appear in `children`, in
// `querySelector`, or in anything else you would inspect while trying to work
// out where the word came from.
//
// It shipped once here — under "System memory" on the Ollama page, next to a
// perfectly correct figure — and cost a round of DOM inspection to find. This
// makes it a build failure instead.
//
// The fix in every case is `add(parent, ...)` from dom.js, which filters.
//
//   node scripts/test-dom-safety.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const NL = String.fromCharCode(10);
const ROOTS = [join(ROOT, 'app', 'js'), join(ROOT, 'docs', 'assets', 'js')];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

const files = ROOTS.filter((d) => { try { return statSync(d).isDirectory(); } catch { return false; } }).flatMap((d) => walk(d));

const problems = [];
let scanned = 0;
let callsChecked = 0;

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  scanned++;

  // Find `<something>.append(` and read its balanced argument list.
  const re = /([A-Za-z_$][\w$]*)\.append\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    let i = open;
    for (; i < src.length; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') { depth--; if (depth === 0) break; }
    }
    const args = src.slice(open + 1, i);
    callsChecked++;
    // Both branches of a ternary count. An earlier version only looked for
    // `: null` and sailed straight past `cond ? null : el`, which is the same
    // bug written the other way round — and one of those had already been
    // committed by the time this was noticed.
    if (/[?:]\s*(null|undefined)\b/.test(args)) {
      const line = src.slice(0, m.index).split(NL).length;
      problems.push({
        file: relative(ROOT, file),
        line,
        target: m[1],
        snippet: args.replace(/\s+/g, ' ').slice(0, 90)
      });
    }
  }
}

console.log('scanned ' + scanned + ' modules, ' + callsChecked + ' append() call sites');

if (problems.length) {
  console.error('');
  for (const p of problems) {
    console.error('FAIL: ' + p.file + ':' + p.line + ' — ' + p.target + '.append(...) can receive null.');
    console.error('      ' + p.snippet + (p.snippet.length >= 90 ? '…' : ''));
    console.error('      Use add(' + p.target + ', ...) from dom.js, which skips falsy children.');
  }
  console.error('');
  console.error(problems.length + ' unsafe append(s). Each one renders the literal word "null" on screen.');
  process.exit(1);
}

// The helper this guard points people at has to actually exist and actually
// filter, or the advice above is worse than useless.
const domSrc = readFileSync(join(ROOT, 'docs', 'assets', 'js', 'dom.js'), 'utf8');
if (!/export function add\(/.test(domSrc)) {
  console.error('FAIL: dom.js has no `add` helper, but this guard tells people to use it.');
  process.exit(1);
}
if (!/c === null \|\| c === undefined \|\| c === false/.test(domSrc)) {
  console.error('FAIL: dom.js `add` no longer filters null/undefined/false, so it does not fix what this guard is about.');
  process.exit(1);
}

console.log('No append() call site can receive a conditional null, and dom.js still filters.');
process.exit(0);
