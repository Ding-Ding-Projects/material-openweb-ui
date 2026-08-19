// A bulk-action bar that any list can mount.
//
// One implementation, used by every list, because the rule that matters here is
// easy to state and easy to leave out of the fourth list somebody adds: before
// a bulk action runs, the surface must say how many of the selected items are
// not currently visible. Written per-list, three lists have it and the fourth
// does not, and the fourth is where somebody loses something.

import { h, add as append, clear, icon } from './dom.js';
import * as ui from './ui.js';
import * as sel from './selection.js';
import * as formats from './formats.js';

/**
 * @param getScopeIds  the identifiers currently VISIBLE, in view order
 * @param getAllIds    every identifier in the underlying list
 * @param noun         what one item is called, for the sentences
 * @param actions      [{ id, label, icon, danger, confirm, run(ids) }]
 * @param exportRows   optional (ids) => rows, enabling the export action
 */
export function bulkBar({ getScopeIds, getAllIds, noun = 'item', nounPlural, actions = [], exportRows, onChange }) {
  const say = (n) => sel.plural(n, noun, nounPlural);
  let selection = sel.create();
  const bar = h('div', { class: 'bulk', role: 'group', 'aria-label': 'Bulk actions' });

  function state() {
    return sel.summary(selection, getScopeIds(), getAllIds());
  }

  function set(next) {
    selection = next;
    paint();
    if (onChange) onChange(selection);
  }

  function paint() {
    const sum = state();
    clear(bar);
    bar.classList.toggle('bulk--active', sum.selected > 0);

    const scopeIds = getScopeIds();
    const allSelected = sum.allInScopeSelected;

    append(bar,
      h('label', { class: 'bulk__all' },
        h('input', {
          type: 'checkbox',
          checked: allSelected,
          // The tri-state box: some but not all of the view selected.
          // `indeterminate` is a property with no attribute behind it, so it can
          // only be reached once the element exists.
          ref: (el) => { el.indeterminate = sum.visible > 0 && !allSelected; },
          'aria-label': allSelected ? 'Deselect everything visible' : 'Select everything visible',
          onchange: () => set(allSelected ? sel.clearInScope(selection, scopeIds) : sel.selectAllInScope(selection, scopeIds))
        }),
        h('span', {}, allSelected ? 'None' : 'All in view')),
      h('button', { class: 'bulk__link', onclick: () => set(sel.invertInScope(selection, scopeIds)) }, 'Invert'),
      sum.selected ? h('button', { class: 'bulk__link', onclick: () => set(sel.clear()) }, 'Clear selection') : null,
      h('span', { class: 'bulk__count', role: 'status' },
        sum.selected ? sum.selected + ' selected' : 'Nothing selected'),
      // The sentence that has to be there. Rendered whenever anything is
      // selected off-view, not only when a destructive action is chosen.
      sum.hidden
        ? h('span', { class: 'bulk__hidden' },
            icon('warn', 'icon icon--xs'),
            say(sum.hidden) + ' selected but not visible here')
        : null,
      h('span', { style: { flex: '1' } }),
      ...actions.map((a) => h('button', {
        class: 'btn btn--sm ' + (a.danger ? 'btn--danger' : 'btn--outlined'),
        disabled: !sum.selected,
        onclick: () => run(a)
      }, a.icon ? icon(a.icon, 'icon icon--sm') : null, a.label)),
      exportRows
        ? h('button', {
            class: 'btn btn--sm btn--outlined',
            disabled: !sum.selected,
            onclick: () => exportDialog()
          }, icon('download', 'icon icon--sm'), 'Export')
        : null);
  }

  function run(action) {
    const sum = state();
    const ids = [...selection];
    const go = () => {
      action.run(ids);
      set(sel.clear());
    };

    // Two separate reasons to confirm, and only one of them is optional.
    //
    // `confirm: false` suppresses the routine confirmation for an action that
    // opens a dialog of its own. It must NOT suppress the out-of-view warning:
    // that one exists precisely because the action is about to touch things the
    // person cannot see, which is surprising whatever the action is and however
    // harmless. An earlier version let confirm:false skip both, so the label
    // action reached four entries while showing a dialog that mentioned none of
    // the two it could not display.
    if (sum.hidden || (action.confirm !== false && action.danger)) {
      ui.dialog({
        title: action.label,
        emoji: action.danger ? '⚠️' : 'ℹ️',
        body: h('div', { class: 'stack', style: { gap: '10px' } },
          h('p', {}, sel.describeScope(sum, { verb: action.label.toLowerCase(), noun, nounPlural })),
          sum.hidden
            ? h('div', { class: 'state state--warn' }, icon('warn'),
                h('div', { class: 'state__body' },
                  h('div', { class: 'state__text' },
                    'They were selected before the current filter was applied. They are still selected, and this will act on them.')))
            : null,
          sum.stale
            ? h('div', { class: 'muted', style: { fontSize: '.78rem' } },
                say(sum.stale) + ' selected ' + (sum.stale === 1 ? 'no longer exists' : 'no longer exist') + ' and will be skipped.')
            : null),
        actions: [
          { label: 'Cancel' },
          { label: action.label, primary: !action.danger, danger: action.danger, run: go }
        ]
      });
      return;
    }
    go();
  }

  function exportDialog() {
    const sum = state();
    const rows = exportRows([...selection]);
    let format = 'json';
    const preview = h('pre', { class: 'bulk__preview mono' });

    function paintPreview() {
      try {
        const text = formats.serialise(rows, format);
        preview.textContent = text.length > 4000 ? text.slice(0, 4000) + '\n… (' + (text.length - 4000) + ' more characters)' : text;
      } catch (e) {
        preview.textContent = e.message;
      }
    }

    const chooser = ui.select({
      value: format, width: 190, label: 'Format',
      options: formats.FORMATS.map((f) => ({ value: f.id, label: f.label })),
      onChange: (v) => { format = v; paintPreview(); }
    });
    paintPreview();

    ui.dialog({
      title: 'Export ' + say(rows.length),
      emoji: '⬇️',
      wide: true,
      body: h('div', { class: 'stack', style: { gap: '12px' } },
        // The same sentence an action gets. An export is not destructive, but
        // the specific bug this bar replaced was an export that included rows
        // the filter was hiding while announcing that it honoured the filter —
        // so it says what it is about to write, in the same words.
        h('p', {}, sel.describeScope(sum, { verb: 'export', noun, nounPlural })),
        sum.hidden
          ? h('div', { class: 'state state--warn' }, icon('warn'),
              h('div', { class: 'state__body' },
                h('div', { class: 'state__text' },
                  'They were selected before the current filter was applied, and they will be in the file.')))
          : null,
        h('p', { class: 'muted', style: { fontSize: '.8rem', lineHeight: '1.6' } },
          'Written on this machine and saved straight to disk. Nothing is uploaded, and the file is complete on its own — no stylesheet or script is fetched from anywhere when you open it.'),
        chooser.el,
        preview),
      actions: [
        { label: 'Cancel' },
        { label: 'Save', primary: true, run: () => {
          const f = formats.formatFor(format);
          ui.downloadFile(formats.filenameFor(sel.plural(2, noun, nounPlural).slice(2), format), formats.serialise(rows, format), f.mime);
        } }
      ]
    });
  }

  paint();

  return {
    el: bar,
    get selection() { return selection; },
    isSelected: (id) => sel.has(selection, id),
    toggle: (id) => set(sel.toggle(selection, id)),
    range: (from, to) => set(sel.selectRange(selection, getScopeIds(), from, to)),
    /** Called when the underlying list changes, so counts cannot drift upward. */
    refresh: () => set(sel.prune(selection, getAllIds())),
    repaint: paint,
    summary: state
  };
}

/** A row checkbox wired to a bar, including shift-click for a range. */
export function rowCheckbox(bar, id, label) {
  let lastId = null;
  const box = h('input', {
    type: 'checkbox',
    checked: bar.isSelected(id),
    'aria-label': 'Select ' + label,
    onclick: (e) => {
      if (e.shiftKey && lastId) bar.range(lastId, id);
      else bar.toggle(id);
      lastId = id;
    }
  });
  return box;
}
