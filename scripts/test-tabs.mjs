#!/usr/bin/env node
// The tab model's invariants.
//
// Every one of these is a rule that holds or does not hold, and every failure
// looks like ordinary behaviour rather than an error:
//
//   - a bulk close that takes a pinned tab with it;
//   - a closed active tab that jumps to the far end of the strip;
//   - a deleted group that takes its tabs down with it;
//   - four search boxes that disagree about what "matches" means, so that
//     "close tabs not containing X" closes something the search said matched;
//   - a strip that tells a screen reader it is vertical while the arrow keys
//     move it horizontally.
//
//   node scripts/test-tabs.mjs

import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const T = await import(pathToFileURL(join(process.cwd(), 'docs', 'assets', 'js', 'tabs.js')).href);

let failures = 0;
function check(name, ok, detail = '') {
	if (ok) console.log('  pass  ' + name);
	else {
		console.error('  FAIL  ' + name + (detail ? ' — ' + detail : ''));
		failures++;
	}
}

const LABELS = {
	chat: 'Chat',
	ollama: 'Ollama',
	converter: 'Converter',
	authenticator: 'Authenticator',
	settings: 'Settings',
	status: 'Status Hub',
	locks: 'Locks'
};
const labelFor = (page) => LABELS[page] || page;
const PAGES = Object.keys(LABELS);

function build(pages) {
	let m = T.normalise(
		{
			tabs: pages.map((p, i) => ({ id: 't' + i, page: p })),
			groups: [],
			activeTab: 't0',
			dock: 'left'
		},
		PAGES
	);
	return m;
}
const ids = (m) => m.tabs.map((t) => t.id).join(',');
const pages = (m) => m.tabs.map((t) => t.page).join(',');

// ---------- normalising what was stored ----------

console.log('reading a stored model');

check(
	'an empty model becomes a usable one rather than an empty strip',
	T.normalise({}, PAGES).tabs.length === 1
);
check(
	'a model with no tabs at all is repaired, not rendered empty',
	T.normalise({ tabs: [] }, PAGES).tabs.length === 1
);
check(
	'a tab pointing at a page this build does not have is dropped',
	T.normalise(
		{
			tabs: [
				{ id: 'a', page: 'chat' },
				{ id: 'b', page: 'a-page-from-the-future' }
			]
		},
		PAGES
	).tabs.length === 1
);
check(
	'a tab in a group that no longer exists becomes ungrouped, not deleted',
	(() => {
		const m = T.normalise({ tabs: [{ id: 'a', page: 'chat', group: 'gone' }], groups: [] }, PAGES);
		return m.tabs.length === 1 && m.tabs[0].group === null;
	})()
);
check(
	'duplicate identifiers are made unique, since selection depends on them',
	(() => {
		const m = T.normalise(
			{
				tabs: [
					{ id: 'same', page: 'chat' },
					{ id: 'same', page: 'ollama' }
				]
			},
			PAGES
		);
		return new Set(m.tabs.map((t) => t.id)).size === 2;
	})()
);
check(
	'an active tab that does not exist falls back to a real one',
	(() => {
		const m = T.normalise({ tabs: [{ id: 'a', page: 'chat' }], activeTab: 'nowhere' }, PAGES);
		return m.activeTab === 'a';
	})()
);
check(
	'an invented dock edge falls back to the default',
	T.normalise({ tabs: [{ id: 'a', page: 'chat' }], dock: 'diagonally' }, PAGES).dock ===
		T.DEFAULT_DOCK,
	T.normalise({ tabs: [{ id: 'a', page: 'chat' }], dock: 'diagonally' }, PAGES).dock
);
// The contract names the default and gives the reason: a screen is wider than
// it is tall, so a vertical strip shows more labels. Defaulting to the title
// bar is tidier and shows fewer tabs, which is the wrong trade for the surface
// whose entire job is to reveal what is open. It was 'top' until this check.
check('the default edge is the one the contract names', T.DEFAULT_DOCK === 'left', T.DEFAULT_DOCK);
check(
	'a fresh model starts on the default edge',
	T.empty('chat').dock === 'left',
	T.empty('chat').dock
);

// The landing page is the caller's decision, not an accident of list order. An
// earlier version used knownPages[0], which quietly moved the page the
// application opens on when an unrelated object was reordered — and nothing
// anywhere recorded that the decision had been made at all.
check(
	'an empty model opens on the page the caller names',
	T.normalise({}, PAGES, 'converter').tabs[0].page === 'converter',
	T.normalise({}, PAGES, 'converter').tabs[0].page
);
check(
	'a named landing page this build does not have falls back rather than breaking',
	PAGES.includes(T.normalise({}, PAGES, 'a-page-from-the-future').tabs[0].page)
);
check(
	'a repaired empty model keeps the dock edge that was stored',
	T.normalise({ tabs: [], dock: 'left' }, PAGES, 'chat').dock === 'left',
	T.normalise({ tabs: [], dock: 'left' }, PAGES, 'chat').dock
);

// ---------- closing ----------

console.log('');
console.log('closing');

let m = build(['chat', 'ollama', 'converter', 'settings', 'status', 'locks']);
m = { ...m, activeTab: 't3' };

const closed = T.close(m, 't3');
check(
	'closing the active tab selects its NEIGHBOUR, not the first tab',
	closed.model.activeTab === 't4',
	closed.model.activeTab
);
check('closing a tab removes exactly one', closed.model.tabs.length === 5);

const last = T.close({ ...m, activeTab: 't5' }, 't5');
check(
	'closing the last tab in the strip falls back to the one before it',
	last.model.activeTab === 't4',
	last.model.activeTab
);

const inactive = T.close(m, 't0');
check(
	'closing a tab that is not active leaves the selection alone',
	inactive.model.activeTab === 't3'
);

const only = T.close(build(['chat']), 't0');
check('the final tab cannot be closed', only.model.tabs.length === 1 && Boolean(only.refused));

// ---------- pinning ----------

console.log('');
console.log('pinning');

let p = build(['chat', 'ollama', 'converter', 'settings']);
p = T.setPinned(p, 't2', true).model;
check('a pinned tab moves to the front of the strip', p.tabs[0].id === 't2', ids(p));
check(
	'the other tabs keep their relative order',
	p.tabs
		.slice(1)
		.map((t) => t.id)
		.join(',') === 't0,t1,t3',
	ids(p)
);
p = T.setPinned(p, 't0', true).model;
check(
	'a second pinned tab joins the pinned region rather than the general order',
	p.tabs[0].id === 't2' && p.tabs[1].id === 't0',
	ids(p)
);
// Unpinning does not restore an original position, because nothing records
// one — and pretending otherwise would mean storing an index that every
// subsequent close and reorder invalidates. It lands at the front of the
// general region, which is where a browser puts it and where the eye expects
// it, having just watched it leave the pinned region.
const unpinned = T.setPinned(p, 't2', false).model;
check(
	'unpinning leaves the pinned region',
	unpinned.tabs[0].id !== 't2' && !unpinned.tabs.find((t) => t.id === 't2').pinned,
	ids(unpinned)
);
check(
	'and it lands at the front of the general region rather than at the end',
	unpinned.tabs.findIndex((t) => t.id === 't2') === unpinned.tabs.filter((t) => t.pinned).length,
	ids(unpinned)
);

// The pinned region comes before EVERY other region, not merely before the
// ungrouped tabs. Nothing asserted this at first, and a mutation that gave
// pinned tabs the same rank as the first group went entirely unnoticed: with no
// group in the fixture, pinned still sorted ahead of the loose tabs and every
// check stayed green.
const withGroup = (() => {
	let x = build(['chat', 'ollama', 'converter', 'settings']);
	const g = T.createGroup(x, 'Model work', 'sage');
	x = g.model;
	x = T.moveToGroup(x, 't1', g.group.id).model;
	x = T.setPinned(x, 't3', true).model;
	return x;
})();
check(
	'a pinned tab comes before every grouped tab, not only the ungrouped ones',
	withGroup.tabs[0].id === 't3' && withGroup.tabs[0].pinned === true,
	withGroup.tabs.map((t) => t.id + (t.pinned ? '*' : t.group ? '#' : '')).join(',')
);
check(
	'and the groups still come before the ungrouped tabs',
	(() => {
		const kinds = withGroup.tabs.map((t) => (t.pinned ? 0 : t.group ? 1 : 2));
		return kinds.every((k, i) => i === 0 || kinds[i - 1] <= k);
	})(),
	withGroup.tabs.map((t) => (t.pinned ? 'pin' : t.group ? 'grp' : 'loose')).join(',')
);

// ---------- bulk closes and the shared predicate ----------

console.log('');
console.log('bulk closes');

let b = build(['chat', 'ollama', 'converter', 'settings', 'status']);
b = T.setPinned(b, 't1', true).model; // pin Ollama

const containsO = (s) => s.toLowerCase().includes('o');
const searched = T.searchStrip(b, containsO, labelFor);
const bulk = T.closeMatching(b, containsO, labelFor);

// Worked out here from the labels, independently of the model's own text
// function. An earlier version hard-coded a count, and the count was wrong —
// which made the check assert the tester's arithmetic rather than the search.
const expectedO = b.tabs.filter((t) =>
	(labelFor(t.page) + ' ' + t.page).toLowerCase().includes('o')
);
check(
	'the search finds exactly the tabs whose text contains the term',
	searched.tabs.length === expectedO.length &&
		searched.tabs.every((t) => expectedO.some((e) => e.id === t.id)),
	'found ' +
		searched.tabs.map((t) => t.page).join(',') +
		' expected ' +
		expectedO.map((t) => t.page).join(',')
);
check(
	'the term really does exclude some tabs, so the check is not vacuous',
	expectedO.length > 0 && expectedO.length < b.tabs.length,
	String(expectedO.length) + ' of ' + b.tabs.length
);
check(
	'the bulk close leaves the pinned tab alone even though it matched',
	bulk.model.tabs.some((t) => t.id === 't1'),
	pages(bulk.model)
);
check(
	'the bulk close and the search share one notion of what a tab is',
	(() => {
		// Everything the search found that is NOT pinned must be gone, and nothing else.
		const shouldGo = new Set(searched.tabs.filter((t) => !t.pinned).map((t) => t.id));
		const left = new Set(bulk.model.tabs.map((t) => t.id));
		return [...shouldGo].every((id) => !left.has(id));
	})(),
	pages(bulk.model)
);

const inverted = T.closeMatching(b, (s) => s.toLowerCase().includes('chat'), labelFor, {
	invert: true
});
check(
	'closing tabs NOT containing a term keeps the ones that do',
	inverted.model.tabs.some((t) => t.page === 'chat'),
	pages(inverted.model)
);
check(
	'and it still spares the pinned tab that did not match',
	inverted.model.tabs.some((t) => t.id === 't1'),
	pages(inverted.model)
);

const everything = T.closeMatching(build(['chat', 'ollama']), () => true, labelFor);
check(
	'a bulk close that would empty the strip is refused as a whole',
	everything.model.tabs.length === 2 && Boolean(everything.refused),
	everything.refused
);
check(
	'and it says how many it would have closed',
	everything.wouldClose === 2,
	String(everything.wouldClose)
);

const others = T.closeOthers(b, 't3');
check(
	'close-others keeps the pinned tabs too, not only the chosen one',
	others.model.tabs.length === 2 && others.model.tabs.some((t) => t.id === 't1'),
	pages(others.model)
);

// ---------- the four searches ----------

console.log('');
console.log('the four searches');

let s = build(['chat', 'ollama', 'converter', 'settings', 'status']);
const made = T.createGroup(s, 'Model work', 'sage');
s = made.model;
const groupId = made.group.id;
s = T.moveToGroup(s, 't1', groupId).model;
s = T.moveToGroup(s, 't2', groupId).model;
const second = T.createGroup(s, 'Reading', 'rose');
s = second.model;

const term = (needle) => (text) => text.toLowerCase().includes(needle);

check(
	'search 1, the current strip, finds tabs anywhere in it',
	T.searchStrip(s, term('conv'), labelFor).tabs.length === 1
);
check(
	"search 2, inside one group, finds only that group's tabs",
	T.searchInGroup(s, groupId, term('o'), labelFor).tabs.every((t) => t.group === groupId)
);
check(
	'search 2 does not reach outside its group',
	T.searchInGroup(s, groupId, term('settings'), labelFor).tabs.length === 0
);
check(
	'search 3, groups by name, finds the group and not its tabs',
	(() => {
		const r = T.searchGroups(s, term('model'));
		return r.groups.length === 1 && r.tabs.length === 0;
	})()
);
check(
	'search 4, across everything, finds tabs AND groups together',
	(() => {
		const r = T.searchEverything(s, term('model'), labelFor);
		return r.groups.length === 1 && r.tabs.length >= 2;
	})(),
	JSON.stringify(T.searchEverything(s, term('model'), labelFor).tabs.map((t) => t.page))
);
check(
	'a tab is findable by its group name, not only by its own',
	T.searchStrip(s, term('model work'), labelFor).tabs.length === 2
);

// The predicate really is shared: one function decides the text for all of them.
check(
	'one function supplies the text every search reads',
	typeof T.haystack === 'function' &&
		T.haystack(
			s.tabs.find((t) => t.id === 't1'),
			labelFor,
			s.groups
		).includes('Model work'),
	T.haystack(
		s.tabs.find((t) => t.id === 't1'),
		labelFor,
		s.groups
	)
);

// ---------- groups ----------

console.log('');
console.log('groups');

const deleted = T.deleteGroup(s, groupId);
check(
	'deleting a group does NOT delete its tabs',
	deleted.model.tabs.length === s.tabs.length,
	String(deleted.model.tabs.length) + ' vs ' + s.tabs.length
);
check(
	'the released tabs become ungrouped',
	deleted.model.tabs.every((t) => t.group !== groupId)
);
check('and it reports how many it released', deleted.released === 2, String(deleted.released));
check('the group itself is gone', !deleted.model.groups.some((g) => g.id === groupId));

check(
	'a group can be renamed',
	T.renameGroup(s, groupId, 'Renamed').model.groups.find((g) => g.id === groupId).name === 'Renamed'
);
check(
	'a group name is bounded',
	T.renameGroup(s, groupId, 'x'.repeat(400)).model.groups.find((g) => g.id === groupId).name
		.length === T.LIMITS.maxNameLength
);
check(
	'a group colour must be one of the offered ones',
	T.setGroupColour(s, groupId, 'chartreuse').model.groups.find((g) => g.id === groupId).colour !==
		'chartreuse'
);
check(
	'a group can be collapsed',
	T.setGroupCollapsed(s, groupId, true).model.groups.find((g) => g.id === groupId).collapsed ===
		true
);
check(
	'moving a tab into a group unpins it, since the regions are exclusive',
	(() => {
		let x = T.setPinned(s, 't4', true).model;
		x = T.moveToGroup(x, 't4', groupId).model;
		const t = x.tabs.find((y) => y.id === 't4');
		return t.group === groupId && t.pinned === false;
	})()
);
check(
	'moving a tab to a group that does not exist changes nothing',
	T.moveToGroup(s, 't0', 'no-such-group').model.tabs.find((t) => t.id === 't0').group === null
);

const reordered = T.reorderGroup(s, second.group.id, 0);
check(
	'groups can be reordered',
	reordered.model.groups.find((g) => g.id === second.group.id).order === 0
);
check(
	'reordering a group reorders the tabs in the strip with it',
	(() => {
		let x = T.moveToGroup(reordered.model, 't3', second.group.id).model;
		const first = x.tabs.find((t) => !t.pinned);
		return first.group === second.group.id;
	})(),
	T.reorderGroup(s, second.group.id, 0)
		.model.tabs.map((t) => t.group || '-')
		.join(',')
);

// ---------- reordering ----------

console.log('');
console.log('reordering');

let r = build(['chat', 'ollama', 'converter', 'settings']);
check(
	'a tab can be moved along the strip',
	T.reorder(r, 't0', 2)
		.model.tabs.map((t) => t.id)
		.join(',') === 't1,t2,t0,t3',
	ids(T.reorder(r, 't0', 2).model)
);
check(
	'a move past the end is clamped rather than losing the tab',
	T.reorder(r, 't0', 99).model.tabs.length === 4
);
check(
	'a pinned tab cannot be dragged out of the pinned region',
	(() => {
		let x = T.setPinned(r, 't0', true).model;
		x = T.reorder(x, 't0', 3).model;
		return x.tabs[0].id === 't0';
	})()
);

// ---------- docking ----------

console.log('');
console.log('docking');

for (const dock of T.DOCKS) {
	const axis = T.axisFor(dock);
	const vertical = dock === 'left' || dock === 'right';
	check(
		dock + ' reports the orientation it actually behaves as',
		axis.vertical === vertical && axis.ariaOrientation === (vertical ? 'vertical' : 'horizontal')
	);
	check(
		dock + ' moves along the axis it announces',
		axis.nextKey === (vertical ? 'ArrowDown' : 'ArrowRight') &&
			axis.previousKey === (vertical ? 'ArrowUp' : 'ArrowLeft')
	);
	check(
		dock + ' measures overflow on the axis it runs along',
		axis.measure === (vertical ? 'height' : 'width') &&
			axis.clientSize === (vertical ? 'clientHeight' : 'clientWidth')
	);
}
check(
	'an invented edge is refused rather than half-applied',
	T.setDock(build(['chat']), 'inside-out').model.dock === T.DEFAULT_DOCK
);
check(
	'every offered edge is settable',
	T.DOCKS.every((d) => T.setDock(build(['chat']), d).model.dock === d)
);

// ---------- keyboard traversal ----------

console.log('');
console.log('keyboard traversal');

let k = build(['chat', 'ollama', 'converter']);
check('stepping forward moves one along', T.step(k, 't0', 1) === 't1');
check('stepping back moves one back', T.step(k, 't1', -1) === 't0');
check('stepping past the end wraps rather than sticking', T.step(k, 't2', 1) === 't0');
check('stepping before the start wraps the other way', T.step(k, 't0', -1) === 't2');

const collapsedGroup = T.createGroup(k, 'Hidden', 'slate');
let kc = collapsedGroup.model;
kc = T.moveToGroup(kc, 't1', collapsedGroup.group.id).model;
kc = T.setGroupCollapsed(kc, collapsedGroup.group.id, true).model;
/** Every tab traversal reaches, by walking one full cycle. */
function reachable(model, from) {
	const seen = [];
	let at = from;
	for (let i = 0; i < model.tabs.length + 2; i++) {
		at = T.step(model, at, 1);
		if (seen.includes(at)) break;
		seen.push(at);
	}
	return seen;
}
// Stated as reachability rather than as a specific next tab. An earlier version
// asserted which tab came next, which quietly encoded an assumption about strip
// order that it never checked — so it failed for the wrong reason.
check(
	'a tab inside a collapsed group is skipped rather than focused invisibly',
	!reachable(kc, 't0').includes('t1'),
	reachable(kc, 't0').join(',')
);
check(
	'unless it is the active tab, which must stay reachable',
	reachable({ ...kc, activeTab: 't1' }, 't0').includes('t1'),
	reachable({ ...kc, activeTab: 't1' }, 't0').join(',')
);

// ---------- limits ----------

console.log('');
console.log('limits');

const big = {
	tabs: Array.from({ length: 500 }, (_, i) => ({ id: 'x' + i, page: 'chat' })),
	groups: []
};
check(
	'a stored model beyond the tab limit is trimmed rather than loaded whole',
	T.normalise(big, PAGES).tabs.length === T.LIMITS.maxTabs,
	String(T.normalise(big, PAGES).tabs.length)
);
check(
	'opening past the limit is refused with a reason',
	(() => {
		const full = T.normalise(big, PAGES);
		const attempt = T.open(full, 'chat');
		return attempt.model.tabs.length === T.LIMITS.maxTabs && Boolean(attempt.error);
	})()
);

console.log('');
if (failures) {
	console.error(
		failures +
			' check(s) failed. Every one of these looks like ordinary behaviour when it is wrong.'
	);
	process.exit(1);
}
console.log(
	'Pinned tabs survive bulk closes, groups outlive deletion, and all four searches read the same text.'
);
process.exit(0);
