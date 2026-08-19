// Local version history.
//
// Append-only, and the appending is the whole point. Every mutation of a
// setting, a record, an authenticator entry or the display name adds an entry;
// nothing ever edits or removes one. A restore is a NEW entry that happens to
// carry an old value, so "what did I change and when" stays answerable even
// after undoing something — which is precisely when people ask.
//
// Each entry carries the hash of the one before it, so the chain can be checked
// rather than trusted. That matters because this history is the only record of
// what happened: a store that can be quietly edited is not a record, it is a
// suggestion. The check is not a security boundary — anything that can rewrite
// an entry can rewrite the chain — and the surface says so rather than
// implying otherwise.
//
// It lives in the application's own data, never as a `.git` directory inside
// somebody's documents folder.

export const SCHEMA_VERSION = 1;

export const LIMITS = Object.freeze({
	maxEntries: 5000,
	maxLabelLength: 120,
	maxValueBytes: 8192
});

/**
 * Fields never written into history, in any entry, at any point.
 *
 * A one-time-code secret in a version history is a secret in a file, which is
 * the exact thing the authenticator refuses to do in the first place. Writing
 * it here would route around that decision rather than honour it.
 */
export const NEVER_RECORDED = Object.freeze([
	'secret',
	'hash',
	'password',
	'pin',
	'token',
	'apiKey'
]);

// ---------------------------------------------------------------- hashing

const encoder = new TextEncoder();

/**
 * A canonical rendering of an entry, so the same content always hashes the
 * same. Key order is sorted rather than left to whatever built the object.
 */
export function canonical(entry) {
	const stable = (v) => {
		if (v === null || v === undefined) return null;
		if (Array.isArray(v)) return v.map(stable);
		if (typeof v === 'object') {
			return Object.fromEntries(
				Object.keys(v)
					.sort()
					.map((k) => [k, stable(v[k])])
			);
		}
		return v;
	};
	return JSON.stringify(
		stable({
			seq: entry.seq,
			at: entry.at,
			action: entry.action,
			target: entry.target,
			before: entry.before,
			after: entry.after,
			label: entry.label || '',
			parent: entry.parent || ''
		})
	);
}

export async function hashOf(entry) {
	const bytes = encoder.encode(canonical(entry));
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

// ---------------------------------------------------------------- redaction

/** A value with anything in NEVER_RECORDED removed, at any depth. */
export function redact(value, depth = 0) {
	if (depth > 8) return '[too deeply nested to record]';
	if (value === null || value === undefined) return value;
	if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
	if (typeof value === 'object') {
		const out = {};
		for (const [k, v] of Object.entries(value)) {
			if (NEVER_RECORDED.includes(k)) {
				out[k] = '[not recorded]';
				continue;
			}
			out[k] = redact(v, depth + 1);
		}
		return out;
	}
	if (typeof value === 'string' && value.length > LIMITS.maxValueBytes) {
		return (
			value.slice(0, LIMITS.maxValueBytes) +
			'… [' +
			(value.length - LIMITS.maxValueBytes) +
			' more characters not recorded]'
		);
	}
	return value;
}

// ---------------------------------------------------------------- appending

export function empty() {
	return { schema: SCHEMA_VERSION, entries: [] };
}

/**
 * Appends one entry.
 *
 * Returns a NEW log. Nothing here mutates what it was given, which is what lets
 * a test hold the before and after side by side and prove nothing earlier moved.
 */
export async function record(log, { action, target, before, after, at, label }) {
	if (!action) throw new Error('Every history entry has to say what happened.');
	const entries = log && Array.isArray(log.entries) ? log.entries : [];
	const previous = entries[entries.length - 1];
	const entry = {
		seq: previous ? previous.seq + 1 : 1,
		at: at || new Date().toISOString(),
		action: String(action),
		target: target === undefined ? '' : String(target),
		before: redact(before),
		after: redact(after),
		label: label ? String(label).slice(0, LIMITS.maxLabelLength) : '',
		parent: previous ? previous.hash : ''
	};
	entry.hash = await hashOf(entry);

	const next = [...entries, entry];
	// Beyond the cap the OLDEST are dropped, and the drop is itself recorded, so
	// a history that has forgotten something says so rather than simply being
	// shorter than someone remembers.
	if (next.length > LIMITS.maxEntries) {
		const dropped = next.length - LIMITS.maxEntries;
		const kept = next.slice(dropped);
		return {
			log: { schema: SCHEMA_VERSION, entries: kept, truncated: (log.truncated || 0) + dropped },
			entry,
			dropped
		};
	}
	return {
		log: { schema: SCHEMA_VERSION, entries: next, truncated: log ? log.truncated || 0 : 0 },
		entry,
		dropped: 0
	};
}

/**
 * Restores an earlier value.
 *
 * The old entry is left exactly where it is and a new one is appended. Rolling
 * the log back instead would erase the evidence that the restore happened,
 * which is the one thing somebody looking at a history after an accident needs
 * to see.
 */
export async function restore(log, seq, { at } = {}) {
	const target = log.entries.find((e) => e.seq === seq);
	if (!target) throw new Error('There is no entry number ' + seq + ' to restore.');
	const result = await record(log, {
		action: 'restore',
		target: target.action + (target.target ? ' · ' + target.target : ''),
		before: target.after,
		after: target.before,
		at,
		label: 'Restored the value from entry ' + seq
	});
	return { ...result, restored: target.before, from: target };
}

/**
 * Labels an entry.
 *
 * Also an append. Writing the label onto the original would change an entry's
 * content, and its hash with it, breaking every hash after it — a history that
 * rewrites itself when annotated is not append-only in any useful sense.
 */
export async function label(log, seq, text, { at } = {}) {
	const target = log.entries.find((e) => e.seq === seq);
	if (!target) throw new Error('There is no entry number ' + seq + ' to label.');
	return record(log, {
		action: 'label',
		target: String(seq),
		before: target.label || '',
		after: String(text).slice(0, LIMITS.maxLabelLength),
		at,
		label: String(text).slice(0, LIMITS.maxLabelLength)
	});
}

/** The label in force for an entry, taking later labelling entries into account. */
export function labelFor(log, seq) {
	let current = '';
	for (const e of log.entries) {
		if (e.seq === seq) current = e.label || '';
		if (e.action === 'label' && e.target === String(seq)) current = e.after;
	}
	return current;
}

// ---------------------------------------------------------------- verification

/**
 * Walks the chain and reports the first entry whose hash does not match.
 *
 * Explicitly not a security boundary: whatever can rewrite an entry can
 * recompute the chain. It catches corruption and accidental edits, which is
 * what actually happens to a local file.
 */
export async function verify(log) {
	const entries = log && Array.isArray(log.entries) ? log.entries : [];
	let parent = '';
	for (const entry of entries) {
		if ((entry.parent || '') !== parent) {
			return {
				ok: false,
				seq: entry.seq,
				reason: 'entry ' + entry.seq + ' does not follow the one before it'
			};
		}
		const expected = await hashOf(entry);
		if (expected !== entry.hash) {
			return {
				ok: false,
				seq: entry.seq,
				reason: 'entry ' + entry.seq + ' has been changed since it was written'
			};
		}
		parent = entry.hash;
	}
	return { ok: true, checked: entries.length };
}

// ---------------------------------------------------------------- reading

/**
 * The actions actually present, with counts.
 *
 * Derived from the log rather than from a hardcoded list, because a hardcoded
 * list goes stale the moment a new kind of change is recorded — and it goes
 * stale silently, by simply not offering a filter for something that is there.
 */
export function actions(log) {
	const counts = new Map();
	for (const e of log.entries) counts.set(e.action, (counts.get(e.action) || 0) + 1);
	return [...counts.entries()]
		.map(([action, count]) => ({ action, count }))
		.sort((a, b) => b.count - a.count || a.action.localeCompare(b.action));
}

/** The days that have entries, for a date picker that cannot offer an empty one. */
export function days(log) {
	const counts = new Map();
	for (const e of log.entries) {
		const day = String(e.at).slice(0, 10);
		counts.set(day, (counts.get(day) || 0) + 1);
	}
	return [...counts.entries()]
		.map(([day, count]) => ({ day, count }))
		.sort((a, b) => b.day.localeCompare(a.day));
}

/** One filter, applied by every surface that lists history. */
export function filter(log, { test, action, from, to } = {}) {
	return log.entries.filter((e) => {
		if (action && e.action !== action) return false;
		const day = String(e.at).slice(0, 10);
		if (from && day < from) return false;
		if (to && day > to) return false;
		if (test) {
			const text = [
				e.action,
				e.target,
				e.label,
				JSON.stringify(e.before),
				JSON.stringify(e.after)
			].join(' ');
			if (!test(text)) return false;
		}
		return true;
	});
}

// ---------------------------------------------------------------- diff

/**
 * A field-level difference between two values.
 *
 * Whole-value comparison tells someone that "settings changed", which they
 * already knew. What is useful is which key, from what, to what.
 */
export function diff(before, after) {
	const out = [];
	const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
	if (!isObject(before) || !isObject(after)) {
		if (JSON.stringify(before) !== JSON.stringify(after)) {
			out.push({
				key: '',
				kind: before === undefined ? 'added' : after === undefined ? 'removed' : 'changed',
				before,
				after
			});
		}
		return out;
	}
	const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
	for (const key of keys) {
		const a = before[key];
		const b = after[key];
		if (JSON.stringify(a) === JSON.stringify(b)) continue;
		out.push({
			key,
			kind: a === undefined ? 'added' : b === undefined ? 'removed' : 'changed',
			before: a,
			after: b
		});
	}
	return out;
}

// ---------------------------------------------------------------- pruning

/**
 * Removes old entries, and records that it did.
 *
 * A prune is the one operation that takes something out of an append-only log,
 * so it leaves a marker saying how many went and up to when. A history that
 * silently becomes shorter is worse than one that is honestly incomplete.
 */
export async function prune(log, { before, keepLabelled = true, at } = {}) {
	if (!before) throw new Error('Pruning needs a date to prune up to.');
	const labelled = new Set();
	if (keepLabelled) {
		for (const e of log.entries) {
			if (e.label) labelled.add(e.seq);
			if (e.action === 'label') labelled.add(Number(e.target));
		}
	}
	const kept = log.entries.filter(
		(e) => String(e.at).slice(0, 10) >= before || labelled.has(e.seq)
	);
	const removed = log.entries.length - kept.length;
	if (!removed) return { log, removed: 0 };

	// The chain is rebuilt across what remains, and the marker records the gap.
	let parent = '';
	const rebuilt = [];
	for (const e of kept) {
		const entry = { ...e, parent };
		entry.hash = await hashOf(entry);
		rebuilt.push(entry);
		parent = entry.hash;
	}
	return record(
		{ schema: SCHEMA_VERSION, entries: rebuilt, truncated: log.truncated || 0 },
		{
			action: 'prune',
			target: 'entries before ' + before,
			before: { entries: log.entries.length },
			after: { entries: rebuilt.length },
			at,
			label:
				removed +
				' entries removed, ' +
				(keepLabelled ? 'keeping every labelled one' : 'including labelled ones')
		}
	).then((r) => ({ ...r, removed }));
}

// ---------------------------------------------------------------- export

/**
 * The log as records, for export.
 *
 * Values are already redacted on the way in, and the omission is stated in the
 * result rather than left for someone to notice. An export that quietly leaves
 * something out is indistinguishable from one where the thing was never there.
 */
export function forExport(log) {
	return {
		rows: log.entries.map((e) => ({
			seq: e.seq,
			at: e.at,
			action: e.action,
			target: e.target,
			label: e.label,
			before: JSON.stringify(e.before),
			after: JSON.stringify(e.after),
			hash: e.hash
		})),
		omitted: [
			'Any field named ' +
				NEVER_RECORDED.join(', ') +
				' — these are replaced with "[not recorded]" when the entry is written, so they are absent from the history itself and not merely from this export.',
			log.truncated
				? log.truncated +
					' entries beyond the ' +
					LIMITS.maxEntries +
					'-entry cap were dropped as newer ones arrived.'
				: null
		].filter(Boolean)
	};
}
