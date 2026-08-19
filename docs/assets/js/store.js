// Per-visitor state. Everything lives in this browser and nowhere else:
// no account, no sync, no network call anywhere in this file.
//
// The site has no operating-system credential vault and no application-data
// folder, so it says so plainly wherever a contract assumes one, and the reset
// route is "clear this site's storage" rather than "delete a folder".

const PREFIX = 'mowui.';
const HISTORY_KEY = PREFIX + 'history';
const HISTORY_CAP = 400;

const listeners = new Set();

export const DEFAULTS = {
	settings: {
		theme: 'system',
		language: 'English',
		funnyEn: 2,
		funnyZh: 2,
		emojiDialogs: false,
		density: 0,
		scale: 1,
		radiusScale: 1,
		seed: '#6750A4',
		appName: '',
		narrator: { on: false, voiceEn: '', voiceZh: '', rate: 1, pitch: 1, lang: 'English' },
		school: { on: false, name: 'School mode', pin: '' },
		logo: { preset: 'chat', custom: null, fit: 'cover', bg: 'var(--p)' },
		schedules: [],
		vocab: null,
		reducedMotion: false,
		paletteSize: 'card'
	},
	// The primary destinations are open from the first visit. A strip with one
	// tab teaches nobody that the strip is how you navigate, and leaves the rest
	// of the site reachable only by a shortcut the reader has not learned yet.
	tabs: [
		{ id: 't-home', page: 'home', pinned: true },
		{ id: 't-features', page: 'features', pinned: false },
		{ id: 't-docs', page: 'docs', pinned: false },
		{ id: 't-changelog', page: 'changelog', pinned: false },
		{ id: 't-settings', page: 'settings', pinned: false }
	],
	activeTab: 't-home',
	// The tab model the shared strip reads. Null until something writes one, at
	// which point the two keys above are read once as its starting point and
	// never again — a model written by the older shape must not be lost just
	// because the shape changed.
	tabModel: null,
	locks: {},
	totp: [],
	tickets: [],
	notifications: [],
	appearance: {}
};

function readRaw(key) {
	try {
		const v = localStorage.getItem(PREFIX + key);
		return v === null ? undefined : JSON.parse(v);
	} catch {
		return undefined;
	}
}

function writeRaw(key, value) {
	try {
		localStorage.setItem(PREFIX + key, JSON.stringify(value));
		return true;
	} catch (e) {
		// A quota failure must never silently look like a save.
		console.warn('mowui: could not persist', key, e);
		return false;
	}
}

function clone(v) {
	return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

function deepMerge(base, override) {
	if (override === undefined || override === null) return clone(base);
	if (typeof base !== 'object' || base === null || Array.isArray(base)) return clone(override);
	const out = clone(base);
	for (const k of Object.keys(override)) {
		out[k] = k in base ? deepMerge(base[k], override[k]) : clone(override[k]);
	}
	return out;
}

const state = {};
for (const key of Object.keys(DEFAULTS)) {
	state[key] = deepMerge(DEFAULTS[key], readRaw(key));
}

/** Which keys the visitor has actually written, so a setting can tell the truth
 *  about whether its value is theirs or a shipped default. */
const written = new Set();
for (const key of Object.keys(DEFAULTS)) {
	if (readRaw(key) !== undefined) written.add(key);
}
const writtenPaths = new Set(readRaw('__written') || []);

export function get(key) {
	return state[key];
}

export function set(key, value, meta = {}) {
	const before = clone(state[key]);
	state[key] = value;
	// The result is read rather than discarded. writeRaw's own comment says a
	// quota failure must never silently look like a save — and discarding this
	// made it do exactly that: the log gained an entry asserting a change that
	// had not persisted, which is the log recording what was EXPECTED to happen.
	// That is the one thing it exists not to do.
	const persisted = writeRaw(key, value);
	written.add(key);
	if (meta.path) {
		writtenPaths.add(meta.path);
		writeRaw('__written', [...writtenPaths]);
	}
	if (meta.record !== false) {
		if (persisted) {
			record(meta.action || 'settings changed', meta.label || key, {
				key,
				before,
				after: clone(value)
			});
		} else {
			// Recorded as what it is. The value IS live in memory, so the change is
			// real for this session — it simply will not survive a reload, and the
			// log has to say which of those two things happened.
			record(
				'not saved',
				'Could not save ' +
					key +
					': this browser refused the write, so the change applies now but will be lost on reload',
				{ key, before, after: clone(value), persisted: false }
			);
		}
	}
	emit(key, value);
	return value;
}

export function patchSettings(patch, meta = {}) {
	const next = deepMerge(state.settings, patch);
	return set('settings', next, { action: 'settings changed', ...meta });
}

/** Has this exact settings path ever been written by the visitor? */
export function isUserSet(path) {
	return writtenPaths.has(path);
}

export function defaultFor(path) {
	let node = DEFAULTS;
	for (const part of ('settings.' + path).split('.')) {
		if (node === undefined || node === null) return undefined;
		node = node[part.replace(/^settings$/, 'settings')] ?? node[part];
	}
	return node;
}

export function settingValue(path) {
	let node = state.settings;
	for (const part of path.split('.')) {
		if (node === undefined || node === null) return undefined;
		node = node[part];
	}
	return node;
}

export function subscribe(fn) {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

function emit(key, value) {
	for (const fn of listeners) {
		try {
			fn(key, value);
		} catch (e) {
			console.error('mowui: listener failed', e);
		}
	}
}

// ---------- append-only local history ----------
//
// The application keeps this in a real Git repository beside its data directory.
// A web page has no such thing, so this is the closest honest equivalent: an
// append-only log in this browser. Restores are new entries, never rewrites.

export function record(action, label, detail = {}) {
	const entry = {
		id: 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
		t: Date.now(),
		action,
		label,
		detail: redact(detail)
	};
	const log = readRaw('history') || [];
	log.unshift(entry);
	writeRaw('history', log.slice(0, HISTORY_CAP));
	emit('history', entry);
	return entry;
}

export function history() {
	return readRaw('history') || [];
}

export function historyActions() {
	const counts = new Map();
	for (const e of history()) counts.set(e.action, (counts.get(e.action) || 0) + 1);
	return [...counts.entries()]
		.map(([action, count]) => ({ action, count }))
		.sort((a, b) => b.count - a.count);
}

/** Credentials and vocabulary payloads never enter a history entry, an export,
 *  or anything else that leaves this module. */
function redact(detail) {
	const out = JSON.parse(JSON.stringify(detail ?? {}));
	const walk = (node) => {
		if (!node || typeof node !== 'object') return;
		for (const k of Object.keys(node)) {
			if (/^(pin|secret|password|hash|credential|terms|vocab)$/i.test(k)) node[k] = '[omitted]';
			else walk(node[k]);
		}
	};
	walk(out);
	return out;
}

export function restore(entryId) {
	const entry = history().find((e) => e.id === entryId);
	if (!entry || !entry.detail || !entry.detail.key) return null;
	const { key, before } = entry.detail;
	if (before === undefined) return null;
	state[key] = before;
	const persisted = writeRaw(key, before);
	record(
		persisted ? 'restored' : 'not saved',
		persisted
			? 'Restored ' + key + ' to its state before "' + entry.label + '"'
			: 'Restored ' +
					key +
					' in this session only: the browser refused the write, so it will be lost on reload',
		{ key, persisted }
	);
	emit(key, before);
	return entry;
}

// ---------- export ----------

export const EXPORT_FORMATS = [
	'json',
	'jsonl',
	'yaml',
	'toml',
	'xml',
	'csv',
	'tsv',
	'markdown',
	'html'
];

/** What an export deliberately leaves out, stated rather than silently dropped. */
export const EXPORT_OMISSIONS = [
	'Lock credentials — a password hash or one-time-code secret is never serialised.',
	'Authenticator secrets — the entries are listed, the secrets are not.',
	'Personal-vocabulary contents — the cache is never copied into a file that leaves this browser.'
];

export function exportBundle() {
	const s = clone(state);
	s.locks = Object.fromEntries(
		Object.entries(s.locks || {}).map(([k, v]) => [k, { ...v, secret: undefined, hash: undefined }])
	);
	s.totp = (s.totp || []).map((e) => ({ ...e, secret: undefined }));
	if (s.settings)
		s.settings = {
			...s.settings,
			vocab: s.settings.vocab ? { loaded: true, terms: '[omitted]' } : null
		};
	return {
		schema: 'material-open-webui.site-state',
		version: 1,
		exportedAt: new Date().toISOString(),
		encoding: 'UTF-8',
		lineEndings: 'LF',
		omitted: EXPORT_OMISSIONS,
		state: s,
		history: history()
	};
}

export function clearAll() {
	for (const key of Object.keys(localStorage).filter((k) => k.startsWith(PREFIX))) {
		localStorage.removeItem(key);
	}
}
