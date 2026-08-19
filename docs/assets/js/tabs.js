// The tab model.
//
// Kept apart from anything that draws, because the parts that go wrong are all
// model problems and none of them are visible in a screenshot: a bulk close
// that takes a pinned tab with it, a closed active tab that jumps to the far
// end of the strip, a deleted group that takes its tabs down with it, and four
// search boxes that quietly disagree about what "matches" means.
//
// Every function here returns a NEW model rather than mutating one. That is
// what makes the invariants checkable: a test can hold the before and after
// side by side, which is exactly what an in-place edit denies it.

export const DOCKS = Object.freeze(['left', 'right', 'top', 'bottom']);

/**
 * Left, and the reason is in the contract rather than in taste: a screen is
 * wider than it is tall, so a vertical strip shows more labels legibly than a
 * horizontal one of the same area. Defaulting to the title bar looks tidier and
 * shows fewer tabs, which is the wrong trade for the surface whose whole job is
 * to reveal what is open.
 */
export const DEFAULT_DOCK = 'left';

export const GROUP_COLOURS = Object.freeze([
	{ id: 'grape', label: 'Grape', token: '--p' },
	{ id: 'sage', label: 'Sage', token: '--ok' },
	{ id: 'rose', label: 'Rose', token: '--ter' },
	{ id: 'slate', label: 'Slate', token: '--sec' },
	{ id: 'clay', label: 'Clay', token: '--err' }
]);

export const LIMITS = Object.freeze({
	maxTabs: 200,
	maxGroups: 24,
	maxNameLength: 60
});

// ---------------------------------------------------------------- model

export function empty(firstPage = 'ollama') {
	const id = idFor();
	return {
		tabs: [{ id, page: firstPage, pinned: false, group: null }],
		groups: [],
		activeTab: id,
		dock: DEFAULT_DOCK
	};
}

let counter = 0;
function idFor() {
	counter += 1;
	return 'tb-' + counter.toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

/**
 * Repairs a model read from disk.
 *
 * Anything stored is something a previous version wrote, and this application
 * is expected to survive reading its own older output. A tab pointing at a
 * group that no longer exists becomes ungrouped rather than disappearing.
 */
export function normalise(model, knownPages, defaultPage) {
	const source = model && typeof model === 'object' ? model : {};
	const groups = (Array.isArray(source.groups) ? source.groups : [])
		.slice(0, LIMITS.maxGroups)
		.filter((g) => g && typeof g.id === 'string')
		.map((g, i) => ({
			id: g.id,
			name: String(g.name || 'Group').slice(0, LIMITS.maxNameLength),
			colour: GROUP_COLOURS.some((c) => c.id === g.colour) ? g.colour : GROUP_COLOURS[0].id,
			collapsed: g.collapsed === true,
			order: Number.isFinite(g.order) ? g.order : i
		}));
	const groupIds = new Set(groups.map((g) => g.id));

	let tabs = (Array.isArray(source.tabs) ? source.tabs : [])
		.slice(0, LIMITS.maxTabs)
		.filter((t) => t && typeof t.page === 'string')
		.filter((t) => !knownPages || knownPages.includes(t.page))
		.map((t) => ({
			id: typeof t.id === 'string' && t.id ? t.id : idFor(),
			page: t.page,
			pinned: t.pinned === true,
			group: groupIds.has(t.group) ? t.group : null
		}));

	// A model with no tabs is not a state this application can render, so one is
	// restored rather than leaving an empty strip nothing can be done with.
	//
	// The page it opens on is STATED by the caller. Falling back to the first
	// entry of the known-pages list silently makes the application open wherever
	// that list happens to start, so reordering an unrelated object changes what
	// people see on launch — with nothing anywhere recording the decision.
	if (!tabs.length) {
		const first =
			defaultPage && (!knownPages || knownPages.includes(defaultPage))
				? defaultPage
				: (knownPages && knownPages[0]) || 'ollama';
		return { ...empty(first), dock: DOCKS.includes(source.dock) ? source.dock : DEFAULT_DOCK };
	}

	// Identifiers must be unique or selection becomes ambiguous.
	const seen = new Set();
	tabs = tabs.map((t) => {
		if (seen.has(t.id)) return { ...t, id: idFor() };
		seen.add(t.id);
		return t;
	});

	const activeTab = tabs.some((t) => t.id === source.activeTab) ? source.activeTab : tabs[0].id;
	const dock = DOCKS.includes(source.dock) ? source.dock : DEFAULT_DOCK;

	return {
		tabs: ordered(tabs, groups),
		groups: groups.sort((a, b) => a.order - b.order),
		activeTab,
		dock
	};
}

/**
 * The strip order: pinned first, then each group in turn, then the ungrouped.
 *
 * Pinned tabs occupy a stable region of their own. Letting them mix into the
 * general order is what makes a pinned tab drift, which defeats the point of
 * pinning it.
 */
export function ordered(tabs, groups) {
	const groupOrder = new Map(groups.map((g, i) => [g.id, Number.isFinite(g.order) ? g.order : i]));
	const rank = (t) => {
		if (t.pinned) return -1;
		if (t.group) return groupOrder.get(t.group) ?? 0;
		return Number.MAX_SAFE_INTEGER;
	};
	return tabs
		.map((t, i) => ({ t, i }))
		.sort((a, b) => {
			const d = rank(a.t) - rank(b.t);
			return d !== 0 ? d : a.i - b.i;
		})
		.map((x) => x.t);
}

// ---------------------------------------------------------------- one predicate
//
// The contract asks for four discovery searches and for the bulk closes to
// share one match predicate with them. That is not tidiness: two predicates
// drift, and the day they do, "close tabs not containing X" starts closing
// something the search said did not match.

/**
 * The text a tab is searched by. One function, used by every search and by
 * both bulk closes, so they cannot disagree about what a tab "is".
 */
export function haystack(tab, labelFor, groups = []) {
	const group = groups.find((g) => g.id === tab.group);
	return [labelFor(tab.page), tab.page, group ? group.name : ''].filter(Boolean).join(' ');
}

/** Tabs matching a predicate, by that same text. */
export function matching(model, test, labelFor) {
	return model.tabs.filter((t) => test(haystack(t, labelFor, model.groups)));
}

// ---------------------------------------------------------------- the four searches

/**
 * Every search returns tabs and groups rather than a flat list, so a result can
 * say where it lives instead of teleporting somebody to a tab with no context.
 */
export function searchStrip(model, test, labelFor) {
	return { tabs: matching(model, test, labelFor), groups: [] };
}

export function searchInGroup(model, groupId, test, labelFor) {
	const inGroup = { ...model, tabs: model.tabs.filter((t) => t.group === groupId) };
	return { tabs: matching(inGroup, test, labelFor), groups: [] };
}

export function searchGroups(model, test) {
	return { tabs: [], groups: model.groups.filter((g) => test(g.name)) };
}

/** Across everything: tabs by their own text, and groups by name. */
export function searchEverything(model, test, labelFor) {
	return {
		tabs: matching(model, test, labelFor),
		groups: model.groups.filter((g) => test(g.name))
	};
}

// ---------------------------------------------------------------- operations

export function open(model, page) {
	if (model.tabs.length >= LIMITS.maxTabs) {
		return { model, error: 'That is already ' + LIMITS.maxTabs + ' tabs, which is the limit.' };
	}
	const tab = { id: idFor(), page, pinned: false, group: null };
	return {
		model: { ...model, tabs: ordered([...model.tabs, tab], model.groups), activeTab: tab.id },
		opened: tab
	};
}

/**
 * Closes a tab and chooses what to select next.
 *
 * The neighbour, not the first tab. Closing the fourth of six and landing on
 * the first is the behaviour every browser abandoned, because it loses the
 * place someone was working in.
 */
export function close(model, id) {
	if (model.tabs.length <= 1) return { model, refused: 'The last tab cannot be closed.' };
	const index = model.tabs.findIndex((t) => t.id === id);
	if (index === -1) return { model };
	const tabs = model.tabs.filter((t) => t.id !== id);
	let activeTab = model.activeTab;
	if (activeTab === id) {
		const neighbour = model.tabs[index + 1] || model.tabs[index - 1];
		activeTab = neighbour ? neighbour.id : tabs[0].id;
		if (!tabs.some((t) => t.id === activeTab)) activeTab = tabs[0].id;
	}
	return { model: { ...model, tabs, activeTab }, closed: index };
}

/**
 * Closes every tab a predicate selects — except pinned ones.
 *
 * Pinned tabs are excluded by construction rather than by the caller
 * remembering to filter, because a pinned tab swept away by a bulk action is
 * exactly the loss pinning exists to prevent.
 */
export function closeMatching(model, test, labelFor, { invert = false } = {}) {
	const doomed = model.tabs.filter((t) => {
		if (t.pinned) return false;
		const hit = test(haystack(t, labelFor, model.groups));
		return invert ? !hit : hit;
	});
	if (doomed.length >= model.tabs.length) {
		return {
			model,
			refused: 'That would close every tab. At least one has to remain, so nothing was closed.',
			wouldClose: doomed.length
		};
	}
	let next = model;
	for (const t of doomed) next = close(next, t.id).model;
	return { model: next, closed: doomed.length, closedTabs: doomed };
}

export function closeOthers(model, keepId) {
	const keep = model.tabs.filter((t) => t.id === keepId || t.pinned);
	if (!keep.length) return { model };
	return {
		model: { ...model, tabs: ordered(keep, model.groups), activeTab: keepId },
		closed: model.tabs.length - keep.length
	};
}

export function setPinned(model, id, pinned) {
	const tabs = model.tabs.map((t) => (t.id === id ? { ...t, pinned } : t));
	return { model: { ...model, tabs: ordered(tabs, model.groups) } };
}

/**
 * Moves a tab to a position within its own region.
 *
 * Reordering is expressed against the tabs the user can actually see next to
 * each other. A move that could carry a tab out of the pinned region or into
 * the middle of another group would break the ordering invariant on the next
 * render anyway — silently, and looking like the drag simply did not work.
 */
export function reorder(model, id, toIndex) {
	const tab = model.tabs.find((t) => t.id === id);
	if (!tab) return { model };
	const region = (t) => (t.pinned ? 'pinned' : t.group || 'loose');
	const mine = region(tab);
	const siblings = model.tabs.filter((t) => region(t) === mine);
	const others = model.tabs.filter((t) => region(t) !== mine);
	const from = siblings.findIndex((t) => t.id === id);
	const clamped = Math.max(0, Math.min(siblings.length - 1, toIndex));
	siblings.splice(clamped, 0, siblings.splice(from, 1)[0]);
	return { model: { ...model, tabs: ordered([...siblings, ...others], model.groups) } };
}

// ---------------------------------------------------------------- groups

export function createGroup(model, name, colour) {
	if (model.groups.length >= LIMITS.maxGroups) {
		return { model, error: 'That is already ' + LIMITS.maxGroups + ' groups, which is the limit.' };
	}
	const group = {
		id: 'gp-' + Math.random().toString(36).slice(2, 8),
		name: String(name || 'Group').slice(0, LIMITS.maxNameLength),
		colour: GROUP_COLOURS.some((c) => c.id === colour) ? colour : GROUP_COLOURS[0].id,
		collapsed: false,
		order: model.groups.length
	};
	return { model: { ...model, groups: [...model.groups, group] }, group };
}

export function renameGroup(model, groupId, name) {
	const groups = model.groups.map((g) =>
		g.id === groupId ? { ...g, name: String(name || g.name).slice(0, LIMITS.maxNameLength) } : g
	);
	return { model: { ...model, groups } };
}

export function setGroupColour(model, groupId, colour) {
	if (!GROUP_COLOURS.some((c) => c.id === colour)) return { model };
	return {
		model: { ...model, groups: model.groups.map((g) => (g.id === groupId ? { ...g, colour } : g)) }
	};
}

export function setGroupCollapsed(model, groupId, collapsed) {
	return {
		model: {
			...model,
			groups: model.groups.map((g) => (g.id === groupId ? { ...g, collapsed } : g))
		}
	};
}

export function reorderGroup(model, groupId, toIndex) {
	const list = [...model.groups].sort((a, b) => a.order - b.order);
	const from = list.findIndex((g) => g.id === groupId);
	if (from === -1) return { model };
	const clamped = Math.max(0, Math.min(list.length - 1, toIndex));
	list.splice(clamped, 0, list.splice(from, 1)[0]);
	const groups = list.map((g, i) => ({ ...g, order: i }));
	return { model: { ...model, groups, tabs: ordered(model.tabs, groups) } };
}

/**
 * Removes a group without removing its tabs.
 *
 * Deleting a container should never delete its contents. A group is a label on
 * a set of tabs, and losing the label is not a reason to lose the tabs — a
 * mistake nobody can undo from a strip that no longer shows them.
 */
export function deleteGroup(model, groupId) {
	const groups = model.groups.filter((g) => g.id !== groupId).map((g, i) => ({ ...g, order: i }));
	const tabs = model.tabs.map((t) => (t.group === groupId ? { ...t, group: null } : t));
	const released = model.tabs.filter((t) => t.group === groupId).length;
	return { model: { ...model, groups, tabs: ordered(tabs, groups) }, released };
}

export function moveToGroup(model, tabId, groupId) {
	if (groupId !== null && !model.groups.some((g) => g.id === groupId)) return { model };
	// A grouped tab is not pinned: the two regions are exclusive, and a tab in
	// both would have to be drawn twice or in the wrong place.
	const tabs = model.tabs.map((t) =>
		t.id === tabId ? { ...t, group: groupId, pinned: groupId ? false : t.pinned } : t
	);
	return { model: { ...model, tabs: ordered(tabs, model.groups) } };
}

// ---------------------------------------------------------------- dock

export function setDock(model, dock) {
	if (!DOCKS.includes(dock)) return { model };
	return { model: { ...model, dock } };
}

/**
 * How the strip is laid out and driven for a given edge.
 *
 * Both halves are derived from the same edge, so a strip cannot end up
 * announcing one orientation to a screen reader while responding to the arrow
 * keys of the other — which is what happens when they are written separately.
 */
export function axisFor(dock) {
	const vertical = dock === 'left' || dock === 'right';
	return {
		vertical,
		ariaOrientation: vertical ? 'vertical' : 'horizontal',
		previousKey: vertical ? 'ArrowUp' : 'ArrowLeft',
		nextKey: vertical ? 'ArrowDown' : 'ArrowRight',
		// The dimension the overflow calculation must measure. Measuring the other
		// one produces a strip that reports it fits while running off the edge.
		measure: vertical ? 'height' : 'width',
		scroll: vertical ? 'scrollTop' : 'scrollLeft',
		clientSize: vertical ? 'clientHeight' : 'clientWidth',
		scrollSize: vertical ? 'scrollHeight' : 'scrollWidth'
	};
}

/** The tab reached by moving one step along the strip, wrapping at the ends. */
export function step(model, fromId, delta) {
	const visible = model.tabs.filter((t) => {
		const group = model.groups.find((g) => g.id === t.group);
		return !group || !group.collapsed || t.id === model.activeTab;
	});
	if (!visible.length) return fromId;
	const i = visible.findIndex((t) => t.id === fromId);
	if (i === -1) return visible[0].id;
	const next = (i + delta + visible.length) % visible.length;
	return visible[next].id;
}
