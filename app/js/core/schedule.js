// Settings that change on a schedule.
//
// The whole difficulty here is that "8pm to 7am on weekdays" contains three
// ambiguities that only appear at the edges, and each of them has to be decided
// in one place and written down rather than left to whatever the code happened
// to do:
//
//   1. A window that crosses midnight belongs to the day it STARTED on. A
//      Friday-night rule runs into Saturday morning; it does not stop at
//      midnight and it does not need Saturday to be selected.
//   2. On the night the clocks go forward, a wall-clock time between 02:00 and
//      03:00 does not exist. A window that would have started then does not
//      start at all that day.
//   3. On the night they go back, a wall-clock time occurs twice. The window is
//      entered on its first occurrence and is not re-entered on the second.
//
// All three fall out of one decision: everything is evaluated as WALL-CLOCK
// time in a named zone, never as an offset from UTC and never as elapsed
// minutes. An offset is wrong twice a year, and both times without any error.

export const SCHEMA_VERSION = 1;

export const LIMITS = Object.freeze({
	maxRules: 64,
	maxIdLength: 64,
	maxNameLength: 80,
	maxPatchKeys: 12
});

/** Settings a rule is allowed to change. Anything else is refused, not ignored. */
export const SCHEDULABLE = Object.freeze([
	'theme',
	'language',
	'funnyEn',
	'funnyZh',
	'narratorOn',
	'appearanceProfile'
]);

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ---------------------------------------------------------------- precedence
//
// Written here so it is one documented rule rather than an accident of ordering.

/**
 * How two rules that both apply are resolved.
 *
 * A more specific rule wins. Specificity is counted, not guessed at:
 *
 *   +2  the rule is limited to a date range
 *   +1  the rule is limited to particular weekdays
 *   +1  the rule is limited to part of the day rather than all of it
 *
 * Rules of equal specificity are resolved by position: the one further down the
 * list wins, so "add an exception at the bottom" behaves the way people expect.
 */
export function specificity(rule) {
	let score = 0;
	if (rule.startDate || rule.endDate) score += 2;
	if (rule.days && rule.days.length && rule.days.length < 7) score += 1;
	if (!(rule.startTime === '00:00' && rule.endTime === '00:00')) score += 1;
	return score;
}

// ---------------------------------------------------------------- wall clock

const partsCache = new Map();
function formatterFor(timeZone) {
	if (!partsCache.has(timeZone)) {
		partsCache.set(
			timeZone,
			new Intl.DateTimeFormat('en-GB', {
				timeZone,
				hour12: false,
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
				weekday: 'short'
			})
		);
	}
	return partsCache.get(timeZone);
}

const SHORT_DAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * The wall-clock reading in a named zone at a given instant.
 *
 * Read from Intl rather than computed from an offset, because the offset is the
 * thing that changes. A schedule built on "UTC plus eight" is correct until the
 * clocks move and then wrong for six months, silently.
 */
export function wallClock(instant, timeZone) {
	const parts = {};
	for (const p of formatterFor(timeZone).formatToParts(instant)) {
		if (p.type !== 'literal') parts[p.type] = p.value;
	}
	const hour = Number(parts.hour) % 24; // some locales render midnight as 24
	return {
		year: Number(parts.year),
		month: Number(parts.month),
		day: Number(parts.day),
		hour,
		minute: Number(parts.minute),
		weekday: SHORT_DAYS[parts.weekday],
		minutes: hour * 60 + Number(parts.minute),
		date: parts.year + '-' + parts.month + '-' + parts.day
	};
}

/** Calendar arithmetic on a Y-M-D, with no zone involved. */
function shiftDate(year, month, day, byDays) {
	const t = Date.UTC(year, month - 1, day) + byDays * 86400000;
	const d = new Date(t);
	return {
		year: d.getUTCFullYear(),
		month: d.getUTCMonth() + 1,
		day: d.getUTCDate(),
		weekday: d.getUTCDay(),
		date: d.toISOString().slice(0, 10)
	};
}

function parseTime(text) {
	const m = /^(\d{1,2}):(\d{2})$/.exec(String(text || ''));
	if (!m) throw new Error('A time must be written as HH:MM, and "' + text + '" is not.');
	const hour = Number(m[1]);
	const minute = Number(m[2]);
	if (hour > 23 || minute > 59) throw new Error('"' + text + '" is not a time that exists.');
	return hour * 60 + minute;
}

function parseDate(text) {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || ''));
	if (!m) throw new Error('A date must be written as YYYY-MM-DD, and "' + text + '" is not.');
	return text;
}

// ---------------------------------------------------------------- validation

/**
 * Normalises one rule, or refuses it with a reason.
 *
 * Bounded on purpose: a schedule is written to disk and read back on every
 * launch, so an unbounded one is an unbounded thing to parse at startup.
 */
export function validateRule(input, index = 0) {
	if (!input || typeof input !== 'object') throw new Error('Rule ' + index + ' is not an object.');

	const id = String(input.id || '').trim();
	if (!id)
		throw new Error(
			'Rule ' + index + ' has no identifier. Identifiers are stable and are what history refers to.'
		);
	if (id.length > LIMITS.maxIdLength)
		throw new Error(
			'Rule "' + id + '" has an identifier longer than ' + LIMITS.maxIdLength + ' characters.'
		);
	if (!/^[a-zA-Z0-9._-]+$/.test(id))
		throw new Error(
			'Rule "' +
				id +
				'" has an identifier with characters outside letters, digits, dot, dash and underscore.'
		);

	const name = String(input.name || id).slice(0, LIMITS.maxNameLength);

	const startTime = input.startTime === undefined ? '00:00' : String(input.startTime);
	const endTime = input.endTime === undefined ? '00:00' : String(input.endTime);
	parseTime(startTime);
	parseTime(endTime);

	const startDate = input.startDate ? parseDate(input.startDate) : null;
	const endDate = input.endDate ? parseDate(input.endDate) : null;
	if (startDate && endDate && endDate < startDate) {
		throw new Error('Rule "' + id + '" ends before it starts.');
	}

	let days = input.days;
	if (days === undefined || days === null) days = [0, 1, 2, 3, 4, 5, 6];
	if (!Array.isArray(days)) throw new Error('Rule "' + id + '" has days that are not a list.');
	days = [...new Set(days.map(Number))].sort((a, b) => a - b);
	if (!days.length)
		throw new Error('Rule "' + id + '" applies to no days at all, so it could never run.');
	if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
		throw new Error('Rule "' + id + '" has a weekday outside 0 (Sunday) to 6 (Saturday).');
	}

	const patch = {};
	const given = input.patch && typeof input.patch === 'object' ? input.patch : {};
	const keys = Object.keys(given);
	if (keys.length > LIMITS.maxPatchKeys) {
		throw new Error(
			'Rule "' +
				id +
				'" changes ' +
				keys.length +
				' settings, and the limit is ' +
				LIMITS.maxPatchKeys +
				'.'
		);
	}
	for (const key of keys) {
		if (!SCHEDULABLE.includes(key)) {
			throw new Error(
				'Rule "' +
					id +
					'" tries to change "' +
					key +
					'", which is not a setting a schedule may change.'
			);
		}
		patch[key] = given[key];
	}
	if (!Object.keys(patch).length) throw new Error('Rule "' + id + '" changes nothing.');

	return {
		id,
		name,
		startTime,
		endTime,
		startDate,
		endDate,
		days,
		patch,
		enabled: input.enabled !== false
	};
}

export function validate(document) {
	if (!document || typeof document !== 'object') throw new Error('That is not a schedule.');
	if (document.schema !== SCHEMA_VERSION) {
		throw new Error(
			'This build reads schedule schema version ' +
				SCHEMA_VERSION +
				', and that document says ' +
				JSON.stringify(document.schema) +
				'.'
		);
	}
	const timeZone = String(document.timeZone || '');
	if (!timeZone) throw new Error('A schedule must state the timezone its times are read in.');
	try {
		formatterFor(timeZone);
	} catch {
		throw new Error('"' + timeZone + '" is not a timezone this system knows.');
	}
	const rules = Array.isArray(document.rules) ? document.rules : [];
	if (rules.length > LIMITS.maxRules) {
		throw new Error(
			'That schedule has ' + rules.length + ' rules, and the limit is ' + LIMITS.maxRules + '.'
		);
	}
	const seen = new Set();
	const validated = rules.map((r, i) => {
		const rule = validateRule(r, i);
		if (seen.has(rule.id)) throw new Error('Two rules share the identifier "' + rule.id + '".');
		seen.add(rule.id);
		return rule;
	});
	return { schema: SCHEMA_VERSION, timeZone, rules: validated };
}

export function empty(timeZone) {
	return {
		schema: SCHEMA_VERSION,
		timeZone: timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
		rules: []
	};
}

// ---------------------------------------------------------------- evaluation

/**
 * Whether a rule is in force at an instant, and which local day its window
 * started on.
 *
 * Returns `{ active, startedOn }` rather than a bare boolean, because the day
 * the window started is the thing the weekday and date checks apply to, and it
 * is not always the day it currently is.
 */
export function evaluate(rule, instant, timeZone) {
	if (rule.enabled === false) return { active: false, reason: 'disabled' };

	const now = wallClock(instant, timeZone);
	const start = parseTime(rule.startTime);
	const end = parseTime(rule.endTime);

	// Equal start and end means the whole day. Treating it as a zero-length
	// window would make the obvious way to write "always" mean "never".
	const allDay = start === end;
	const crossesMidnight = !allDay && end < start;

	let startedOn;
	if (allDay) {
		startedOn = {
			year: now.year,
			month: now.month,
			day: now.day,
			weekday: now.weekday,
			date: now.date
		};
	} else if (!crossesMidnight) {
		if (now.minutes < start || now.minutes >= end)
			return { active: false, reason: 'outside the window' };
		startedOn = {
			year: now.year,
			month: now.month,
			day: now.day,
			weekday: now.weekday,
			date: now.date
		};
	} else if (now.minutes >= start) {
		// The evening half: the window began today.
		startedOn = {
			year: now.year,
			month: now.month,
			day: now.day,
			weekday: now.weekday,
			date: now.date
		};
	} else if (now.minutes < end) {
		// The morning half: the window began YESTERDAY, and yesterday is the day
		// whose weekday and date have to satisfy the rule.
		startedOn = shiftDate(now.year, now.month, now.day, -1);
	} else {
		return { active: false, reason: 'outside the window' };
	}

	if (!rule.days.includes(startedOn.weekday)) {
		return {
			active: false,
			reason:
				'the window would have begun on ' +
				WEEKDAYS[startedOn.weekday] +
				', which this rule does not cover'
		};
	}
	if (rule.startDate && startedOn.date < rule.startDate)
		return { active: false, reason: 'before the start date' };
	if (rule.endDate && startedOn.date > rule.endDate)
		return { active: false, reason: 'after the end date' };

	return { active: true, startedOn: startedOn.date };
}

/**
 * The settings in force at an instant, and the rules that put them there.
 *
 * Every applied rule is reported, not only the winner, so the surface can show
 * why a value is what it is instead of leaving someone to guess which of six
 * rules is responsible.
 */
export function resolve(document, instant = new Date(), timeZone) {
	const schedule = document.schema === SCHEMA_VERSION ? document : validate(document);
	const zone = timeZone || schedule.timeZone;

	const applied = [];
	schedule.rules.forEach((rule, index) => {
		const verdict = evaluate(rule, instant, zone);
		if (verdict.active) applied.push({ rule, index, startedOn: verdict.startedOn });
	});

	// Documented precedence: more specific first, then later in the list.
	const ordered = [...applied].sort((a, b) => {
		const d = specificity(a.rule) - specificity(b.rule);
		return d !== 0 ? d : a.index - b.index;
	});

	const settings = {};
	const because = {};
	for (const entry of ordered) {
		for (const [key, value] of Object.entries(entry.rule.patch)) {
			settings[key] = value;
			because[key] = entry.rule.id;
		}
	}

	return {
		settings,
		because,
		applied: ordered.map((e) => ({
			id: e.rule.id,
			name: e.rule.name,
			specificity: specificity(e.rule),
			startedOn: e.startedOn
		})),
		timeZone: zone,
		at: wallClock(instant, zone)
	};
}

// ---------------------------------------------------------------- explaining

/**
 * What the rule does, in a sentence, including the parts that surprise people.
 *
 * The midnight-crossing sentence is here rather than in a help page because
 * that is where someone is when they need it.
 */
export function describe(rule, timeZone) {
	const start = parseTime(rule.startTime);
	const end = parseTime(rule.endTime);
	const allDay = start === end;
	const crosses = !allDay && end < start;

	const when = allDay
		? 'All day'
		: rule.startTime + ' to ' + rule.endTime + (crosses ? ' the next morning' : '');

	const days = rule.days.length === 7 ? 'every day' : rule.days.map((d) => WEEKDAYS[d]).join(', ');

	const dates =
		rule.startDate || rule.endDate
			? ' between ' +
				(rule.startDate || 'the beginning') +
				' and ' +
				(rule.endDate || 'no end date')
			: '';

	const midnight = crosses
		? ' Because it crosses midnight, the window belongs to the day it starts on: a ' +
			WEEKDAYS[rule.days[0]] +
			' window runs into the following morning without ' +
			WEEKDAYS[(rule.days[0] + 1) % 7] +
			' needing to be selected.'
		: '';

	return when + ', ' + days + dates + '. Times are read in ' + timeZone + '.' + midnight;
}

/**
 * What happens at a daylight-saving boundary, stated rather than discovered.
 *
 * Both answers follow from evaluating wall-clock time: a time that does not
 * exist cannot be reached, and a time that happens twice is reached on the
 * first occurrence and is already inside the window on the second.
 */
export const DST_NOTE = Object.freeze({
	en: 'Times are wall-clock times in the stated zone, not offsets from UTC. On the night the clocks go forward, a start time inside the skipped hour never arrives, so the rule does not run that day. On the night they go back, a start time inside the repeated hour is reached on its first occurrence; the window is already open when that hour comes round again, so it is not started a second time.',
	zh: '呢度用嘅係當地掛鐘時間，唔係同 UTC 嘅時差。撥快鐘嗰晚，跳咗嘅嗰個鐘頭根本冇出現過，所以嗰日唔會行。撥慢鐘嗰晚，重複嗰個鐘頭第一次到就開始，第二次到嗰陣個窗已經開咗，唔會再開多次。'
});
