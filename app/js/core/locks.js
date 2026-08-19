// Toy locks.
//
// Every rule in this file exists to keep the feature honest about what it is.
// It is a speed bump somebody sets for themselves. It is not encryption, it
// does not protect anything from anyone else with this machine, and clearing
// the application's data removes it. The copy says all three, every time.
//
// Two structural commitments:
//
//   * Every lock carries its OWN credential. There is no master credential and
//     no inheritance — unlocking one surface never unlocks another, and a
//     locked property inside a locked tab is two locks with two answers.
//
//   * A password is verified against a stored hash, never a stored password.
//     One-time-code locks store a secret because TOTP needs one; that is the
//     honest cost of offering the method, and the surface says so.

import * as state from '../state.js';
import * as totp from './totp.js';

export const METHODS = ['password', 'totp'];

export const DISCLOSURE =
	"This is a lock you set for yourself. It is not encryption, it does not protect anything from anyone else who has this machine, and clearing this application's stored data removes it. Forgetting the answer is a normal outcome, and the way out is documented rather than hidden behind a support process.";

/** Durations a lock can be opened for. "Until the app closes" is not persisted. */
export const DURATIONS = [
	{ value: 'surface', label: 'This surface only' },
	{ value: '5', label: '5 minutes' },
	{ value: '30', label: '30 minutes' },
	{ value: 'session', label: 'Until the application closes' }
];

async function sha256Hex(text) {
	const bytes = new TextEncoder().encode(text);
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function all() {
	return state.get('locks') || {};
}

function save(next) {
	state.set('locks', next);
}

/** Every lock, as a real enumerable list — searchable and individually removable. */
export function list() {
	return Object.entries(all()).map(([id, lock]) => ({
		id,
		...lock,
		secret: undefined,
		hash: undefined
	}));
}

export function get(id) {
	return all()[id] || null;
}

export function isLocked(id) {
	const lock = get(id);
	if (!lock) return false;
	if (!lock.openUntil) return true;
	if (lock.openUntil === 'session') return !openThisSession.has(id);
	return Date.now() > Number(lock.openUntil);
}

/** Opened-until-close state lives in memory, so closing really does relock. */
const openThisSession = new Set();

/**
 * Creates a lock. Each call mints a separate credential even when the same
 * value is supplied twice — reusing one is the user's deliberate act, never
 * something the application arranges for them.
 */
export async function create({ id, label, method, password, secret, duration = 'surface' }) {
	if (!id) throw new Error('A lock needs a target.');
	if (!METHODS.includes(method)) throw new Error('Unsupported method: ' + method);

	const lock = { label: label || id, method, duration, createdAt: Date.now(), openUntil: null };

	if (method === 'password') {
		if (!password || password.length < 4)
			throw new Error('The password must be at least four characters.');
		lock.hash = await sha256Hex(password);
	} else {
		const cleaned = String(secret || '').replace(/\s+/g, '');
		if (!cleaned) throw new Error('A one-time-code lock needs a secret.');
		if (!totp.base32Decode(cleaned).length) throw new Error('That secret is not valid Base32.');
		lock.secret = cleaned;
	}

	save({ ...all(), [id]: lock });
	state.log('Lock created', lock.label + ' (' + method + ')');
	return { id, ...lock, secret: undefined, hash: undefined };
}

/**
 * Tries an answer. Returns { ok } or { ok: false, reason }.
 * A wrong attempt is honest and rate-limited; it never wipes content, never
 * escalates, and never pretends a lockout is enforcement.
 */
const attempts = new Map();

export async function tryUnlock(id, answer) {
	const lock = get(id);
	if (!lock) return { ok: false, reason: 'There is no lock on that.' };

	const record = attempts.get(id) || { count: 0, until: 0 };
	if (Date.now() < record.until) {
		const secs = Math.ceil((record.until - Date.now()) / 1000);
		return {
			ok: false,
			reason: 'Too many attempts. Try again in ' + secs + 's.',
			waitSeconds: secs
		};
	}

	let ok = false;
	if (lock.method === 'password') {
		ok = (await sha256Hex(String(answer || ''))) === lock.hash;
	} else {
		const given = String(answer || '').replace(/\s+/g, '');
		// A small skew window, because clocks drift and a rigid check reads as a
		// wrong password to somebody who typed the right code.
		for (const offset of [-1, 0, 1]) {
			const code = await totp.totp(lock.secret, { atMs: Date.now() + offset * 30_000 });
			if (code === given) {
				ok = true;
				break;
			}
		}
	}

	if (!ok) {
		record.count += 1;
		// Exponential and capped. The ladder skips the waiting; it never shortens
		// this escalation, and it never returns more attempts than serving it would.
		if (record.count >= 3) {
			const wait = Math.min(2 ** (record.count - 2), 60) * 1000;
			record.until = Date.now() + wait;
		}
		attempts.set(id, record);
		return {
			ok: false,
			reason:
				'That did not match. ' +
				(record.until > Date.now()
					? 'Waiting ' + Math.ceil((record.until - Date.now()) / 1000) + 's before the next try.'
					: 'Nothing was changed or deleted.'),
			attempts: record.count
		};
	}

	attempts.delete(id);
	const next = { ...all() };
	const minutes = Number(lock.duration);
	next[id] = {
		...lock,
		openUntil:
			lock.duration === 'session'
				? 'session'
				: Number.isFinite(minutes)
					? Date.now() + minutes * 60_000
					: Date.now()
	};
	if (lock.duration === 'session') openThisSession.add(id);
	save(next);
	state.log('Unlocked', lock.label);
	return { ok: true };
}

/** Closes a lock again immediately. */
export function relock(id) {
	const lock = get(id);
	if (!lock) return;
	openThisSession.delete(id);
	save({ ...all(), [id]: { ...lock, openUntil: null } });
	state.log('Relocked', lock.label);
}

export function remove(id) {
	const lock = get(id);
	const next = { ...all() };
	delete next[id];
	openThisSession.delete(id);
	save(next);
	if (lock) state.log('Lock removed', lock.label);
}

/** How many skips the ladder has left in the current rolling hour. */
const LADDER_CAP = 3;
const ladderUses = [];

export function ladderBudget() {
	const cutoff = Date.now() - 3_600_000;
	while (ladderUses.length && ladderUses[0] < cutoff) ladderUses.shift();
	return {
		used: ladderUses.length,
		cap: LADDER_CAP,
		remaining: Math.max(0, LADDER_CAP - ladderUses.length)
	};
}

export function spendLadder() {
	const b = ladderBudget();
	if (!b.remaining) return false;
	ladderUses.push(Date.now());
	return true;
}

/**
 * Clears the WAITING on a lock, and nothing else.
 *
 * It does not sign anybody in, does not mint a session, does not touch the
 * credential, and does not return more attempts than serving the clock would.
 * Winning returns the user to the ordinary prompt still needing the answer.
 */
export function clearWait(id) {
	const record = attempts.get(id);
	if (!record) return false;
	record.until = 0;
	attempts.set(id, record);
	state.log('Ladder cleared the wait', id);
	return true;
}

export function waitRemaining(id) {
	const record = attempts.get(id);
	if (!record) return 0;
	return Math.max(0, Math.ceil((record.until - Date.now()) / 1000));
}
