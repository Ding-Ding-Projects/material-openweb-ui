#!/usr/bin/env node
// Every export format, against the values that break naive writers.
//
// An export that opens without complaint is not an export that is correct. The
// failures worth catching all look like success:
//
//   - a CSV field containing a comma or a quote, which opens perfectly and puts
//     half the field in the next column;
//   - a field beginning with `=`, which every major spreadsheet executes as a
//     formula the moment the file is opened;
//   - an unescaped ampersand in XML, which is not a parse warning but a
//     document no parser will read;
//   - the bare word `no` in YAML, which comes back as the boolean false;
//   - `007` in YAML, which comes back as the number 7.
//
// Where a reader exists, the writer is checked by reading its own output back
// rather than against an expected string — the only way to catch quoting that
// is nearly right.
//
//   node scripts/test-formats.mjs

import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const F = await import(pathToFileURL(join(process.cwd(), 'docs', 'assets', 'js', 'formats.js')).href);

let failures = 0;
function check(name, ok, detail = '') {
  if (ok) console.log('  pass  ' + name);
  else { console.error('  FAIL  ' + name + (detail ? ' — ' + detail : '')); failures++; }
}

const NL = String.fromCharCode(10);

// Every value here has broken a real implementation.
const AWKWARD = [
  {
    id: 'a1',
    plain: 'ordinary',
    comma: 'one, two, three',
    quote: 'he said "hello"',
    newline: 'first' + NL + 'second',
    ampersand: 'https://example.test/?a=1&b=2',
    formula: '=SUM(A1:A9)',
    tab: 'before\tafter',
    pipe: 'left | right'
  },
  {
    id: 'a2',
    plain: 'no',
    comma: '',
    quote: "it's",
    newline: '007',
    ampersand: '<script>alert(1)</script>',
    formula: '@echo',
    tab: 'true',
    pipe: '- leading dash'
  }
];

const SIMPLE = [
  { name: 'Chat', count: 4 },
  { name: 'Ollama', count: 12 }
];

// ---------- every format writes something ----------

console.log('every format writes');

check('every format in the list has a writer',
  F.FORMATS.every((f) => { try { F.serialise(SIMPLE, f.id); return true; } catch { return false; } }),
  F.FORMATS.filter((f) => { try { F.serialise(SIMPLE, f.id); return false; } catch { return true; } }).map((f) => f.id).join(','));
check('the contract\'s nine formats are all present',
  ['json', 'jsonl', 'yaml', 'toml', 'xml', 'csv', 'tsv', 'markdown', 'html']
    .every((id) => F.FORMATS.some((f) => f.id === id)));
check('an unknown format is refused rather than silently producing JSON', (() => {
  try { F.serialise(SIMPLE, 'parquet'); return false; } catch { return true; }
})());
check('something that is not a list is refused', (() => {
  try { F.serialise({ not: 'a list' }, 'json'); return false; } catch { return true; }
})());
check('an empty list produces a valid document in every format',
  F.FORMATS.every((f) => typeof F.serialise([], f.id) === 'string'));

// ---------- JSON family ----------

console.log('');
console.log('JSON and JSON Lines');

check('JSON round-trips every awkward value exactly',
  JSON.stringify(JSON.parse(F.toJson(AWKWARD))) === JSON.stringify(AWKWARD));
check('JSON Lines has one record per line', F.toJsonLines(AWKWARD).trim().split(NL).length === 2);
check('JSON Lines round-trips every awkward value exactly',
  JSON.stringify(F.toJsonLines(AWKWARD).trim().split(NL).map((l) => JSON.parse(l))) === JSON.stringify(AWKWARD));
check('a newline inside a value does not become a record boundary',
  F.toJsonLines(AWKWARD).trim().split(NL).length === AWKWARD.length,
  String(F.toJsonLines(AWKWARD).trim().split(NL).length));

// ---------- CSV and TSV, read back ----------

console.log('');
console.log('CSV and TSV, read back by a parser');

for (const [name, write, delimiter] of [['CSV', F.toCsv, ','], ['TSV', F.toTsv, '\t']]) {
  const text = write(AWKWARD);
  const back = F.parseDelimited(text, delimiter);
  check(name + ' produces one row per record', back.length === AWKWARD.length, String(back.length));
  check(name + ' survives a field containing the delimiter',
    back[0] && back[0].comma === AWKWARD[0].comma, back[0] && JSON.stringify(back[0].comma));
  check(name + ' survives a field containing a quote',
    back[0] && back[0].quote === AWKWARD[0].quote, back[0] && JSON.stringify(back[0].quote));
  check(name + ' survives a field containing a line break',
    back[0] && back[0].newline === AWKWARD[0].newline, back[0] && JSON.stringify(back[0].newline));
  check(name + ' keeps an empty field empty rather than dropping the column',
    back[1] && back[1].comma === '', back[1] && JSON.stringify(back[1].comma));
  check(name + ' keeps every column',
    back[0] && Object.keys(back[0]).length === Object.keys(AWKWARD[0]).length,
    back[0] && String(Object.keys(back[0]).length));
}

check('a field beginning with = is neutralised so a spreadsheet cannot run it',
  F.delimitedField('=SUM(A1:A9)', ',').startsWith("'"), F.delimitedField('=SUM(A1:A9)', ','));
check('so is one beginning with @', F.delimitedField('@echo', ',').startsWith("'"));
check('so is one beginning with +', F.delimitedField('+1', ',').startsWith("'"));
check('so is one beginning with -', F.delimitedField('-1', ',').startsWith("'"));
check('an ordinary value is left completely alone',
  F.delimitedField('ordinary', ',') === 'ordinary');
check('CSV uses CRLF line endings, as RFC 4180 specifies',
  F.toCsv(SIMPLE).includes('\r\n'));

// ---------- XML, read back by a real parser where available ----------

console.log('');
console.log('XML');

const xml = F.toXml(AWKWARD);
check('XML declares its encoding', xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
check('an ampersand is escaped', xml.includes('&amp;') && !/&(?!amp;|lt;|gt;|quot;|apos;)/.test(xml));
check('angle brackets in a value are escaped, so they cannot become markup',
  xml.includes('&lt;script&gt;') && !xml.includes('<script>'));
check('every record is present', (xml.match(/<record>/g) || []).length === AWKWARD.length);
check('a value containing a newline survives',
  xml.includes('first' + NL + 'second'));

// A stricter check: the document parses, using whatever the platform provides.
let xmlParsed = null;
try {
  const { DOMParser } = await import('node:util').then(() => ({ DOMParser: globalThis.DOMParser }));
  if (DOMParser) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    xmlParsed = !doc.querySelector('parsererror');
  }
} catch {
  xmlParsed = null;
}
if (xmlParsed === null) {
  // No parser here. Rather than skip silently, assert the property that
  // matters — that nothing outside an entity can start one.
  check('no unescaped entity start survives anywhere in the document (no parser available to confirm)',
    !/&(?!(amp|lt|gt|quot|apos);)/.test(xml));
} else {
  check('the document parses', xmlParsed === true);
}

// ---------- YAML ----------

console.log('');
console.log('YAML');

const yaml = F.toYaml(AWKWARD);
check('the word "no" is quoted, or it comes back as the boolean false',
  /plain: "no"/.test(yaml), yaml.split(NL).find((l) => l.includes('plain:')));
check('a digit string with a leading zero is quoted, or it loses the zero',
  /newline: "007"/.test(yaml), yaml.split(NL).find((l) => l.includes('newline: 0')));
check('a value starting with a dash is quoted, or it becomes a list item',
  /pipe: "- leading dash"/.test(yaml), yaml.split(NL).find((l) => l.includes('pipe:')));
check('a value containing a newline is quoted with the break escaped',
  /newline: "first\\nsecond"/.test(yaml), yaml.split(NL).find((l) => l.includes('first')));
check('an ordinary word is left unquoted', /plain: ordinary/.test(yaml));
check('a number stays a number', F.toYaml(SIMPLE).includes('count: 4'));
check('each record starts a list item', (yaml.match(/^- /gm) || []).length === AWKWARD.length);
check('an empty list is an empty list, not an empty document', F.toYaml([]).trim() === '[]');

// ---------- TOML ----------

console.log('');
console.log('TOML');

const toml = F.toToml(AWKWARD);
check('each record is an array-of-tables entry',
  (toml.match(/^\[\[record\]\]$/gm) || []).length === AWKWARD.length);
check('a quote inside a value is escaped', toml.includes('\\"hello\\"'));
check('a newline inside a value is escaped rather than breaking the line',
  toml.includes('first\\nsecond'), toml.split(NL).find((l) => l.includes('first')));
check('a number is written unquoted', F.toToml(SIMPLE).includes('count = 4'));
check('a boolean is written unquoted', F.toToml([{ on: true }]).includes('on = true'));

// ---------- Markdown ----------

console.log('');
console.log('Markdown');

const md = F.toMarkdown(AWKWARD);
const mdLines = md.trim().split(NL);
check('there is a header row and a separator row', mdLines.length === AWKWARD.length + 2, String(mdLines.length));
check('every row has the same number of cells', (() => {
  const counts = mdLines.map((l) => l.split(/(?<!\\)\|/).length);
  return counts.every((c) => c === counts[0]);
})(), mdLines.map((l) => l.split(/(?<!\\)\|/).length).join(','));
check('a pipe inside a value is escaped, or it silently shifts every column',
  md.includes('left \\| right'), mdLines.find((l) => l.includes('right')));
check('a newline inside a value becomes a break rather than a new row',
  md.includes('first<br>second'));

// ---------- HTML ----------

console.log('');
console.log('HTML');

const html = F.toHtml(AWKWARD, { title: 'Tabs & records' });
check('the document has a doctype', html.startsWith('<!doctype html>'));
check('the title is escaped', html.includes('<title>Tabs &amp; records</title>'));
check('a script in a value cannot become a script in the page',
  html.includes('&lt;script&gt;') && !html.includes('<script>'));
check('there is a header cell per column',
  (html.match(/<th scope="col">/g) || []).length === Object.keys(AWKWARD[0]).length);
check('there is a row per record', (html.match(/<tr>/g) || []).length === AWKWARD.length + 1);
check('it fetches nothing from anywhere',
  !/https?:\/\//.test(html.replace(/&amp;/g, '&').replace(/https:\/\/example\.test[^<"]*/g, '')),
  'a self-contained export keeps working when it is moved');
check('it reads in both light and dark', html.includes('prefers-color-scheme:dark'));

// ---------- columns ----------

console.log('');
console.log('columns');

check('the column set is the union across every record, not just the first',
  F.columns([{ a: 1 }, { b: 2 }]).join(',') === 'a,b');
check('columns keep first-seen order', F.columns([{ z: 1, a: 2 }, { m: 3 }]).join(',') === 'z,a,m');
check('a record missing a column exports an empty cell, not a shifted row', (() => {
  const back = F.parseDelimited(F.toCsv([{ a: '1', b: '2' }, { a: '3' }]), ',');
  return back[1].a === '3' && back[1].b === '';
})());

// ---------- filenames ----------

console.log('');
console.log('filenames');

check('a filename gets the right extension', F.filenameFor('chats', 'markdown') === 'chats.md');
check('a filename with path separators is made safe',
  !F.filenameFor('../../etc/passwd', 'json').includes('/') &&
  !F.filenameFor('../../etc/passwd', 'json').includes('..'),
  F.filenameFor('../../etc/passwd', 'json'));
check('an empty base still produces a usable name', F.filenameFor('', 'csv') === 'export.csv');

console.log('');
if (failures) {
  console.error(failures + ' check(s) failed. Every one of these produces a file that opens without complaint.');
  process.exit(1);
}
console.log('Every format survives the values that break naive writers, and the delimited ones read back exactly.');
process.exit(0);
