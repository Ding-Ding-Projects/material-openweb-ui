#!/usr/bin/env node
// The five rules that are the entire safety of the unlock ladder, plus the
// credential rules the locks themselves rest on.
//
// From the contract: "These five lines are the whole safety of the feature. An
// implementation that keeps the games and drops any one of them has built a
// second, far weaker password." That is a very easy thing to do by accident
// while making the games nicer, so it is checked rather than remembered.
//
//   node scripts/test-locks.mjs

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
let failures = 0;

function check(name, ok, detail = '') {
  if (ok) console.log('  pass  ' + name);
  else { console.error('  FAIL  ' + name + (detail ? ' — ' + detail : '')); failures++; }
}

function read(rel) {
  const p = join(ROOT, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

/**
 * Comments removed.
 *
 * An absence check has to look at code, not prose. Two of these assertions
 * originally failed on a correct implementation because the word "master"
 * appears in the comment explaining that there is no master credential, and
 * "ladder" appears in the comment explaining that the ladder must not touch the
 * escalation. A guard that fails when you document the rule teaches people to
 * delete the documentation.
 */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');
}

const core = read('app/js/core/locks.js');
const ui = read('app/js/locks-ui.js');
const coreCode = code(core);
const uiCode = code(ui);

check('the locks core exists', core.length > 0);
check('the lock interface exists', ui.length > 0);

// ---------- credentials ----------

console.log('');
console.log('credentials');

check('a password is stored as a hash, never as the password',
  /sha256Hex\(password\)/.test(core) && !/lock\.password\s*=/.test(core));
check('the stored hash is SHA-256', /digest\('SHA-256'/.test(core));
check('a short password is refused', /password\.length < 4/.test(core));
check('listing locks never exposes the secret or the hash',
  /secret:\s*undefined[\s\S]{0,40}hash:\s*undefined/.test(core));
check('each lock is keyed independently, with no master credential',
  /\[id\]:\s*lock/.test(coreCode) && !/masterCredential|masterKey|MASTER_/.test(coreCode));
check('one-time-code verification allows a small clock skew',
  /\[-1, 0, 1\]/.test(core));

// ---------- the five ladder rules ----------

console.log('');
console.log('the ladder');

// 1. clears the waiting, never the credential
const clearWait = (coreCode.match(/export function clearWait\([\s\S]*?\n}/) || [''])[0];
check('rule 1: clearWait touches only the wait', /record\.until\s*=\s*0/.test(clearWait));
check('rule 1: clearWait never removes or rewrites a credential',
  !/hash|secret|remove\(|create\(/.test(clearWait), clearWait.replace(/\s+/g, ' ').slice(0, 90));
check('rule 1: winning is described as clearing the wait and nothing else',
  /only the wait/i.test(ui));
check('rule 1: no session or cookie is minted anywhere in the ladder',
  !/document\.cookie|sessionStorage\.setItem|signIn\(|authenticate\(/.test(uiCode));

// 2. never refunds the attempt budget
check('rule 2: the ladder never resets the attempt counter',
  !/record\.count\s*=\s*0/.test(clearWait) && !/attempts\.delete/.test(clearWait));

// 3. budgeted, and the cap is real
check('rule 3: the ladder is capped per rolling hour', /LADDER_CAP\s*=\s*\d+/.test(core));
check('rule 3: the window really is an hour', /3_600_000|3600000/.test(core));
check('rule 3: a spend is refused once the cap is reached',
  /if \(!b\.remaining\) return false/.test(core));
check('rule 3: the interface refuses to open the ladder with no budget left',
  /!budget\.remaining/.test(ui));

// 4. never slows the escalation it skips
const tryUnlock = (coreCode.match(/export async function tryUnlock\([\s\S]*?\n}/) || [''])[0];
check('rule 4: the lockout escalates exponentially and is capped',
  /2 \*\* \(record\.count - 2\)/.test(tryUnlock) && /Math\.min\(/.test(tryUnlock));
check('rule 4: the ladder does not touch the escalation curve',
  !/LADDER|ladder/i.test(tryUnlock));

// 5. single-use challenges
check('rule 5: each challenge carries a nonce', /const thisNonce = nonce/.test(ui));
check('rule 5: a stale challenge grades nothing',
  /if \(thisNonce !== nonce\) return/.test(ui));
check('rule 5: the nonce is consumed before grading',
  /nonce = Math\.random\(\)[\s\S]{0,120}(finishWon|rung =|index\+\+)/.test(ui));

// two further rules the contract calls easy to miss
console.log('');
console.log('the two easy-to-miss rules');

check('a timed round cannot be won faster than it lasts',
  /Date\.now\(\) - startedAt < ROUND_MS/.test(ui));
check('a mole counts only where it was actually visible',
  /if \(i !== live\) return/.test(ui));
check('a mole can be hit once', /live = -1;/.test(ui));

// School mode starts the ladder at the sums, via one function
check('one function decides the starting rung', /export function startingRung/.test(ui));
check('School mode removes the dim-sum rung rather than skipping it with a message',
  /school && school\.on \? 'sums' : 'dish'/.test(ui));

// ---------- honesty ----------

console.log('');
console.log('honesty');

check('the disclosure never claims to secure anything',
  /not encryption/i.test(core) && !/\bsecures?\b|\bprotects? your\b/i.test(core.replace(/does not protect[^.]*\./gi, '')));
check('the recovery route is documented rather than hidden',
  /Support Tickets/.test(ui));
check('the support desk states plainly that nothing is sent anywhere',
  /Nothing is sent anywhere/.test(ui));
check('the support desk never deletes anything itself',
  /never deletes anything|your action/i.test(ui) && !/rmdir|unlink|clearAll\(\)/.test(uiCode));
check('local grading is admitted rather than implied to be server-side',
  /graded on this machine|no server here/i.test(ui));

console.log('');
if (failures) {
  console.error(failures + ' check(s) failed. The ladder has become a second, weaker password.');
  process.exit(1);
}
console.log('Every lock carries its own credential, and all five ladder safety rules hold.');
process.exit(0);
