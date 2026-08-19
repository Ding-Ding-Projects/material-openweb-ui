#!/usr/bin/env node
// Fit verdicts: correct, and actually reachable.
//
// An audit found `fit()` fully written, exported, and called by nothing at all.
// There was no IPC message for it, no case in the main-process switch, no
// bridge in the renderer, and not one of the four verdict strings appeared
// anywhere under app/. The inventory guard was green throughout, because it
// checks that an anchor RESOLVES — and `electron/hardware.ts#export function
// fit` resolves perfectly whether or not anything ever calls it.
//
// So this file checks two different things. The first half exercises the
// function's judgement. The second half walks the chain from the message type
// to the rendered verdict, because a correct function nobody can reach is
// indistinguishable from no function.
//
//   node scripts/test-fit.mjs

import { pathToFileURL } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
let failures = 0;
function check(name, ok, detail = '') {
  if (ok) console.log('  pass  ' + name);
  else { console.error('  FAIL  ' + name + (detail ? ' — ' + detail : '')); failures++; }
}

const compiled = join(ROOT, 'dist-electron', 'hardware.js');
if (!existsSync(compiled)) {
  console.error('  FAIL  dist-electron/hardware.js is missing. Run: npm run electron:compile');
  process.exit(1);
}
const { fit } = await import(pathToFileURL(compiled).href);

const GB = 1024 ** 3;
const known = (value) => ({ known: true, value });
const unknown = (why) => ({ known: false, why });

function machine({ ram = 32, vram = 8, disk = 500, gpu = 'A real GPU' } = {}) {
  return {
    totalRamBytes: ram === null ? unknown('not measured') : known(ram * GB),
    freeRamBytes: ram === null ? unknown('not measured') : known(ram * GB * 0.6),
    vramBytes: vram === null ? unknown('the driver did not report it') : known(vram * GB),
    gpuName: gpu === null ? unknown('no GPU found') : known(gpu),
    freeDiskBytes: disk === null ? unknown('the path could not be read') : known(disk * GB),
    probedAt: '2026-08-19T09:00:00.000Z',
    notes: []
  };
}

// ---------- judgement ----------

console.log('judgement');

const small = fit(machine(), { blobBytes: 2 * GB, contextTokens: 4096 });
check('a small model on a capable machine runs well', small.verdict === 'Runs well', small.verdict);

const huge = fit(machine({ ram: 8, vram: 2 }), { blobBytes: 40 * GB, contextTokens: 4096 });
check('a model far larger than the machine is Unlikely', huge.verdict === 'Unlikely', huge.verdict);

const noSize = fit(machine(), { parameterCount: '7B', quantisation: 'Q4_K_M' });
check('no declared size gives Unknown rather than a guess', noSize.verdict === 'Unknown', noSize.verdict);
check('and it says why, rather than leaving a bare Unknown',
  noSize.evidence.some((e) => /did not report a size/.test(e)), JSON.stringify(noSize.evidence));
check('the refusal to infer a size from the name is stated',
  noSize.assumptions.some((a) => /never inferred/.test(a)), JSON.stringify(noSize.assumptions));

const noMemory = fit(machine({ ram: null, vram: null }), { blobBytes: 2 * GB });
check('a machine whose memory could not be measured gives Unknown', noMemory.verdict === 'Unknown', noMemory.verdict);

const noRoom = fit(machine({ disk: 1 }), { blobBytes: 20 * GB });
check('a model larger than the free space is Unlikely whatever the memory says',
  noRoom.verdict === 'Unlikely', noRoom.verdict);
check('and the disk is named as the reason',
  noRoom.evidence.some((e) => /Free space/.test(e)), JSON.stringify(noRoom.evidence));

// ---------- every declared field is used ----------

console.log('');
console.log('every declared field is used');

// The contract says the verdict combines blob size, parameter count,
// quantisation and declared context window. The first version read only the
// blob size and ignored the other three entirely.
const long = fit(machine({ vram: 8 }), { blobBytes: 6 * GB, contextTokens: 131072 });
const short = fit(machine({ vram: 8 }), { blobBytes: 6 * GB, contextTokens: 4096 });
check('a longer declared context needs more room than a short one at identical weights',
  JSON.stringify(long) !== JSON.stringify(short),
  short.verdict + ' vs ' + long.verdict);
check('and the context window appears in the evidence',
  long.evidence.some((e) => /context window/i.test(e)), JSON.stringify(long.evidence));
check('the allowance says it is a rule of thumb rather than a measurement',
  long.assumptions.some((a) => /rule of thumb/.test(a)), JSON.stringify(long.assumptions));

const declared = fit(machine(), { blobBytes: 4 * GB, parameterCount: '7B', quantisation: 'Q4_K_M', contextTokens: 8192 });
check('a declared parameter count is reported', declared.evidence.some((e) => /Parameters: 7B/.test(e)));
check('a declared quantisation is reported', declared.evidence.some((e) => /Quantisation: Q4_K_M/.test(e)));

const undeclared = fit(machine(), { blobBytes: 4 * GB });
check('an undeclared parameter count is said to be undeclared, not silently ignored',
  undeclared.assumptions.some((a) => /parameter count was not declared/.test(a)));
check('an undeclared quantisation likewise',
  undeclared.assumptions.some((a) => /quantisation was not declared/.test(a)));
check('an undeclared context window makes the answer MORE conservative, never less',
  undeclared.assumptions.some((a) => /Rather than assume a small one/.test(a)),
  JSON.stringify(undeclared.assumptions));

// The conservative direction, proved rather than asserted: with everything else
// identical, no declared context must never produce a better verdict.
const RANK = { 'Runs well': 3, 'Runs with limits': 2, Unlikely: 1, Unknown: 0 };
let optimistic = [];
for (const size of [1, 2, 4, 6, 8, 10, 14, 20]) {
  const withContext = fit(machine({ vram: 8, ram: 16 }), { blobBytes: size * GB, contextTokens: 4096 });
  const without = fit(machine({ vram: 8, ram: 16 }), { blobBytes: size * GB });
  if (RANK[without.verdict] > RANK[withContext.verdict]) {
    optimistic.push(size + 'GB: ' + without.verdict + ' without vs ' + withContext.verdict + ' with');
  }
}
check('missing metadata never produces a rosier verdict than declared metadata',
  optimistic.length === 0, optimistic.join(', '));

// ---------- every verdict carries its evidence ----------

console.log('');
console.log('evidence');

for (const [label, result] of [['runs well', small], ['unlikely', huge], ['unknown', noSize]]) {
  check('a "' + label + '" verdict carries evidence', result.evidence.length > 0);
  check('a "' + label + '" verdict carries the time it was measured',
    /^\d{4}-\d{2}-\d{2}T/.test(result.probedAt), result.probedAt);
}
check('every verdict is one of the four the contract names',
  [small, huge, noSize, noMemory, noRoom, long, declared].every((r) =>
    ['Runs well', 'Runs with limits', 'Unlikely', 'Unknown'].includes(r.verdict)));

// ---------- reachable ----------

console.log('');
console.log('reachable from the surface');

const preload = readFileSync(join(ROOT, 'electron', 'preload.ts'), 'utf8');
const main = readFileSync(join(ROOT, 'electron', 'main.ts'), 'utf8');
const bridge = readFileSync(join(ROOT, 'app', 'js', 'desktop.js'), 'utf8');
const page = readFileSync(join(ROOT, 'app', 'js', 'pages', 'ollama.js'), 'utf8');

check('the message type exists', /'hardware:fit'/.test(preload));
check('the main process imports fit', /import \{[^}]*\bfit\b[^}]*\} from '\.\/hardware\.js'/.test(main));
check('the main process handles the message', /case 'hardware:fit'/.test(main));
check('and it actually calls fit', /fit\(hw, m\)|fit\(hw,/.test(main));
check('the renderer has a bridge for it', /hardware:fit/.test(bridge) && /export const fitModels/.test(bridge));
check('the page calls that bridge', /desktop\.fitModels\(/.test(page));
check('the page renders a verdict', /v\.verdict/.test(page));
check('the page renders the evidence, not only the verdict', /v\.evidence/.test(page));
check('the page renders when it was measured', /v\.probedAt/.test(page));
check('the page renders the assumptions too', /v\.assumptions/.test(page));

check('a missing verdict is stated rather than left blank',
  /Fit not measured yet|needs the desktop shell/.test(page),
  'an absent verdict and a verdict of Unknown are different facts');

check('the verdicts recompute when the measured hardware changes',
  /onHardwareChanged\(/.test(page) && /hardwareListeners/.test(page));
check('there is a control that changes the destination, or the recompute can never be triggered',
  /modelDestination/.test(page) && /model-destination/.test(page));
check('changing it re-probes rather than reusing the old measurement',
  /await paint\(\)/.test(page));

// The batching matters: a probe per catalogue row would measure the same
// machine hundreds of times to produce hundreds of identical readings.
check('the hardware is probed once per call rather than once per model',
  /const hw = await probe\(/.test(main) && /models\.map\(\(m\) => \(\{ id: String\(m\.id\), \.\.\.fit\(hw, m\)/.test(main));

console.log('');
if (failures) {
  console.error(failures + ' check(s) failed. A verdict nobody can reach is the same as no verdict.');
  process.exit(1);
}
console.log('Every verdict is evidenced, conservative when metadata is missing, and reaches the screen.');
process.exit(0);
