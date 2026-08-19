// Multi-select for any list.
//
// The whole of this module exists for one problem, and it is the problem that
// causes actual loss: a selection outlives the filter it was made under.
//
// Someone searches, presses "select all", clears the search, and presses
// delete. Every naive implementation deletes what is selected — which is what
// was asked for and is not what was meant. Every careful one either drops the
// out-of-view selections silently, which loses work, or acts on them silently,
// which loses data.
//
// The answer here is neither: the selection is kept whole, and `summary()`
// always reports how much of it is outside the current view so the surface can
// say so BEFORE the action runs. A bulk action that cannot tell you what it is
// about to touch is not a bulk action, it is a gamble.

export function create(ids = []) {
  return new Set(ids);
}

export function has(selection, id) {
  return selection.has(id);
}

export function toggle(selection, id) {
  const next = new Set(selection);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function add(selection, ids) {
  const next = new Set(selection);
  for (const id of ids) next.add(id);
  return next;
}

export function remove(selection, ids) {
  const next = new Set(selection);
  for (const id of ids) next.delete(id);
  return next;
}

export function clear() {
  return new Set();
}

/**
 * Selects everything in the CURRENT view, keeping anything already selected
 * outside it.
 *
 * "Select all" means all of what is on screen. Extending it to the whole
 * underlying list would make a filtered select-all a whole-list select-all,
 * which is the single most surprising thing a list can do.
 */
export function selectAllInScope(selection, scopeIds) {
  return add(selection, scopeIds);
}

/** Deselects everything in the current view, keeping selections outside it. */
export function clearInScope(selection, scopeIds) {
  return remove(selection, scopeIds);
}

/** Flips every item in the current view; anything outside it is untouched. */
export function invertInScope(selection, scopeIds) {
  const next = new Set(selection);
  for (const id of scopeIds) {
    if (next.has(id)) next.delete(id);
    else next.add(id);
  }
  return next;
}

/**
 * A contiguous range within the current view, for shift-click.
 *
 * Ranges are taken from the VIEW rather than the underlying list, because the
 * two rows someone shift-clicked between are the ones they can see. Using the
 * underlying order would sweep in rows the filter is hiding.
 */
export function selectRange(selection, scopeIds, fromId, toId) {
  const a = scopeIds.indexOf(fromId);
  const b = scopeIds.indexOf(toId);
  if (a === -1 || b === -1) return selection;
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return add(selection, scopeIds.slice(lo, hi + 1));
}

/**
 * What a bulk action is about to touch.
 *
 * `hidden` is the number the surface has to state out loud. Everything else is
 * for the toolbar's own labels.
 */
export function summary(selection, scopeIds, allIds) {
  const scope = new Set(scopeIds);
  let visible = 0;
  let hidden = 0;
  let stale = 0;
  const known = allIds ? new Set(allIds) : null;
  for (const id of selection) {
    if (known && !known.has(id)) { stale++; continue; }
    if (scope.has(id)) visible++;
    else hidden++;
  }
  return {
    selected: visible + hidden,
    visible,
    hidden,
    // Items selected earlier that have since been deleted by something else.
    // Counting them as selected would report an action touching more than it can.
    stale,
    inScope: scopeIds.length,
    allInScopeSelected: scopeIds.length > 0 && scopeIds.every((id) => selection.has(id)),
    noneInScopeSelected: scopeIds.every((id) => !selection.has(id))
  };
}

/**
 * A count with its noun, pluralised properly.
 *
 * Naive concatenation produces "2 entrys", which reads as a bug in the sentence
 * that is supposed to be stopping someone from making a mistake — and a warning
 * that looks broken is a warning people stop reading.
 */
export function plural(n, noun, pluralForm) {
  if (n === 1) return n + ' ' + noun;
  if (pluralForm) return n + ' ' + pluralForm;
  if (/[^aeiou]y$/.test(noun)) return n + ' ' + noun.slice(0, -1) + 'ies';
  if (/(s|x|z|ch|sh)$/.test(noun)) return n + ' ' + noun + 'es';
  return n + ' ' + noun + 's';
}

/**
 * The sentence a surface must show before a bulk action runs.
 *
 * Returned as text rather than left to each caller, so no list can forget it —
 * and so the wording is the same everywhere, which is what makes it read as a
 * warning rather than as decoration.
 */
export function describeScope(sum, { verb = 'act on', noun = 'item', nounPlural } = {}) {
  const say = (n) => plural(n, noun, nounPlural);
  if (!sum.selected) return 'Nothing is selected.';
  if (!sum.hidden) return 'This will ' + verb + ' ' + say(sum.selected) + ', all of which are visible.';
  return 'This will ' + verb + ' ' + say(sum.selected) + ', and ' + sum.hidden +
    ' of them ' + (sum.hidden === 1 ? 'is' : 'are') + ' not visible under the current filter.';
}

/** The selected items, in the order the underlying list holds them. */
export function selected(selection, allItems, idOf) {
  return allItems.filter((item) => selection.has(idOf(item)));
}

/**
 * Drops selections for items that no longer exist.
 *
 * Called when the underlying list changes. Without it a selection accumulates
 * identifiers forever and the count creeps above what is actually there.
 */
export function prune(selection, allIds) {
  const known = new Set(allIds);
  const next = new Set();
  for (const id of selection) if (known.has(id)) next.add(id);
  return next;
}
