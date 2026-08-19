// The personal-vocabulary contract.
//
// A user-supplied file gets applied to the application's own copy, so the whole
// payload is validated before anything is displayed or cached. Every bound below
// exists because the alternative is a file that renders, half-applies, or
// silently eats memory.
//
// Nothing here touches the network, and nothing here is ever written into an
// export, a log, a history entry or a capture. The file is the user's.

export const LIMITS = {
  maxBytes: 2 * 1024 * 1024,
  supportedVersions: [1],
  maxTerms: 5000,
  maxDepth: 6,
  maxKeyLength: 120,
  maxValueLength: 400
};

export const LIMITS_TEXT =
  'At most ' + (LIMITS.maxBytes / 1024 / 1024) + ' MB, schema version ' + LIMITS.supportedVersions.join(' or ') +
  ', at most ' + LIMITS.maxTerms.toLocaleString('en-US') + ' terms, nesting no deeper than ' + LIMITS.maxDepth +
  ', keys under ' + LIMITS.maxKeyLength + ' characters and replacements under ' + LIMITS.maxValueLength +
  '. Replacements must be strings. A file that breaks any of these is rejected whole — it never applies partially, because a half-applied vocabulary is harder to notice than one that was refused.';

export const EXAMPLE = `{
  "version": 1,
  "terms": [
    { "alias": "daemon", "replacement": "background service" },
    { "alias": "pull",   "replacement": "download" }
  ]
}`;

function depthOf(value, depth = 0) {
  if (depth > LIMITS.maxDepth) return depth;
  if (Array.isArray(value)) {
    let max = depth;
    for (const v of value) max = Math.max(max, depthOf(v, depth + 1));
    return max;
  }
  if (value && typeof value === 'object') {
    let max = depth;
    for (const v of Object.values(value)) max = Math.max(max, depthOf(v, depth + 1));
    return max;
  }
  return depth;
}

/**
 * Validates a parsed payload. Returns { ok, value } or { ok: false, error }.
 * The error names the exact bound that was crossed, because "invalid file" is
 * not something anybody can act on.
 */
export function validate(parsed, byteLength) {
  if (typeof byteLength === 'number' && byteLength > LIMITS.maxBytes) {
    return { ok: false, error: 'The file is ' + (byteLength / 1024 / 1024).toFixed(2) + ' MB, over the ' + (LIMITS.maxBytes / 1024 / 1024) + ' MB limit.' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'The top level must be a JSON object.' };
  }
  if (!('version' in parsed)) {
    return { ok: false, error: 'There is no "version" field, so there is no way to know which schema this is.' };
  }
  if (!LIMITS.supportedVersions.includes(parsed.version)) {
    return { ok: false, error: 'Schema version ' + JSON.stringify(parsed.version) + ' is not supported. This build reads version ' + LIMITS.supportedVersions.join(' or ') + '.' };
  }

  const terms = parsed.terms ?? parsed.vocabulary ?? parsed.entries;
  if (!Array.isArray(terms)) {
    return { ok: false, error: 'There is no "terms" array.' };
  }
  if (terms.length > LIMITS.maxTerms) {
    return { ok: false, error: 'The file has ' + terms.length.toLocaleString('en-US') + ' terms, over the limit of ' + LIMITS.maxTerms.toLocaleString('en-US') + '.' };
  }

  const depth = depthOf(parsed);
  if (depth > LIMITS.maxDepth) {
    return { ok: false, error: 'The file nests ' + depth + ' levels deep, over the limit of ' + LIMITS.maxDepth + '.' };
  }

  const seen = new Set();
  const clean = [];
  for (let i = 0; i < terms.length; i++) {
    const t = terms[i];
    const where = 'Entry ' + (i + 1);
    if (typeof t !== 'object' || t === null || Array.isArray(t)) {
      return { ok: false, error: where + ' is not an object.' };
    }
    const alias = t.alias ?? t.term;
    const replacement = t.replacement ?? t.value;
    if (typeof alias !== 'string' || !alias) {
      return { ok: false, error: where + ' has no "alias" (or "term") string.' };
    }
    if (typeof replacement !== 'string') {
      return { ok: false, error: where + ' ("' + alias.slice(0, 24) + '") has a non-string replacement. Replacements must be strings.' };
    }
    if (alias.length > LIMITS.maxKeyLength) {
      return { ok: false, error: where + ' has an alias of ' + alias.length + ' characters, over the limit of ' + LIMITS.maxKeyLength + '.' };
    }
    if (replacement.length > LIMITS.maxValueLength) {
      return { ok: false, error: where + ' has a replacement of ' + replacement.length + ' characters, over the limit of ' + LIMITS.maxValueLength + '.' };
    }
    // Duplicate keys are legal JSON but no parser keeps both, so the file is
    // ambiguous rather than merely redundant.
    if (seen.has(alias)) {
      return { ok: false, error: 'The alias "' + alias.slice(0, 32) + '" appears more than once, so which replacement wins is ambiguous.' };
    }
    seen.add(alias);
    clean.push({ alias, replacement });
  }

  // Longest first, so a longer alias is never eaten by a shorter one it contains.
  clean.sort((a, b) => b.alias.length - a.alias.length);
  return { ok: true, value: { version: parsed.version, terms: clean } };
}

/** Reads and validates a File. Rejects before anything is displayed or cached. */
export async function load(file) {
  if (file.size > LIMITS.maxBytes) {
    return { ok: false, error: 'The file is ' + (file.size / 1024 / 1024).toFixed(2) + ' MB, over the ' + (LIMITS.maxBytes / 1024 / 1024) + ' MB limit. Nothing was read.' };
  }
  let text;
  try {
    text = await file.text();
  } catch (e) {
    return { ok: false, error: 'The file could not be read: ' + String(e) };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: 'That is not valid JSON: ' + String(e && e.message ? e.message : e) };
  }
  return validate(parsed, file.size);
}

/**
 * Applies replacements to one rendered string.
 *
 * Called at the user-facing text boundary only. Commands, addresses,
 * identifiers, code and file paths are never passed through this, because
 * rewriting one of those turns a working value into a lookup that fails.
 */
export function apply(text, vocabulary) {
  if (!vocabulary || !Array.isArray(vocabulary.terms) || typeof text !== 'string') return text;
  let out = text;
  for (const { alias, replacement } of vocabulary.terms) {
    if (!alias) continue;
    out = out.split(alias).join(replacement);
  }
  return out;
}
