// RFC 6238 TOTP over RFC 4226 HOTP.
//
// Ported from the design prototype and widened to the full standard: SHA-1,
// SHA-256 and SHA-512, six to eight digits, arbitrary period. The prototype
// only did SHA-1/6/30 — which is what most issuers use, and exactly why the
// other combinations are the ones that silently produce rejected codes.
//
// An authenticator that is subtly wrong emits digits that are refused
// everywhere with no error to read, so this is verified against the published
// test vectors in `verify()` rather than trusted.

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(input) {
  const s = String(input || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const c of s) {
    const idx = B32.indexOf(c);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** Grouped in fours, the way every authenticator shows a secret for typing. */
export function groupSecret(secret) {
  return String(secret || '').replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}

const ALGOS = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' };

export function normaliseAlgorithm(name) {
  const key = String(name || 'SHA1').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!(key in ALGOS)) throw new Error('Unsupported algorithm: ' + name);
  return key;
}

async function hmac(algorithm, keyBytes, messageBytes) {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: ALGOS[algorithm] },
    false,
    ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, messageBytes));
}

/** RFC 4226 HOTP. `counter` is a JS number; exact to 2^53, far past any clock. */
export async function hotp(secretBytes, counter, { algorithm = 'SHA1', digits = 6 } = {}) {
  if (!secretBytes || !secretBytes.length) throw new Error('The secret is empty.');
  if (digits < 6 || digits > 8) throw new Error('Digits must be between 6 and 8.');
  const algo = normaliseAlgorithm(algorithm);

  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  // Split across two 32-bit writes: a single setUint32 would silently drop the
  // high half, which nothing notices until the year the counter needs it.
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);

  const digest = await hmac(algo, secretBytes, new Uint8Array(buf));
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** RFC 6238 TOTP. `atMs` defaults to now; `t0` is the epoch offset. */
export async function totp(secret, { algorithm = 'SHA1', digits = 6, period = 30, atMs = Date.now(), t0 = 0 } = {}) {
  const bytes = typeof secret === 'string' ? base32Decode(secret) : secret;
  const counter = Math.floor((Math.floor(atMs / 1000) - t0) / period);
  return hotp(bytes, counter, { algorithm, digits });
}

/** Seconds remaining in the current window — for a countdown that is a number. */
export function secondsRemaining(period = 30, atMs = Date.now()) {
  return period - (Math.floor(atMs / 1000) % period);
}

/** The next window's code, so nobody starts typing one with two seconds left. */
export async function nextCode(secret, opts = {}) {
  const period = opts.period ?? 30;
  return totp(secret, { ...opts, atMs: (opts.atMs ?? Date.now()) + period * 1000 });
}

// ---------------------------------------------------------------- otpauth URI

export function buildUri({ issuer, account, secret, algorithm = 'SHA1', digits = 6, period = 30 }) {
  const label = encodeURIComponent(issuer ? `${issuer}:${account}` : account);
  const params = new URLSearchParams({
    secret: String(secret).replace(/\s+/g, ''),
    algorithm: normaliseAlgorithm(algorithm),
    digits: String(digits),
    period: String(period)
  });
  if (issuer) params.set('issuer', issuer);
  return `otpauth://totp/${label}?${params.toString()}`;
}

/**
 * Parses an otpauth:// URI. Parameters carried by the URI are honoured rather
 * than overwritten with defaults — an issuer that specifies SHA-256 and eight
 * digits means it, and quietly using 6/SHA-1 produces codes it will reject.
 */
export function parseUri(uri) {
  const text = String(uri || '').trim();
  if (!/^otpauth:\/\/totp\//i.test(text)) throw new Error('Not an otpauth://totp/ URI.');
  const url = new URL(text);
  const label = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const [maybeIssuer, maybeAccount] = label.includes(':') ? label.split(':') : [null, label];
  const p = url.searchParams;
  const secret = (p.get('secret') || '').replace(/\s+/g, '');
  if (!secret) throw new Error('The URI carries no secret.');
  const digits = Number(p.get('digits') || 6);
  const period = Number(p.get('period') || 30);
  if (!Number.isInteger(digits) || digits < 6 || digits > 8) throw new Error('Digits must be 6, 7 or 8.');
  if (!Number.isInteger(period) || period < 1 || period > 300) throw new Error('Period must be between 1 and 300 seconds.');
  return {
    issuer: p.get('issuer') || maybeIssuer || '',
    account: maybeAccount || '',
    secret,
    algorithm: normaliseAlgorithm(p.get('algorithm') || 'SHA1'),
    digits,
    period
  };
}

// ---------------------------------------------------------------- clock check

/**
 * Codes come from the system clock, and a skewed clock is the failure nobody
 * diagnoses: the digits look fine and are refused everywhere. This reports the
 * skew rather than letting the surface emit confidently wrong codes.
 */
export async function clockSkewSeconds(fetchImpl = fetch) {
  try {
    const before = Date.now();
    const res = await fetchImpl('https://www.cloudflare.com/cdn-cgi/trace', { cache: 'no-store' });
    const after = Date.now();
    const text = await res.text();
    const line = text.split('\n').find((l) => l.startsWith('ts='));
    if (!line) return null;
    const remoteMs = Number(line.slice(3)) * 1000;
    const localMs = (before + after) / 2;
    return Math.round((localMs - remoteMs) / 1000);
  } catch {
    // Offline is the normal state for this application, and not knowing the
    // skew is not an error — it is simply unknown, and says so.
    return null;
  }
}

/**
 * Watches for the clock MOVING, without asking anyone.
 *
 * The network check answers a different question — "is this clock right?" — and
 * cannot answer it at all offline, which is this application's normal state. So
 * it was the only detection there was, and offline the surface simply said the
 * accuracy was unknown and then never mentioned it again.
 *
 * This answers "did this clock just change?", locally and always. A monotonic
 * reading and a wall-clock reading are recorded together; if the two disagree
 * about how much time has passed, the wall clock was moved. That is exactly the
 * contract's own verification step — set the system clock forward and confirm
 * the surface says so — and it needs no network at all.
 *
 * It cannot tell you a clock that was ALREADY wrong when the application
 * started. Only the network check can, and the surface says which of the two it
 * is reporting rather than blurring them together.
 */
export function createClockWatch({ now = () => Date.now(), monotonic = () => performance.now() } = {}) {
  let wall = now();
  let mono = monotonic();

  return {
    /**
     * How far the wall clock has moved beyond the time that actually elapsed,
     * in seconds. Zero, or near it, in ordinary running.
     */
    check() {
      const nextWall = now();
      const nextMono = monotonic();
      const wallElapsed = nextWall - wall;
      const monoElapsed = nextMono - mono;
      wall = nextWall;
      mono = nextMono;
      const jumpMs = wallElapsed - monoElapsed;
      // A second of tolerance, because a sleeping tab and a busy machine both
      // drift by a few hundred milliseconds without anything being wrong.
      return Math.abs(jumpMs) < 1000 ? 0 : Math.round(jumpMs / 1000);
    },
    reset() {
      wall = now();
      mono = monotonic();
    }
  };
}

// ---------------------------------------------------------------- self-check

/**
 * The RFC 6238 Appendix B test vectors.
 *
 * The seeds are the ASCII strings the RFC specifies, repeated to the length
 * each algorithm needs — a detail that trips most implementations, because
 * using the 20-byte SHA-1 seed for SHA-256 produces plausible, wrong digits.
 */
const RFC_SEED = '12345678901234567890';

function asciiSeedFor(algorithm) {
  const lengths = { SHA1: 20, SHA256: 32, SHA512: 64 };
  const want = lengths[algorithm];
  let s = '';
  while (s.length < want) s += RFC_SEED;
  return new TextEncoder().encode(s.slice(0, want));
}

export const RFC6238_VECTORS = [
  { time: 59, algorithm: 'SHA1', expected: '94287082' },
  { time: 59, algorithm: 'SHA256', expected: '46119246' },
  { time: 59, algorithm: 'SHA512', expected: '90693936' },
  { time: 1111111109, algorithm: 'SHA1', expected: '07081804' },
  { time: 1111111109, algorithm: 'SHA256', expected: '68084774' },
  { time: 1111111109, algorithm: 'SHA512', expected: '25091201' },
  { time: 1111111111, algorithm: 'SHA1', expected: '14050471' },
  { time: 1111111111, algorithm: 'SHA256', expected: '67062674' },
  { time: 1111111111, algorithm: 'SHA512', expected: '99943326' },
  { time: 1234567890, algorithm: 'SHA1', expected: '89005924' },
  { time: 1234567890, algorithm: 'SHA256', expected: '91819424' },
  { time: 1234567890, algorithm: 'SHA512', expected: '93441116' },
  { time: 2000000000, algorithm: 'SHA1', expected: '69279037' },
  { time: 2000000000, algorithm: 'SHA256', expected: '90698825' },
  { time: 2000000000, algorithm: 'SHA512', expected: '38618901' },
  { time: 20000000000, algorithm: 'SHA1', expected: '65353130' },
  { time: 20000000000, algorithm: 'SHA256', expected: '77737706' },
  { time: 20000000000, algorithm: 'SHA512', expected: '47863826' }
];

/** Runs every published vector. Returns { ok, results }. */
export async function verify() {
  const results = [];
  for (const v of RFC6238_VECTORS) {
    const got = await hotp(asciiSeedFor(v.algorithm), Math.floor(v.time / 30), {
      algorithm: v.algorithm,
      digits: 8
    });
    results.push({ ...v, got, pass: got === v.expected });
  }
  return { ok: results.every((r) => r.pass), results };
}
