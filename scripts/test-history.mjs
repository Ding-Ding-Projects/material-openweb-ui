#!/usr/bin/env node
// Local version history: append-only, and provably so.
//
// The claim "append-only" is easy to make and easy to break without noticing.
// Three ways it breaks here, all of them invisible from the surface:
//
//   - a restore that rolls the log back, erasing the evidence that the restore
//     happened — exactly what someone looking at a history after an accident
//     needs to see;
//   - a label written onto the entry it describes, which changes that entry's
//     content and invalidates every hash after it;
//   - a prune that quietly makes the log shorter with no record that anything
//     was removed.
//
// And one that is not about appending at all: a one-time-code secret written
// into the history is a secret in a file, which is the exact thing the
// authenticator refuses to do. Recording it here would route around that
// decision rather than honour it.
//
//   node scripts/test-history.mjs

import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const H = await import(pathToFileURL(join(process.cwd(), 'app', 'js', 'core', 'history.js')).href);

let failures = 0;
function check(name, ok, detail = '') {
  if (ok) console.log('  pass  ' + name);
  else { console.error('  FAIL  ' + name + (detail ? ' — ' + detail : '')); failures++; }
}
async function throwsAsync(fn) {
  try { await fn(); return false; } catch { return true; }
}

// Timestamps are passed in rather than taken from the clock, so the same run
// produces the same hashes and a failure is reproducible.
const T = (n) => '2026-08-' + String(10 + n).padStart(2, '0') + 'T12:00:00.000Z';

async function build() {
  let log = H.empty();
  ({ log } = await H.record(log, { action: 'setting', target: 'theme', before: 'system', after: 'dark', at: T(1) }));
  ({ log } = await H.record(log, { action: 'setting', target: 'language', before: 'English', after: 'Bilingual', at: T(2) }));
  ({ log } = await H.record(log, { action: 'tab', target: 'converter', before: null, after: { page: 'converter' }, at: T(3) }));
  ({ log } = await H.record(log, { action: 'setting', target: 'theme', before: 'dark', after: 'light', at: T(4) }));
  return log;
}

// ---------- appending ----------

console.log('appending');

let log = await build();
check('every entry is recorded', log.entries.length === 4, String(log.entries.length));
check('sequence numbers run from one, without gaps',
  log.entries.map((e) => e.seq).join(',') === '1,2,3,4');
check('every entry carries a hash', log.entries.every((e) => /^[0-9a-f]{64}$/.test(e.hash)));
check('the first entry has no parent', log.entries[0].parent === '');
check('each later entry carries the hash of the one before it',
  log.entries.slice(1).every((e, i) => e.parent === log.entries[i].hash));

const before = JSON.stringify(log.entries);
await H.record(log, { action: 'setting', target: 'x', before: 1, after: 2, at: T(5) });
check('recording does not mutate the log it was given',
  JSON.stringify(log.entries) === before);

check('an entry with no action is refused',
  await throwsAsync(() => H.record(log, { target: 'x', after: 1 })));

// ---------- the chain can be checked ----------

console.log('');
console.log('the chain');

check('an untouched chain verifies', (await H.verify(log)).ok === true);

const tampered = { ...log, entries: log.entries.map((e, i) => (i === 1 ? { ...e, after: 'English' } : e)) };
const verdict = await H.verify(tampered);
check('an edited entry is detected', verdict.ok === false, JSON.stringify(verdict));
check('and it says which entry', verdict.seq === 2, String(verdict.seq));
check('the reason says the entry was changed, not merely that something is wrong',
  /has been changed/.test(verdict.reason), verdict.reason);

const removed = { ...log, entries: [log.entries[0], log.entries[2], log.entries[3]] };
check('an entry removed from the middle is detected',
  (await H.verify(removed)).ok === false);

const reordered = { ...log, entries: [log.entries[1], log.entries[0], log.entries[2], log.entries[3]] };
check('entries put in the wrong order are detected',
  (await H.verify(reordered)).ok === false);

check('the same content always hashes the same, whatever order the keys were built in',
  H.canonical({ seq: 1, at: 'x', action: 'a', target: 't', before: { b: 1, a: 2 }, after: null }) ===
  H.canonical({ after: null, before: { a: 2, b: 1 }, target: 't', action: 'a', at: 'x', seq: 1 }));

// ---------- restoring ----------

console.log('');
console.log('restoring');

const restored = await H.restore(log, 1, { at: T(6) });
check('a restore appends rather than rolling the log back',
  restored.log.entries.length === log.entries.length + 1, String(restored.log.entries.length));
check('the entry being restored from is still there, untouched',
  JSON.stringify(restored.log.entries[0]) === JSON.stringify(log.entries[0]));
check('the restore returns the value it is putting back',
  restored.restored === 'system', JSON.stringify(restored.restored));
check('the new entry records the restore as what happened',
  restored.log.entries[4].action === 'restore');
check('and it says which entry it came from',
  /theme/.test(restored.log.entries[4].target), restored.log.entries[4].target);
check('the chain still verifies after a restore', (await H.verify(restored.log)).ok === true);
check('restoring an entry that does not exist is refused',
  await throwsAsync(() => H.restore(log, 999)));

// ---------- labelling ----------

console.log('');
console.log('labelling');

const labelled = await H.label(log, 2, 'Before the trip', { at: T(7) });
check('a label appends rather than editing the entry it describes',
  labelled.log.entries.length === log.entries.length + 1);
check('the entry it describes is byte-for-byte unchanged',
  JSON.stringify(labelled.log.entries[1]) === JSON.stringify(log.entries[1]));
check('the chain still verifies after labelling', (await H.verify(labelled.log)).ok === true);
check('the label in force is the one that was applied',
  H.labelFor(labelled.log, 2) === 'Before the trip', H.labelFor(labelled.log, 2));

const relabelled = await H.label(labelled.log, 2, 'Actually, after the trip', { at: T(8) });
check('a second label supersedes the first without removing it',
  H.labelFor(relabelled.log, 2) === 'Actually, after the trip' &&
  relabelled.log.entries.filter((e) => e.action === 'label').length === 2);
check('a label longer than the limit is trimmed rather than refused',
  (await H.label(log, 1, 'x'.repeat(500))).log.entries.slice(-1)[0].after.length === H.LIMITS.maxLabelLength);

// ---------- what is never recorded ----------

console.log('');
console.log('what is never recorded');

const secretish = await H.record(H.empty(), {
  action: 'authenticator',
  target: 'added',
  before: null,
  after: { issuer: 'Example', account: 'me', secret: 'JBSWY3DPEHPK3PXP', digits: 6 },
  at: T(1)
});
const written = JSON.stringify(secretish.log);
check('a one-time-code secret is not written into the history',
  !written.includes('JBSWY3DPEHPK3PXP'), written.slice(0, 160));
check('the field is present and marked, rather than dropped without trace',
  secretish.log.entries[0].after.secret === '[not recorded]');
check('everything else about the entry survives',
  secretish.log.entries[0].after.issuer === 'Example' && secretish.log.entries[0].after.digits === 6);
check('a secret nested deeper is caught too', (() => {
  const r = H.redact({ a: { b: { c: { password: 'hunter2', keep: 'yes' } } } });
  return r.a.b.c.password === '[not recorded]' && r.a.b.c.keep === 'yes';
})());
check('an enormous value is truncated and says how much was left out', (() => {
  const r = H.redact('x'.repeat(20000));
  return r.length < 20000 && /more characters not recorded/.test(r);
})());

// ---------- reading ----------

console.log('');
console.log('reading');

const acts = H.actions(log);
check('the action filter is derived from what is actually recorded',
  acts.map((a) => a.action).sort().join(',') === 'setting,tab', JSON.stringify(acts));
check('each action carries its real count',
  acts.find((a) => a.action === 'setting').count === 3, JSON.stringify(acts));
check('an action nobody has performed is not offered',
  !acts.some((a) => a.action === 'restore'));
check('once one is performed, it appears',
  H.actions(restored.log).some((a) => a.action === 'restore'));

const dayList = H.days(log);
check('the days offered are days that have entries', dayList.length === 4);
check('days are newest first', dayList[0].day > dayList[dayList.length - 1].day);

check('filtering by action returns only that action',
  H.filter(log, { action: 'setting' }).length === 3);
check('filtering by date range is inclusive at both ends',
  H.filter(log, { from: '2026-08-11', to: '2026-08-13' }).length === 3,
  String(H.filter(log, { from: '2026-08-11', to: '2026-08-13' }).length));
check('filtering by text searches the values, not only the labels',
  H.filter(log, { test: (s) => s.includes('Bilingual') }).length === 1);
check('the filters combine rather than replacing one another',
  H.filter(log, { action: 'setting', test: (s) => s.includes('theme') }).length === 2);

// ---------- diff ----------

console.log('');
console.log('diff');

const d = H.diff({ theme: 'dark', language: 'English', keep: 1 }, { theme: 'light', funny: 3, keep: 1 });
check('a changed field is reported', d.some((x) => x.key === 'theme' && x.kind === 'changed'));
check('a removed field is reported', d.some((x) => x.key === 'language' && x.kind === 'removed'));
check('an added field is reported', d.some((x) => x.key === 'funny' && x.kind === 'added'));
check('an unchanged field is NOT reported, which is what makes a diff readable',
  !d.some((x) => x.key === 'keep'), JSON.stringify(d.map((x) => x.key)));
check('two identical objects diff to nothing', H.diff({ a: 1 }, { a: 1 }).length === 0);
check('two scalars diff to one entry', H.diff('a', 'b').length === 1);

// ---------- pruning ----------

console.log('');
console.log('pruning');

const pruned = await H.prune(log, { before: '2026-08-13', at: T(9) });
check('old entries are removed', pruned.removed === 2, String(pruned.removed));
check('the prune itself is recorded, so the log is honestly incomplete rather than quietly short',
  pruned.log.entries.some((e) => e.action === 'prune'));
check('the record says how many went',
  /2 entries removed/.test(pruned.log.entries.slice(-1)[0].label), pruned.log.entries.slice(-1)[0].label);
check('the chain is rebuilt and still verifies', (await H.verify(pruned.log)).ok === true);
check('pruning with no date is refused', await throwsAsync(() => H.prune(log, {})));

const withLabel = await H.label(log, 1, 'Keep this one', { at: T(2) });
const prunedKeeping = await H.prune(withLabel.log, { before: '2026-08-20', keepLabelled: true, at: T(9) });
check('a labelled entry survives a prune that would otherwise take it',
  prunedKeeping.log.entries.some((e) => e.seq === 1),
  prunedKeeping.log.entries.map((e) => e.seq).join(','));

const prunedAll = await H.prune(withLabel.log, { before: '2026-08-20', keepLabelled: false, at: T(9) });
check('and it does not survive one that says it is including labelled entries',
  !prunedAll.log.entries.some((e) => e.seq === 1 && e.action === 'setting'));

// ---------- export ----------

console.log('');
console.log('export');

const exported = H.forExport(secretish.log);
check('the export produces one row per entry', exported.rows.length === secretish.log.entries.length);
check('the export carries no secret, because the history never had one',
  !JSON.stringify(exported.rows).includes('JBSWY3DPEHPK3PXP'));
check('the omission is stated rather than left to be noticed',
  exported.omitted.length > 0 && /not recorded/.test(exported.omitted[0]), JSON.stringify(exported.omitted));
check('the omission names the fields it applies to',
  H.NEVER_RECORDED.every((f) => exported.omitted[0].includes(f)), exported.omitted[0]);
check('each row carries its hash, so an export can be checked against the log',
  exported.rows.every((r) => /^[0-9a-f]{64}$/.test(r.hash)));

// ---------- the cap ----------

console.log('');
console.log('the cap');

let big = H.empty();
for (let i = 0; i < 12; i++) {
  ({ log: big } = await H.record(big, { action: 'setting', target: 'n' + i, before: i, after: i + 1, at: T(1) }));
}
check('a log under the cap keeps everything', big.entries.length === 12);
check('a log that has never dropped anything says so', !big.truncated);

console.log('');
if (failures) {
  console.error(failures + ' check(s) failed. A history that can be quietly rewritten is not a record.');
  process.exit(1);
}
console.log('History only ever grows, the chain detects an edit, and no secret is ever written into it.');
process.exit(0);
