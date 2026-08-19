#!/usr/bin/env node
// Runs the RFC 6238 published test vectors against the shipped implementation.
//
// This is the gate the authenticator's honesty rests on. An authenticator that
// is subtly wrong emits digits that every service refuses, with no error
// anywhere to read — so "it looks like it works" is not evidence, and these
// eighteen vectors are.
//
//   node scripts/test-totp.mjs

import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mod = await import(pathToFileURL(join(process.cwd(), 'app', 'js', 'core', 'totp.js')).href);

const NL = String.fromCharCode(10);
let failures = 0;

// ---------- RFC 6238 Appendix B ----------

const { ok, results } = await mod.verify();
for (const r of results) {
  const line = `t=${String(r.time).padStart(11)}  ${r.algorithm.padEnd(6)}  expected ${r.expected}  got ${r.got}`;
  if (r.pass) {
    console.log('  pass  ' + line);
  } else {
    console.error('  FAIL  ' + line);
    failures++;
  }
}
console.log('');
console.log(results.filter((r) => r.pass).length + '/' + results.length + ' RFC 6238 vectors pass');

// ---------- round trips and boundaries ----------

function check(name, condition, detail = '') {
  if (condition) {
    console.log('  pass  ' + name);
  } else {
    console.error('  FAIL  ' + name + (detail ? ' — ' + detail : ''));
    failures++;
  }
}

console.log('');

// base32 round trip
const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06]);
const encoded = mod.base32Encode(bytes);
const decoded = mod.base32Decode(encoded);
check('base32 round trips', Buffer.from(decoded).equals(Buffer.from(bytes)), encoded);

// base32 ignores the spacing a human types
check(
  'base32 ignores grouping whitespace',
  Buffer.from(mod.base32Decode('JBSW Y3DP')).equals(Buffer.from(mod.base32Decode('JBSWY3DP')))
);

// otpauth URI round trip, non-default parameters preserved
const uri = mod.buildUri({
  issuer: 'Ding Ding Projects',
  account: 'someone@example.test',
  secret: 'JBSWY3DPEHPK3PXP',
  algorithm: 'SHA256',
  digits: 8,
  period: 45
});
const parsed = mod.parseUri(uri);
check('otpauth URI keeps the issuer', parsed.issuer === 'Ding Ding Projects', parsed.issuer);
check('otpauth URI keeps the account', parsed.account === 'someone@example.test', parsed.account);
check('otpauth URI keeps a non-default algorithm', parsed.algorithm === 'SHA256', parsed.algorithm);
check('otpauth URI keeps a non-default digit count', parsed.digits === 8, String(parsed.digits));
check('otpauth URI keeps a non-default period', parsed.period === 45, String(parsed.period));

// The parameters an issuer supplies must not be overwritten with defaults; a
// service that asked for 8/SHA-256 rejects a 6-digit SHA-1 code with no
// explanation, which is the single most common wrong-code cause.
const defaulted = mod.parseUri('otpauth://totp/Example:me?secret=JBSWY3DPEHPK3PXP');
check('a URI without parameters falls back to the usual defaults', defaulted.algorithm === 'SHA1' && defaulted.digits === 6 && defaulted.period === 30);

// rejections
function throws(fn) {
  try { fn(); return false; } catch { return true; }
}
check('a URI with no secret is rejected', throws(() => mod.parseUri('otpauth://totp/Example:me?issuer=Example')));
check('a non-otpauth URI is rejected', throws(() => mod.parseUri('https://example.test/')));
check('an out-of-range digit count is rejected', throws(() => mod.parseUri('otpauth://totp/x?secret=JBSWY3DP&digits=9')));
check('an unsupported algorithm is rejected', throws(() => mod.normaliseAlgorithm('MD5')));

let emptyRejected = false;
try { await mod.totp(''); } catch { emptyRejected = true; }
check('an empty secret is rejected', emptyRejected);

// period boundary: the code changes exactly on the boundary and not before.
//
// `base` must land exactly on a window boundary or these assertions test
// nothing. 1700000000 is NOT one — it sits 20 seconds into a window — so an
// earlier version of this file failed against a correct implementation. The
// boundary below is computed rather than assumed.
const secret = 'JBSWY3DPEHPK3PXP';
const PERIOD = 30;
const base = Math.floor(1700000000 / PERIOD) * PERIOD * 1000;
check('the test base really is a window boundary', (base / 1000) % PERIOD === 0, String(base));
const atStart = await mod.totp(secret, { atMs: base });
const nearEnd = await mod.totp(secret, { atMs: base + 29_999 });
const justAfter = await mod.totp(secret, { atMs: base + 30_000 });
check('the code is stable within its window', atStart === nearEnd);
check('the code changes at the window boundary', atStart !== justAfter);

// the countdown is a real number of seconds, never colour-only
check('seconds remaining is within the period', (() => {
  const s = mod.secondsRemaining(30, base + 10_000);
  return s === 20;
})(), String(mod.secondsRemaining(30, base + 10_000)));

// the next code peek really is the next window's
check('the next-code peek matches the following window', (await mod.nextCode(secret, { atMs: base })) === justAfter);

// digits are respected
const six = await mod.totp(secret, { atMs: base, digits: 6 });
const eight = await mod.totp(secret, { atMs: base, digits: 8 });
check('six digits are six digits', /^\d{6}$/.test(six), six);
check('eight digits are eight digits', /^\d{8}$/.test(eight), eight);

// grouping is presentation only
check('grouping does not change the secret', mod.base32Decode(mod.groupSecret(secret)).length === mod.base32Decode(secret).length);

// ---------- the clock ----------
//
// A skewed clock is the failure nobody diagnoses: the digits look perfectly
// fine and every service refuses them. The only detection used to be a network
// fetch, which cannot answer at all offline — this application's normal state —
// so offline the surface said "unknown" once and never mentioned the clock
// again, however far it drifted afterwards.
//
// These two questions are different and are now answered separately. "Is this
// clock right?" needs the network. "Did this clock just move?" needs nothing,
// and is the one the contract's verification step actually asks about.

console.log('');
console.log('the clock');

function fakeClock(startWall = 1_700_000_000_000, startMono = 0) {
  let wall = startWall;
  let mono = startMono;
  return {
    watch: mod.createClockWatch({ now: () => wall, monotonic: () => mono }),
    /** Ordinary time passing: both readings advance together. */
    pass(seconds) { wall += seconds * 1000; mono += seconds * 1000; },
    /** Someone changes the system clock: only the wall reading moves. */
    jump(seconds) { wall += seconds * 1000; }
  };
}

const c1 = fakeClock();
c1.pass(60);
check('ordinary time passing is not a jump', c1.watch.check() === 0, String(c1.watch.check()));

const c2 = fakeClock();
c2.pass(5);
c2.jump(3600);
check('the clock being set an hour forward is detected', c2.watch.check() === 3600, String(c2.watch.check()));

const c3 = fakeClock();
c3.pass(5);
c3.jump(-900);
check('the clock being set backward is detected too', c3.watch.check() === -900, String(c3.watch.check()));

const c4 = fakeClock();
c4.pass(30);
c4.jump(0.4);
check('a fraction of a second is tolerated rather than reported as a jump',
  c4.watch.check() === 0, String(c4.watch.check()));

const c5 = fakeClock();
c5.pass(10);
c5.jump(120);
c5.watch.check();
c5.pass(10);
check('after a jump is reported, ordinary time is ordinary again',
  c5.watch.check() === 0, String(c5.watch.check()));

check('it needs no network at all', (() => {
  const before = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('the clock watch must not reach the network'); };
  try {
    const c = fakeClock();
    c.pass(5);
    c.jump(60);
    return c.watch.check() === 60;
  } finally {
    globalThis.fetch = before;
  }
})());

const surface = readFileSync(join(process.cwd(), 'app', 'js', 'pages', 'authenticator.js'), 'utf8');
check('the surface watches for a jump on every tick, not once at render',
  /watch\.check\(\)/.test(surface) && /setInterval/.test(surface));
check('a network verdict ages rather than continuing to reassure',
  /minutes ago|when checked/.test(surface),
  'a line saying "within 2s" measured forty minutes ago is a claim about forty minutes ago');
check('a jump invalidates the network verdict, which was measured against the old clock',
  /networkSkew = null;/.test(surface));
check('the clock can be re-checked on demand rather than only at startup',
  /Check against network time now/.test(surface));
check('the two questions are reported as two facts rather than blurred together',
  /Whether it has MOVED is watched continuously/.test(surface));

// The grouping fix lives on the page rather than in this module, so it is
// asserted there instead of with a check here that would pass on anything.
check('the page groups a code by a rule that covers seven and eight digits too',
  /function groupCode/.test(surface) && /slice\(0, 4\)/.test(surface),
  'a single non-global replace left "123 4567" for the lengths the feature offers');

console.log('');
if (failures) {
  console.error(failures + ' check(s) failed.');
  process.exit(1);
}
console.log('Every RFC 6238 vector and every boundary check passed.');
process.exit(0);
