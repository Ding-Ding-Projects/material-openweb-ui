#!/usr/bin/env node
// A fork must not publish upstream's packages.
//
// This repository tracks open-webui/open-webui, so it inherits that project's
// release, PyPI and container-publishing workflows. Deleting them would be a
// merge conflict on every sync; leaving them alone means every push to this
// fork queues a run that tries to publish somebody else's package under
// somebody else's name.
//
// They failed for want of credentials rather than for want of permission, which
// is not the same thing and is not a defence. The guard is a repository check
// on each publishing job, so the answer does not depend on which secrets happen
// to be configured.
//
//   node scripts/test-workflows.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DIR = join(ROOT, '.github', 'workflows');
const UPSTREAM = "github.repository == 'open-webui/open-webui'";

let failures = 0;
function check(name, ok, detail = '') {
  if (ok) console.log('  pass  ' + name);
  else { console.error('  FAIL  ' + name + (detail ? ' — ' + detail : '')); failures++; }
}

const files = readdirSync(DIR).filter((f) => /\.(yml|yaml)$/.test(f));
check('workflows were found', files.length > 0, String(files.length));

// Anything that pushes a package, an image, a release or a tag.
const PUBLISHES = /pypa\/gh-action-pypi-publish|docker\/build-push-action|softprops\/action-gh-release|ncipollo\/release-action|actions\/create-release|npm publish|docker push|gh release create|twine upload/;

const unguarded = [];
for (const file of files) {
  const text = readFileSync(join(DIR, file), 'utf8');
  if (!PUBLISHES.test(text)) continue;
  // Each job in the file must carry the guard.
  // Scoped to what follows `jobs:`. The first version scanned the whole file at
  // two-space indent and so counted `workflow_dispatch` and `push` — keys under
  // `on:` — as jobs it expected to find a guard on.
  const jobsAt = text.indexOf(String.fromCharCode(10) + 'jobs:');
  if (jobsAt === -1) continue;
  const jobsBlock = text.slice(jobsAt);
  const jobs = [...jobsBlock.matchAll(/^  ([a-zA-Z0-9_-]+):$/gm)].map((m) => ({ name: m[1], at: m.index }));
  for (let i = 0; i < jobs.length; i++) {
    const body = jobsBlock.slice(jobs[i].at, i + 1 < jobs.length ? jobs[i + 1].at : jobsBlock.length);
    if (!body.includes(UPSTREAM)) unguarded.push(file + ' → job "' + jobs[i].name + '"');
  }
}

check('every publishing job is guarded to the upstream repository',
  unguarded.length === 0, unguarded.join(', '));

const guarded = files.filter((f) => readFileSync(join(DIR, f), 'utf8').includes(UPSTREAM));
check('at least the three inherited publishers are guarded, so this is not vacuous',
  guarded.length >= 3, guarded.join(', '));

// The project's own gates must NOT be guarded — they are exactly what should run here.
const gates = readFileSync(join(DIR, 'gates.yml'), 'utf8');
check('this project\'s own gates run in this repository', !gates.includes(UPSTREAM));
check('and they run on every push to main', /push:[\s\S]{0,120}branches: \[main\]/.test(gates));
check('and on every pull request', /pull_request:/.test(gates));

// ---------- no duplicate keys ----------
//
// Adding this guard to a job that already had an `if:` produced two `if:` keys
// at job level. YAML takes the last one, so the ORIGINAL condition vanished
// silently — a job that was meant to run only on main or a tag would have run
// on everything, and nothing would have said so. The two are ANDed into one
// expression now, and this check exists because I introduced that bug rather
// than because I anticipated it.

const duplicates = [];
for (const file of files) {
  const text = readFileSync(join(DIR, file), 'utf8');
  const jobsAt = text.indexOf(String.fromCharCode(10) + 'jobs:');
  if (jobsAt === -1) continue;
  const block = text.slice(jobsAt);
  const jobs = [...block.matchAll(/^  ([a-zA-Z0-9_-]+):$/gm)];
  for (let i = 0; i < jobs.length; i++) {
    const body = block.slice(jobs[i].index, i + 1 < jobs.length ? jobs[i + 1].index : block.length);
    const seen = new Map();
    for (const m of body.matchAll(/^    ([a-zA-Z0-9_-]+):/gm)) seen.set(m[1], (seen.get(m[1]) || 0) + 1);
    for (const [key, n] of seen) {
      if (n > 1) duplicates.push(file + ' job "' + jobs[i][1] + '" declares ' + key + ' ' + n + ' times');
    }
  }
}
check('no job declares the same key twice, which YAML resolves by silently discarding one',
  duplicates.length === 0, duplicates.join(', '));

// Every original condition survived being combined with the guard.
const docker = readFileSync(join(DIR, 'docker.yaml'), 'utf8');
check('a job that already had a condition kept it, ANDed with the guard',
  /github\.repository == 'open-webui\/open-webui' && \(!cancelled\(\)\)/.test(docker),
  'the guard must narrow a condition, never replace it');
check('the branch and tag conditions survived too',
  /refs\/heads\/main/.test(docker) && /refs\/tags\/v/.test(docker) && /refs\/heads\/dev/.test(docker));

console.log('');
if (failures) {
  console.error(failures + ' check(s) failed. A fork publishing upstream\'s package is impersonating it.');
  process.exit(1);
}
console.log('Every inherited publishing job is fenced to upstream, and this project\'s own gates are not.');
process.exit(0);
