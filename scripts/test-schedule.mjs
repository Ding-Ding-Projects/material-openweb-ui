#!/usr/bin/env node
// Scheduled settings, at the edges where they are actually decided.
//
// The middle of a schedule is easy and never wrong. Everything interesting
// happens at three boundaries, and each has a documented answer that this file
// exists to hold in place:
//
//   - midnight, where a window belongs to the day it STARTED on;
//   - the spring-forward hour, which does not exist;
//   - the autumn-back hour, which exists twice.
//
// Real zones are used rather than fabricated offsets. Europe/London moves on
// the last Sunday in March and October; Australia/Lord_Howe is here because its
// shift is thirty minutes rather than an hour, which catches an implementation
// that assumed the step is always sixty.
//
//   node scripts/test-schedule.mjs

import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const s = await import(pathToFileURL(join(process.cwd(), 'app', 'js', 'core', 'schedule.js')).href);

let failures = 0;
function check(name, ok, detail = '') {
	if (ok) console.log('  pass  ' + name);
	else {
		console.error('  FAIL  ' + name + (detail ? ' — ' + detail : ''));
		failures++;
	}
}
function throws(fn) {
	try {
		fn();
		return false;
	} catch {
		return true;
	}
}
function reason(fn) {
	try {
		fn();
		return '';
	} catch (e) {
		return e.message;
	}
}

const LONDON = 'Europe/London';

// A local wall-clock time in a zone, expressed as the instant it refers to.
// Built by search rather than arithmetic, so it stays correct across any
// offset rule without this file needing to know what the offset is.
function instantFor(zone, isoLocal) {
	let guess = new Date(isoLocal + 'Z').getTime();
	for (let i = 0; i < 4; i++) {
		const w = s.wallClock(new Date(guess), zone);
		const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
		const wanted = new Date(isoLocal + 'Z').getTime();
		const drift = asUtc - wanted;
		if (drift === 0) break;
		guess -= drift;
	}
	return new Date(guess);
}

// ---------- validation ----------

console.log('validation');

const good = {
	schema: 1,
	timeZone: LONDON,
	rules: [
		{ id: 'night', startTime: '20:00', endTime: '07:00', days: [5], patch: { theme: 'dark' } }
	]
};
check('a well-formed schedule validates', s.validate(good).rules.length === 1);
check(
	'a document from a different schema version is refused',
	throws(() => s.validate({ ...good, schema: 99 }))
);
check(
	'the refusal names both versions',
	/version 1/.test(reason(() => s.validate({ ...good, schema: 99 }))),
	reason(() => s.validate({ ...good, schema: 99 }))
);
check(
	'a schedule with no timezone is refused',
	throws(() => s.validate({ ...good, timeZone: '' }))
);
check(
	'an invented timezone is refused',
	throws(() => s.validate({ ...good, timeZone: 'Middle/Earth' }))
);
check(
	'a rule with no identifier is refused',
	throws(() => s.validateRule({ startTime: '01:00', endTime: '02:00', patch: { theme: 'dark' } }))
);
check(
	'two rules sharing an identifier are refused',
	throws(() => s.validate({ ...good, rules: [good.rules[0], { ...good.rules[0] }] }))
);
check(
	'a rule that changes a setting outside the allowed list is refused',
	throws(() => s.validateRule({ id: 'x', patch: { ollamaHost: 'http://elsewhere' } }))
);
check(
	'the refusal names the setting it would not change',
	/ollamaHost/.test(
		reason(() => s.validateRule({ id: 'x', patch: { ollamaHost: 'http://elsewhere' } }))
	)
);
check(
	'a rule that changes nothing is refused',
	throws(() => s.validateRule({ id: 'x', patch: {} }))
);
check(
	'a rule covering no days is refused',
	throws(() => s.validateRule({ id: 'x', days: [], patch: { theme: 'dark' } }))
);
check(
	'a weekday outside 0 to 6 is refused',
	throws(() => s.validateRule({ id: 'x', days: [7], patch: { theme: 'dark' } }))
);
check(
	'a rule ending before it starts is refused',
	throws(() =>
		s.validateRule({
			id: 'x',
			startDate: '2026-05-01',
			endDate: '2026-04-01',
			patch: { theme: 'dark' }
		})
	)
);
check(
	'a malformed time is refused',
	throws(() => s.validateRule({ id: 'x', startTime: '25:00', patch: { theme: 'dark' } }))
);
check(
	'a malformed date is refused',
	throws(() => s.validateRule({ id: 'x', startDate: '1st May', patch: { theme: 'dark' } }))
);
check(
	'more rules than the limit are refused',
	throws(() =>
		s.validate({
			...good,
			rules: Array.from({ length: 65 }, (_, i) => ({ id: 'r' + i, patch: { theme: 'dark' } }))
		})
	)
);
check(
	'duplicate weekdays are collapsed rather than kept',
	s.validateRule({ id: 'x', days: [1, 1, 1, 2], patch: { theme: 'dark' } }).days.join() === '1,2'
);

// ---------- an ordinary window ----------

console.log('');
console.log('an ordinary window');

const day = s.validateRule({
	id: 'day',
	startTime: '09:00',
	endTime: '17:00',
	patch: { theme: 'light' }
});

check(
	'inside the window it is active',
	s.evaluate(day, instantFor(LONDON, '2026-06-10T12:00'), LONDON).active
);
check(
	'at the start minute it is active',
	s.evaluate(day, instantFor(LONDON, '2026-06-10T09:00'), LONDON).active
);
check(
	'at the end minute it is already over, so the two ends do not both fire',
	!s.evaluate(day, instantFor(LONDON, '2026-06-10T17:00'), LONDON).active
);
check(
	'a minute before the start it is not active',
	!s.evaluate(day, instantFor(LONDON, '2026-06-10T08:59'), LONDON).active
);
check(
	'a disabled rule never fires',
	!s.evaluate({ ...day, enabled: false }, instantFor(LONDON, '2026-06-10T12:00'), LONDON).active
);

const always = s.validateRule({
	id: 'always',
	startTime: '00:00',
	endTime: '00:00',
	patch: { theme: 'dark' }
});
check(
	'an equal start and end means all day, not never',
	s.evaluate(always, instantFor(LONDON, '2026-06-10T03:33'), LONDON).active &&
		s.evaluate(always, instantFor(LONDON, '2026-06-10T21:15'), LONDON).active
);

// ---------- crossing midnight ----------

console.log('');
console.log('crossing midnight');

// Friday only, 20:00 to 07:00. 2026-06-12 is a Friday.
const friNight = s.validateRule({
	id: 'fri',
	startTime: '20:00',
	endTime: '07:00',
	days: [5],
	patch: { theme: 'dark' }
});

check(
	'Friday evening is inside the window',
	s.evaluate(friNight, instantFor(LONDON, '2026-06-12T22:30'), LONDON).active
);
check(
	'Saturday morning is STILL inside it, without Saturday being selected',
	s.evaluate(friNight, instantFor(LONDON, '2026-06-13T03:00'), LONDON).active
);
check(
	'the window is attributed to the Friday it began on',
	s.evaluate(friNight, instantFor(LONDON, '2026-06-13T03:00'), LONDON).startedOn === '2026-06-12',
	JSON.stringify(s.evaluate(friNight, instantFor(LONDON, '2026-06-13T03:00'), LONDON))
);
check(
	'Saturday EVENING is not inside it, because Saturday is not selected',
	!s.evaluate(friNight, instantFor(LONDON, '2026-06-13T22:30'), LONDON).active
);
check(
	'Friday morning is not inside it: that would belong to Thursday night',
	!s.evaluate(friNight, instantFor(LONDON, '2026-06-12T03:00'), LONDON).active
);
check(
	'the refusal explains which day the window would have begun on',
	/Thursday/.test(
		s.evaluate(friNight, instantFor(LONDON, '2026-06-12T03:00'), LONDON).reason || ''
	),
	s.evaluate(friNight, instantFor(LONDON, '2026-06-12T03:00'), LONDON).reason
);
check(
	'midday Friday, between the two halves, is outside',
	!s.evaluate(friNight, instantFor(LONDON, '2026-06-12T13:00'), LONDON).active
);

// A date range on a midnight-crossing rule is checked against the START day too.
const ranged = s.validateRule({
	id: 'ranged',
	startTime: '22:00',
	endTime: '02:00',
	startDate: '2026-06-12',
	endDate: '2026-06-12',
	patch: { theme: 'dark' }
});
check(
	'a one-day range covers the night that began inside it',
	s.evaluate(ranged, instantFor(LONDON, '2026-06-13T01:00'), LONDON).active
);
check(
	'a one-day range does not cover the night that began after it',
	!s.evaluate(ranged, instantFor(LONDON, '2026-06-13T23:00'), LONDON).active
);

// ---------- daylight saving ----------

console.log('');
console.log('daylight saving');

// London goes forward at 01:00 on 2026-03-29: 01:00 becomes 02:00, so no
// wall-clock time in the 01:00 hour exists that day.
const skipped = s.validateRule({
	id: 'skipped',
	startTime: '01:15',
	endTime: '01:45',
	patch: { theme: 'dark' }
});
let hitSkipped = false;
for (let m = 0; m < 6 * 60; m++) {
	const t = new Date(Date.UTC(2026, 2, 29, 0, 0) + m * 60000);
	if (s.evaluate(skipped, t, LONDON).active) hitSkipped = true;
}
check('a window inside the hour that does not exist never opens', !hitSkipped);

// The clock really does skip: 00:59 local is followed by 02:00 local.
const beforeJump = s.wallClock(new Date(Date.UTC(2026, 2, 29, 0, 59)), LONDON);
const afterJump = s.wallClock(new Date(Date.UTC(2026, 2, 29, 1, 0)), LONDON);
check(
	'the zone really does skip an hour on that date',
	beforeJump.hour === 0 && afterJump.hour === 2,
	beforeJump.hour + ':' + beforeJump.minute + ' then ' + afterJump.hour + ':' + afterJump.minute
);

// London goes back at 02:00 on 2026-10-25: the 01:00 hour happens twice.
const repeated = s.validateRule({
	id: 'repeated',
	startTime: '01:30',
	endTime: '03:00',
	patch: { theme: 'dark' }
});
const firstPass = new Date(Date.UTC(2026, 9, 25, 0, 40)); // 01:40 BST
const secondPass = new Date(Date.UTC(2026, 9, 25, 1, 40)); // 01:40 GMT, the same wall clock again
check(
	'the zone really does repeat an hour on that date',
	s.wallClock(firstPass, LONDON).hour === 1 && s.wallClock(secondPass, LONDON).hour === 1,
	s.wallClock(firstPass, LONDON).hour + ' and ' + s.wallClock(secondPass, LONDON).hour
);
check(
	'the window is open on the first pass through the repeated hour',
	s.evaluate(repeated, firstPass, LONDON).active
);
check(
	'it is still simply open on the second pass, not reopened',
	s.evaluate(repeated, secondPass, LONDON).active
);
check(
	'it closes at the wall-clock end time, once',
	!s.evaluate(repeated, new Date(Date.UTC(2026, 9, 25, 3, 30)), LONDON).active,
	'at ' + JSON.stringify(s.wallClock(new Date(Date.UTC(2026, 9, 25, 3, 30)), LONDON))
);

// A zone whose shift is half an hour, which breaks anything assuming sixty minutes.
const LORD_HOWE = 'Australia/Lord_Howe';
let halfHourOk = true;
try {
	const w = s.wallClock(new Date(Date.UTC(2026, 5, 1, 0, 0)), LORD_HOWE);
	halfHourOk = w.minute === 30 || w.minute === 0;
} catch {
	halfHourOk = false;
}
check('a zone with a half-hour offset is read correctly', halfHourOk);

// ---------- precedence ----------

console.log('');
console.log('precedence');

// The order is deliberately the OPPOSITE of the specificity order: most
// specific first, broadest last. An earlier version of this fixture listed them
// broad-to-specific, which meant list position and specificity happened to give
// the same answer — so removing specificity from the sort entirely left every
// check below green. A precedence test that cannot tell the two apart is not
// testing precedence.
const doc = s.validate({
	schema: 1,
	timeZone: LONDON,
	rules: [
		{
			id: 'holiday',
			startTime: '18:00',
			endTime: '23:00',
			startDate: '2026-06-10',
			endDate: '2026-06-10',
			patch: { theme: 'light' }
		},
		{ id: 'evenings', startTime: '18:00', endTime: '23:00', patch: { theme: 'dark' } },
		{ id: 'broad', startTime: '00:00', endTime: '00:00', patch: { theme: 'light' } }
	]
});

const midday = s.resolve(doc, instantFor(LONDON, '2026-06-11T12:00'), LONDON);
check(
	'with only the broad rule in force, it wins by default',
	midday.settings.theme === 'light',
	JSON.stringify(midday.settings)
);

const evening = s.resolve(doc, instantFor(LONDON, '2026-06-11T20:00'), LONDON);
check(
	'a time-limited rule beats an all-day one listed after it',
	evening.settings.theme === 'dark',
	JSON.stringify(evening.settings)
);
check(
	'the winning rule is named, not left to be guessed at',
	evening.because.theme === 'evenings',
	evening.because.theme
);
check(
	'every rule in force is reported, not only the winner',
	evening.applied.length === 2,
	JSON.stringify(evening.applied)
);

const holiday = s.resolve(doc, instantFor(LONDON, '2026-06-10T20:00'), LONDON);
check(
	'a date-limited rule beats a merely time-limited one listed after it',
	holiday.settings.theme === 'light' && holiday.applied.length === 3,
	JSON.stringify(holiday.settings)
);
check('and it says which rule did it', holiday.because.theme === 'holiday', holiday.because.theme);

const tie = s.validate({
	schema: 1,
	timeZone: LONDON,
	rules: [
		{ id: 'first', startTime: '09:00', endTime: '17:00', patch: { theme: 'light' } },
		{ id: 'second', startTime: '09:00', endTime: '17:00', patch: { theme: 'dark' } }
	]
});
check(
	'equally specific rules are resolved by position, later winning',
	s.resolve(tie, instantFor(LONDON, '2026-06-11T12:00'), LONDON).because.theme === 'second'
);

check(
	'specificity is counted rather than guessed at',
	s.specificity({ startDate: '2026-01-01', days: [1], startTime: '09:00', endTime: '17:00' }) ===
		4 && s.specificity({ days: [0, 1, 2, 3, 4, 5, 6], startTime: '00:00', endTime: '00:00' }) === 0
);

// ---------- what it says for itself ----------

console.log('');
console.log('what it says for itself');

const described = s.describe(friNight, LONDON);
check('a description states the timezone', described.includes(LONDON), described);
check(
	'a midnight-crossing rule explains itself where the rule is, not in a help page',
	/crosses midnight/.test(described),
	described
);
check(
	'a midnight-crossing description names the following day explicitly',
	/Saturday/.test(described),
	described
);
check(
	'the daylight-saving behaviour is documented in both languages',
	s.DST_NOTE.en.length > 100 && s.DST_NOTE.zh.length > 20
);
check(
	'the note says wall clock rather than offset',
	/wall-clock/.test(s.DST_NOTE.en) && /not offsets from UTC/.test(s.DST_NOTE.en)
);
check(
	'an empty schedule carries the schema version and a real zone',
	s.empty('Europe/London').schema === s.SCHEMA_VERSION &&
		s.empty('Europe/London').timeZone === 'Europe/London'
);

console.log('');
if (failures) {
	console.error(
		failures +
			' check(s) failed. A schedule that is wrong at an edge is wrong twice a year, silently.'
	);
	process.exit(1);
}
console.log(
	'Midnight, both daylight-saving boundaries and the precedence rule all behave as documented.'
);
process.exit(0);
