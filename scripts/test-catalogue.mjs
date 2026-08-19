#!/usr/bin/env node
// The published catalogue says only what it checked.
//
// The version this replaced printed "Catalogue verified complete across 1
// page(s)" on every successful fetch. Neither half was measured: `pages` was
// the literal 1 in every result object including the failures, and `complete`
// was set because at least one link had matched. Nothing had been verified and
// nothing had been counted.
//
// That is the worst shape a completeness claim can take, because it is
// indistinguishable from a real one. This checks the three separate facts the
// contract asks for — where it came from, how many pages, and what the verdict
// is based on — by fetching from a stub rather than from the network.
//
//   node scripts/test-catalogue.mjs

import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
let failures = 0;
function check(name, ok, detail = '') {
	if (ok) console.log('  pass  ' + name);
	else {
		console.error('  FAIL  ' + name + (detail ? ' — ' + detail : ''));
		failures++;
	}
}

// A localStorage the module can write its cache into.
globalThis.localStorage = {
	_d: new Map(),
	getItem(k) {
		return this._d.has(k) ? this._d.get(k) : null;
	},
	setItem(k, v) {
		this._d.set(k, String(v));
	},
	removeItem(k) {
		this._d.delete(k);
	}
};

/** A page of the library, with as many model links as asked for. */
function page(names, { next = null, pagination = false } = {}) {
	const links = names.map((n) => '<a href="/library/' + n + '">' + n + '</a>').join('');
	const nav = next
		? '<nav aria-label="Pagination"><a href="' + next + '">Next</a></nav>'
		: pagination
			? '<nav aria-label="Pagination"><span>1</span></nav>'
			: '';
	return '<html><body>' + links + nav + '</body></html>';
}

function stubFetch(pages, { headers = {} } = {}) {
	return async (url) => {
		const key =
			new URL(url, 'https://ollama.com').pathname + new URL(url, 'https://ollama.com').search;
		const body = pages[key];
		if (body === undefined)
			return { ok: false, status: 404, headers: { get: () => null }, text: async () => '' };
		return {
			ok: true,
			status: 200,
			headers: { get: (h) => headers[h.toLowerCase()] ?? null },
			text: async () => body
		};
	};
}

const mod = await import(pathToFileURL(join(ROOT, 'app', 'js', 'core', 'ollama.js')).href);

async function fetchWith(pages, opts) {
	globalThis.fetch = stubFetch(pages, opts);
	return mod.fetchCatalog({});
}

// ---------- counting pages ----------

console.log('counting pages');

const onePage = await fetchWith({ '/library': page(['llama3', 'mistral', 'qwen']) });
check('a single page reports one page', onePage.pages === 1, String(onePage.pages));
check('and every model on it', onePage.models.length === 3, String(onePage.models.length));

const threePages = await fetchWith({
	'/library': page(['a', 'b'], { next: '/library?page=2' }),
	'/library?page=2': page(['c', 'd'], { next: '/library?page=3' }),
	'/library?page=3': page(['e'], { pagination: true })
});
check('three linked pages are all followed', threePages.pages === 3, String(threePages.pages));
check(
	'and every model across them is collected',
	threePages.models.map((m) => m.name).join(',') === 'a,b,c,d,e',
	threePages.models.map((m) => m.name).join(',')
);
check(
	'the page count is measured rather than assumed',
	threePages.pages !== onePage.pages,
	'both would be 1 if it were a literal'
);

const loop = await fetchWith({
	'/library': page(['a'], { next: '/library?page=2' }),
	'/library?page=2': page(['b'], { next: '/library' })
});
check(
	'a page that links back to one already read does not loop forever',
	loop.pages === 2,
	String(loop.pages)
);

// ---------- the verdict ----------

console.log('');
console.log('the completeness verdict');

check(
	'following pagination to its end reads as complete',
	threePages.completeness === 'complete',
	threePages.completeness
);
check(
	'and the verdict says what it is based on',
	/Followed every page/.test(threePages.basis || ''),
	threePages.basis
);

check(
	'a document with no pagination markup is UNVERIFIED, not complete',
	onePage.completeness === 'unverified',
	onePage.completeness
);
check(
	'and it says why it cannot tell',
	/cannot confirm whether more pages exist/.test(onePage.basis || ''),
	onePage.basis
);
check(
	'unverified does not claim the boolean either',
	onePage.complete === false,
	String(onePage.complete)
);
check(
	'but the models it did read are still returned rather than withheld',
	onePage.models.length === 3
);

const withPagination = await fetchWith({ '/library': page(['a', 'b'], { pagination: true }) });
check(
	'a single page that DOES declare pagination and links no further is complete',
	withPagination.completeness === 'complete',
	withPagination.completeness
);

const brokeMidway = await fetchWith({
	'/library': page(['a'], { next: '/library?page=2' })
	// page 2 is absent, so the fetch 404s
});
check(
	'a page that fails makes the whole result incomplete',
	brokeMidway.completeness === 'incomplete',
	brokeMidway.completeness
);
check(
	'and it names the page that failed',
	/404/.test(brokeMidway.failure || ''),
	brokeMidway.failure
);
check(
	'what was already read is still returned rather than thrown away',
	brokeMidway.models.length === 1,
	String(brokeMidway.models.length)
);

const empty = await fetchWith({ '/library': '<html><body>nothing at all</body></html>' });
check(
	'a page with no model links is a broken parser, not an empty catalogue',
	/markup changed/.test(empty.failure || ''),
	empty.failure
);

// ---------- the source revision ----------

console.log('');
console.log('the source revision');

const tagged = await fetchWith({ '/library': page(['a']) }, { headers: { etag: 'W/"abc123"' } });
check('an ETag is recorded as the revision', tagged.revision === 'abc123', tagged.revision);
check(
	'and where it came from is recorded too',
	tagged.revisionFrom === 'ETag',
	tagged.revisionFrom
);

const dated = await fetchWith(
	{ '/library': page(['a']) },
	{ headers: { 'last-modified': 'Wed, 19 Aug 2026 09:00:00 GMT' } }
);
check(
	'Last-Modified is used when there is no ETag',
	/2026/.test(dated.revision || ''),
	dated.revision
);

const hashed = await fetchWith({ '/library': page(['a']) });
check(
	'with no cache headers the body itself identifies the version',
	/^[0-9a-f]{16}$/.test(hashed.revision || ''),
	hashed.revision
);
check(
	'and it says the revision is a hash rather than a published version',
	/SHA-256/.test(hashed.revisionFrom || ''),
	hashed.revisionFrom
);

const different = await fetchWith({ '/library': page(['a', 'b']) });
check(
	'two different catalogues can be told apart',
	hashed.revision !== different.revision,
	hashed.revision + ' vs ' + different.revision
);

check(
	'every result records when it was fetched',
	/^\d{4}-\d{2}-\d{2}T/.test(onePage.fetchedAt),
	onePage.fetchedAt
);

// ---------- what the surface says ----------

console.log('');
console.log('what the surface says');

const core = readFileSync(join(ROOT, 'app', 'js', 'core', 'ollama.js'), 'utf8');
const surface = readFileSync(join(ROOT, 'app', 'js', 'pages', 'ollama.js'), 'utf8');
const contract = readFileSync(join(ROOT, 'docs', 'assets', 'js', 'content.js'), 'utf8');

// Source-shape checks read a whitespace-normalised copy and tolerate either
// quote style. Layout and quoting are a formatter's business; what these
// assertions are actually about is which expressions exist and in what order.
// Written against the raw text, they all turned red the first time the
// repository was formatted — on code that had not changed at all.
const flat = (t) => t.replace(/\s+/g, ' ');
const coreFlat = flat(core);
const surfaceFlat = flat(surface);

check(
	'the heading follows the verdict rather than asserting one',
	/completeness === 'complete' \? 'Catalogue verified complete'/.test(coreFlat),
	'"verified complete" was printed for any fetch that read a link'
);
check(
	'an unverified verdict does not get a success tick',
	/completeness === 'complete'\s*\? 'check'|completeness === 'complete' \? 'check'/.test(surfaceFlat)
);
check(
	'the fetch is disclosed BEFORE it happens, not after',
	surface.indexOf('Fetching the published catalogue from ollama.com') <
		surface.indexOf('await ollama.fetchCatalog'),
	'a disclosure after the request has already been made is a receipt, not a disclosure'
);
check(
	'the contract no longer claims only the local API is used',
	!/It speaks only Ollama's documented local HTTP API\./.test(contract),
	'that sentence was the comfortable one and the false one'
);
check(
	'the contract states the one exception plainly',
	/Browsing the PUBLISHED catalogue is the one exception/.test(contract)
);
check('and names the three verdicts', /complete, incomplete or unverified/.test(contract));

console.log('');
if (failures) {
	console.error(
		failures + ' check(s) failed. A completeness claim nobody measured is worse than none.'
	);
	process.exit(1);
}
console.log('Pages are counted, the verdict names its basis, and the source revision is recorded.');
process.exit(0);
