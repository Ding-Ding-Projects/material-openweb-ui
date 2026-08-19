// Serialising a record set into every format the contract asks for.
//
// The temptation with a list like this is to produce something that opens
// without error and call it done. A CSV whose quoting is nearly right opens
// perfectly in a spreadsheet and puts half a field in the wrong column; XML
// that does not escape an ampersand is not XML at all; YAML that does not quote
// the word `no` turns it into false on the way back in. Every one of those
// looks like a successful export.
//
// So each writer here is checked by reading its own output back where a reader
// exists, and against the specific values that are known to break naive
// implementations: a comma, a quote, a newline, an ampersand, a leading `=`,
// the word `no`, and a string of digits with a leading zero.

const NL = String.fromCharCode(10);

export const FORMATS = Object.freeze([
  { id: 'json', label: 'JSON', extension: 'json', mime: 'application/json' },
  { id: 'jsonl', label: 'JSON Lines', extension: 'jsonl', mime: 'application/x-ndjson' },
  { id: 'yaml', label: 'YAML', extension: 'yaml', mime: 'application/yaml' },
  { id: 'toml', label: 'TOML', extension: 'toml', mime: 'application/toml' },
  { id: 'xml', label: 'XML', extension: 'xml', mime: 'application/xml' },
  { id: 'csv', label: 'CSV', extension: 'csv', mime: 'text/csv' },
  { id: 'tsv', label: 'TSV', extension: 'tsv', mime: 'text/tab-separated-values' },
  { id: 'markdown', label: 'Markdown', extension: 'md', mime: 'text/markdown' },
  { id: 'html', label: 'HTML', extension: 'html', mime: 'text/html' }
]);

// ---------------------------------------------------------------- helpers

/** The union of every key across the rows, in first-seen order. */
export function columns(rows) {
  const seen = [];
  for (const row of rows) {
    for (const key of Object.keys(row || {})) if (!seen.includes(key)) seen.push(key);
  }
  return seen;
}

function scalar(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// ---------------------------------------------------------------- JSON family

export function toJson(rows) {
  return JSON.stringify(rows, null, 2) + NL;
}

export function toJsonLines(rows) {
  return rows.map((r) => JSON.stringify(r)).join(NL) + (rows.length ? NL : '');
}

// ---------------------------------------------------------------- YAML

/**
 * A string is quoted unless it is unambiguously safe unquoted.
 *
 * The list of things that must be quoted is longer than it looks: `no` and
 * `off` come back as booleans, `01` comes back as a number in some readers and
 * loses its leading zero in others, and a leading `-` starts a list item. Every
 * one of those round-trips into a different value with no error at any point.
 */
function yamlScalar(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  const text = String(value);
  const AMBIGUOUS = /^(|~|null|Null|NULL|true|True|TRUE|false|False|FALSE|yes|Yes|YES|no|No|NO|on|On|ON|off|Off|OFF)$/;
  const NUMERIC = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
  const LEADING_ZERO = /^0\d/;
  const SPECIAL_START = /^[-?:,[\]{}#&*!|>'"%@`]/;
  const needsQuote =
    AMBIGUOUS.test(text) || NUMERIC.test(text) || LEADING_ZERO.test(text) ||
    SPECIAL_START.test(text) || /[:#]\s|\s$|^\s|[\n\r\t]/.test(text);
  if (!needsQuote) return text;
  return '"' + text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    .replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
}

export function toYaml(rows) {
  if (!rows.length) return '[]' + NL;
  const out = [];
  for (const row of rows) {
    const keys = Object.keys(row || {});
    if (!keys.length) { out.push('- {}'); continue; }
    keys.forEach((key, i) => {
      out.push((i === 0 ? '- ' : '  ') + key + ': ' + yamlScalar(row[key]));
    });
  }
  return out.join(NL) + NL;
}

// ---------------------------------------------------------------- TOML

function tomlValue(value) {
  if (value === null || value === undefined) return '""';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '""';
  if (Array.isArray(value)) return '[' + value.map(tomlValue).join(', ') + ']';
  if (typeof value === 'object') return tomlValue(JSON.stringify(value));
  return '"' + String(value)
    .replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    .replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
}

function tomlKey(key) {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : '"' + key.replace(/"/g, '\\"') + '"';
}

/** An array of tables, which is TOML's shape for a list of records. */
export function toToml(rows, { table = 'record' } = {}) {
  const out = [];
  for (const row of rows) {
    out.push('[[' + table + ']]');
    for (const [key, value] of Object.entries(row || {})) {
      out.push(tomlKey(key) + ' = ' + tomlValue(value));
    }
    out.push('');
  }
  return out.join(NL);
}

// ---------------------------------------------------------------- XML

/**
 * Escaping is not optional and not partial.
 *
 * An unescaped ampersand does not produce a warning, it produces a document no
 * parser will read — and it is the single most common character in a URL after
 * the slash, so it is the one that actually appears.
 */
export function xmlEscape(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** A key that is not a legal XML name becomes an attribute rather than a tag. */
function xmlName(key) {
  return /^[A-Za-z_][A-Za-z0-9._-]*$/.test(key) ? key : null;
}

export function toXml(rows, { root = 'records', item = 'record' } = {}) {
  const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<' + root + '>'];
  for (const row of rows) {
    out.push('  <' + item + '>');
    for (const [key, value] of Object.entries(row || {})) {
      const name = xmlName(key);
      if (name) {
        out.push('    <' + name + '>' + xmlEscape(scalar(value)) + '</' + name + '>');
      } else {
        // A key XML cannot express as a tag is kept, with its real name in an
        // attribute. Dropping it would lose data silently.
        out.push('    <field name="' + xmlEscape(key) + '">' + xmlEscape(scalar(value)) + '</field>');
      }
    }
    out.push('  </' + item + '>');
  }
  out.push('</' + root + '>');
  return out.join(NL) + NL;
}

// ---------------------------------------------------------------- delimited

/**
 * RFC 4180 quoting: a field is quoted if it contains the delimiter, a quote, or
 * a line break, and an embedded quote is doubled.
 *
 * The leading-formula guard is separate and deliberate. A field beginning with
 * =, +, - or @ is executed as a formula by every major spreadsheet on open,
 * which turns an export into a way to run something on the reader's machine. A
 * leading apostrophe is the standard, boring defence.
 */
export function delimitedField(value, delimiter) {
  let text = scalar(value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  const mustQuote = text.includes(delimiter) || text.includes('"') || /[\n\r]/.test(text);
  if (!mustQuote) return text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function delimited(rows, delimiter) {
  const cols = columns(rows);
  const lines = [cols.map((c) => delimitedField(c, delimiter)).join(delimiter)];
  for (const row of rows) {
    lines.push(cols.map((c) => delimitedField(row ? row[c] : '', delimiter)).join(delimiter));
  }
  // CRLF, as RFC 4180 specifies. Some readers accept LF; not all do.
  return lines.join('\r\n') + '\r\n';
}

export function toCsv(rows) { return delimited(rows, ','); }
export function toTsv(rows) { return delimited(rows, '\t'); }

/**
 * Reads a delimited file back.
 *
 * Present so the writer can be checked against a reader rather than against an
 * expected string, which is the only way to catch quoting that is nearly right.
 */
export function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i += 1; continue;
      }
      field += ch; i += 1; continue;
    }
    if (ch === '"') { quoted = true; i += 1; continue; }
    if (ch === delimiter) { row.push(field); field = ''; i += 1; continue; }
    if (ch === '\r' && text[i + 1] === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 2; continue; }
    if (ch === '\n' || ch === '\r') { row.push(field); rows.push(row); row = []; field = ''; i += 1; continue; }
    field += ch; i += 1;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, j) => [h, r[j] === undefined ? '' : r[j]])));
}

// ---------------------------------------------------------------- Markdown

/**
 * A pipe inside a cell ends the cell, so it is escaped; a newline ends the row,
 * so it becomes a break. Neither produces an error — both produce a table with
 * the columns quietly shifted.
 */
function markdownCell(value) {
  return scalar(value)
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>');
}

export function toMarkdown(rows) {
  const cols = columns(rows);
  if (!cols.length) return '_No records._' + NL;
  const out = [
    '| ' + cols.map(markdownCell).join(' | ') + ' |',
    '| ' + cols.map(() => '---').join(' | ') + ' |'
  ];
  for (const row of rows) {
    out.push('| ' + cols.map((c) => markdownCell(row ? row[c] : '')).join(' | ') + ' |');
  }
  return out.join(NL) + NL;
}

// ---------------------------------------------------------------- HTML

export function toHtml(rows, { title = 'Export' } = {}) {
  const cols = columns(rows);
  const cell = (v) => '<td>' + xmlEscape(scalar(v)) + '</td>';
  const head = cols.map((c) => '<th scope="col">' + xmlEscape(c) + '</th>').join('');
  const body = rows.map((r) => '<tr>' + cols.map((c) => cell(r ? r[c] : '')).join('') + '</tr>').join(NL);
  // Self-contained on purpose: an export that needs a stylesheet from somewhere
  // is an export that stops working the moment it is moved.
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<title>' + xmlEscape(title) + '</title>',
    '<style>',
    'body{font-family:system-ui,sans-serif;margin:2rem;color:#1D1B20;background:#FEF7FF}',
    'table{border-collapse:collapse;width:100%;font-size:.9rem}',
    'th,td{border:1px solid #CAC4D0;padding:6px 10px;text-align:left;vertical-align:top}',
    'th{background:#ECE6F0}',
    '@media (prefers-color-scheme:dark){body{color:#E6E0E9;background:#141218}',
    'th,td{border-color:#49454F}th{background:#2B2930}}',
    '</style>',
    '</head>',
    '<body>',
    '<h1>' + xmlEscape(title) + '</h1>',
    '<table>',
    '<thead><tr>' + head + '</tr></thead>',
    '<tbody>',
    body,
    '</tbody>',
    '</table>',
    '</body>',
    '</html>',
    ''
  ].join(NL);
}

// ---------------------------------------------------------------- dispatch

const WRITERS = {
  json: toJson,
  jsonl: toJsonLines,
  yaml: toYaml,
  toml: toToml,
  xml: toXml,
  csv: toCsv,
  tsv: toTsv,
  markdown: toMarkdown,
  html: toHtml
};

export function serialise(rows, format, options = {}) {
  const writer = WRITERS[format];
  if (!writer) throw new Error('"' + format + '" is not a format this can write.');
  if (!Array.isArray(rows)) throw new Error('Only a list of records can be exported.');
  return writer(rows, options);
}

export function formatFor(id) {
  return FORMATS.find((f) => f.id === id) || null;
}

/**
 * A filename that is only ever a filename.
 *
 * Separators go first, but that is not sufficient on its own: stripping the
 * slashes out of `../../etc/passwd` leaves `..-..-etc-passwd`, and a name
 * beginning with a dot is hidden on Unix while `.` and `..` are directory
 * entries rather than names at all. So leading dots and dashes are removed too,
 * and an input that reduces to nothing gets a real name rather than an
 * extension with nothing in front of it.
 */
export function filenameFor(base, format) {
  const f = formatFor(format);
  const safe = String(base || 'export')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[.\-]+/, '')
    .replace(/[.\-]+$/, '')
    || 'export';
  return safe + '.' + (f ? f.extension : 'txt');
}
