#!/usr/bin/env node
// The dim sum surprise, and the restraint around it.
//
// The contract's own verification is "confirm it never fires twice in one load,
// and that School mode removes it rather than hiding it". Both are checked here
// by actually drawing, rather than by reading the code and believing it.
//
// The once-per-load rule is worth being pedantic about. "We only call it once"
// is not the same claim as "it can only happen once", and the difference shows
// up the day somebody adds a second call site — at which point two notifications
// appear, which is precisely the un-restrained behaviour the whole feature is
// defined against.
//
//   node scripts/test-dimsum.mjs

import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const D = await import(pathToFileURL(join(ROOT, 'docs', 'assets', 'js', 'dimsum.js')).href);

let failures = 0;
function check(name, ok, detail = '') {
	if (ok) console.log('  pass  ' + name);
	else {
		console.error('  FAIL  ' + name + (detail ? ' — ' + detail : ''));
		failures++;
	}
}

/** A deterministic stand-in for Math.random, so a draw can be forced or refused. */
const always = () => 0; // below the chance: it fires
const never = () => 0.99; // above the chance: it does not

// ---------- once per load ----------

console.log('once per load');

D.resetForTest();
const first = D.draw({ schoolOn: false, random: always });
check('it can fire', Boolean(first), JSON.stringify(first));
check('and it reports which dish', Boolean(first && first.dish && first.dish.en));

const second = D.draw({ schoolOn: false, random: always });
check(
	'a second draw in the same load produces nothing, even when the odds say yes',
	second === null,
	JSON.stringify(second)
);

let extra = 0;
for (let i = 0; i < 50; i++) if (D.draw({ schoolOn: false, random: always })) extra++;
check(
	'and it stays nothing however many times it is called',
	extra === 0,
	String(extra) + ' extra'
);
check('the guard is queryable, so a caller can tell rather than guess', D.hasFired() === true);

D.resetForTest();
check('the reset is what makes the above observable at all', D.hasFired() === false);

// ---------- the odds ----------

console.log('');
console.log('the odds');

D.resetForTest();
check('a draw above the chance does not fire', D.draw({ schoolOn: false, random: never }) === null);
check(
	'and a refused draw does not consume the once-per-load guard, or one unlucky launch would silence every later one',
	D.hasFired() === false
);
check('so it can still fire afterwards', Boolean(D.draw({ schoolOn: false, random: always })));
check('the chance is one in ten, as stated', D.CHANCE === 0.1, String(D.CHANCE));

// ---------- School mode ----------

console.log('');
console.log('School mode');

D.resetForTest();
const underSchool = D.draw({ schoolOn: true, random: always });
check('School mode produces nothing at all', underSchool === null, JSON.stringify(underSchool));
check(
	'it produces nothing rather than something marked as hidden',
	underSchool === null,
	'a note explaining what was hidden would name the thing being hidden'
);
check(
	'and it does not consume the guard either, so turning School mode off later still works',
	D.hasFired() === false
);
check(
	'with School mode off it fires normally',
	Boolean(D.draw({ schoolOn: false, random: always }))
);

// School mode is checked BEFORE the random draw, so a suppressed feature is not
// quietly spending randomness.
let consulted = 0;
D.resetForTest();
D.draw({
	schoolOn: true,
	random: () => {
		consulted++;
		return 0;
	}
});
check('School mode does not even consult the random source', consulted === 0, String(consulted));

// ---------- photographs ----------

console.log('');
console.log('photographs');

check('there are dishes', D.DISHES.length >= 4);
check(
	'every dish is bilingual',
	D.DISHES.every((d) => d.en && d.zh)
);
check(
	'every dish states its photograph or states that there is none',
	D.DISHES.every((d) => Object.prototype.hasOwnProperty.call(d, 'photo')),
	'an absent field is a gap; an explicit null is a fact'
);
check(
	'at least one dish has no published photograph, so the case is real rather than theoretical',
	D.DISHES.some((d) => d.photo === null)
);
check(
	'no photograph is a path inside this repository',
	D.DISHES.every(
		(d) =>
			!d.photo ||
			(!d.photo.includes('..') && !d.photo.startsWith('/') && !d.photo.includes('assets/'))
	),
	D.DISHES.map((d) => d.photo).join(',')
);

D.resetForTest();
const withPhoto = (() => {
	// Force a specific dish by controlling both random calls: the first decides
	// whether it fires, the second picks the dish.
	const index = D.DISHES.findIndex((d) => d.photo);
	let call = 0;
	return D.draw({ schoolOn: false, random: () => (call++ === 0 ? 0 : index / D.DISHES.length) });
})();
D.resetForTest();
const withoutPhoto = (() => {
	const index = D.DISHES.findIndex((d) => d.photo === null);
	let call = 0;
	return D.draw({ schoolOn: false, random: () => (call++ === 0 ? 0 : index / D.DISHES.length) });
})();

check(
	'a dish with a photograph says where it lives',
	withPhoto && /public catalogue/.test(withPhoto.provenance),
	withPhoto && withPhoto.provenance
);
check(
	'a dish WITHOUT one says so instead of saying the same thing',
	withoutPhoto && /no published photograph/.test(withoutPhoto.provenance),
	withoutPhoto && withoutPhoto.provenance
);
check(
	'the two sentences really are different, or the absence is invisible',
	withPhoto && withoutPhoto && withPhoto.provenance !== withoutPhoto.provenance
);
check(
	'the missing-photograph sentence says nothing is substituted locally',
	withoutPhoto && /substituted locally|fill the gap/.test(withoutPhoto.provenance)
);

// ---------- no off switch, and no divergence ----------

console.log('');
console.log('no off switch, one implementation');

const appJs = readFileSync(join(ROOT, 'app', 'js', 'app.js'), 'utf8');
const siteJs = readFileSync(join(ROOT, 'docs', 'assets', 'js', 'app.js'), 'utf8');
const dimsumSrc = readFileSync(join(ROOT, 'docs', 'assets', 'js', 'dimsum.js'), 'utf8');
const settings = readFileSync(join(ROOT, 'app', 'js', 'pages', 'settings.js'), 'utf8');
const state = readFileSync(join(ROOT, 'app', 'js', 'state.js'), 'utf8');

check(
	'there is no setting to switch it off',
	!/dimsum|dimSum|dim_sum/i.test(settings) && !/dimsum|dimSum/i.test(state),
	'a surprise with an off switch is a preference people have to think about'
);
check(
	'neither surface keeps its own copy of the dish list',
	!/const DIM_SUM\s*=/.test(appJs) && !/const DIM_SUM\s*=/.test(siteJs),
	'two lists is two lists, and the second one goes stale'
);
check(
	'both surfaces draw from the shared module',
	/dimsum\.draw\(/.test(appJs) && /dimsum\.draw\(/.test(siteJs)
);
check(
	'it is delivered as a notification, which already promises not to block or steal focus',
	/ui\.notify\(/.test(appJs) && /ui\.notify\(/.test(siteJs)
);
check(
	'it auto-dismisses rather than waiting to be closed',
	/duration:\s*\d+/.test(appJs) && /duration:\s*\d+/.test(siteJs)
);
check('the module never loads a remote image itself', !/new Image|fetch\(|<img/.test(dimsumSrc));

console.log('');
if (failures) {
	console.error(failures + ' check(s) failed.');
	process.exit(1);
}
console.log(
	'At most once a load, absent under School mode, and honest about the dishes it has no photograph of.'
);
process.exit(0);
