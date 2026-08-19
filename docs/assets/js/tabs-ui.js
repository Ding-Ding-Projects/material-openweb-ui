// The tab strip.
//
// Everything about how it behaves comes from `axisFor(dock)` rather than from
// separate horizontal and vertical code paths. Written twice, the two versions
// drift, and the way they drift is the worst possible one: the strip announces
// itself to a screen reader as vertical while responding to left and right, so
// it is broken for exactly the people who cannot see that it is.
//
// The four discovery searches each get their own anchored regex builder. Not a
// shared one — a shared builder means opening the search in one place shows the
// pattern typed in another, which is confusing at best and, when it silently
// applies, wrong.

import { h, add, clear, icon } from './dom.js';
import { searchField } from './regex.js';
import * as ui from './ui.js';
import * as tabsCore from './tabs.js';

// ---------------------------------------------------------------- searches

/**
 * One of the four searches, each anchored to its own field.
 *
 * `scope` decides which of the four this is; everything else is shared, because
 * the contract is explicit that the bulk closes and the searches must agree
 * about what a tab is.
 */
export function searchDialog({ scope, model, labelFor, groupId, onPick, onModel }) {
  const titles = {
    strip: 'Search this strip',
    group: 'Search inside this group',
    groups: 'Search groups by name',
    everything: 'Search every tab and group'
  };
  const field = searchField({
    placeholder: 'Type to filter…',
    label: titles[scope]
  });
  const results = h('div', { class: 'tabsearch__results' });
  const summary = h('div', { class: 'tabsearch__summary', role: 'status' });

  function paint() {
    const matcher = field.matcher();
    clear(results);
    clear(summary);

    if (!matcher.ok) {
      add(summary, h('span', { style: { color: 'var(--err)' } }, matcher.error));
      return;
    }

    const found = scope === 'strip' ? tabsCore.searchStrip(model, matcher.test, labelFor)
      : scope === 'group' ? tabsCore.searchInGroup(model, groupId, matcher.test, labelFor)
      : scope === 'groups' ? tabsCore.searchGroups(model, matcher.test)
      : tabsCore.searchEverything(model, matcher.test, labelFor);

    const total = found.tabs.length + found.groups.length;
    add(summary, h('span', {}, total === 0 ? 'Nothing matched.' : total + ' result' + (total === 1 ? '' : 's')));

    for (const g of found.groups) {
      add(results, h('button', {
        type: 'button', class: 'tabsearch__row tabsearch__row--group',
        onclick: () => { onModel(tabsCore.setGroupCollapsed(model, g.id, false).model, g.id); }
      },
        h('span', { class: 'tabsearch__dot tabsearch__dot--' + g.colour }),
        h('span', { class: 'tabsearch__label' }, g.name),
        h('span', { class: 'tabsearch__where' },
          model.tabs.filter((t) => t.group === g.id).length + ' tabs')));
    }

    for (const t of found.tabs) {
      const group = model.groups.find((g) => g.id === t.group);
      add(results, h('button', {
        type: 'button', class: 'tabsearch__row',
        onclick: () => onPick(t.id)
      },
        h('span', { class: 'tabsearch__label' }, labelFor(t.page)),
        h('span', { class: 'tabsearch__where' },
          t.pinned ? 'pinned' : group ? 'in ' + group.name : 'ungrouped')));
    }
  }

  field.onChange(paint);
  paint();

  const d = ui.dialog({
    title: titles[scope],
    emoji: '🔎',
    wide: true,
    body: h('div', { class: 'stack', style: { gap: '10px' } },
      field.el,
      summary,
      results,
      scope === 'strip' || scope === 'everything'
        ? h('div', { class: 'tabsearch__bulk' },
            h('div', { class: 'tabsearch__bulklabel' }, 'Or close in bulk, using this same match'),
            h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } },
              h('button', { class: 'btn btn--outlined btn--sm', onclick: () => bulk(false) }, 'Close tabs that match'),
              h('button', { class: 'btn btn--outlined btn--sm', onclick: () => bulk(true) }, 'Close tabs that do not match')),
            h('p', { class: 'tabsearch__note' },
              'Pinned tabs are never closed by either of these, and neither will close the last tab. The match is the one above, character for character — the same predicate, not a second one that resembles it.'))
        : null),
    actions: [{ label: 'Done' }]
  });

  function bulk(invert) {
    const matcher = field.matcher();
    if (!matcher.ok) return;
    const result = tabsCore.closeMatching(model, matcher.test, labelFor, { invert });
    if (result.refused) {
      ui.notify(result.refused, { kind: 'bad' });
      return;
    }
    ui.notify(result.closed + ' tab' + (result.closed === 1 ? '' : 's') + ' closed.', { kind: 'ok' });
    d.close();
    onModel(result.model);
  }

  return d;
}

// ---------------------------------------------------------------- group menu

function groupMenu(anchor, model, group, apply) {
  const colourItems = tabsCore.GROUP_COLOURS.map((c) => ({
    label: c.label,
    run: () => apply(tabsCore.setGroupColour(model, group.id, c.id).model)
  }));

  ui.menu(anchor, [
    { label: group.collapsed ? 'Expand this group' : 'Collapse this group', icon: 'grid',
      run: () => apply(tabsCore.setGroupCollapsed(model, group.id, !group.collapsed).model) },
    { label: 'Rename this group…', icon: 'file', run: () => renameDialog(model, group, apply) },
    { label: 'Colour', icon: 'palette', sub: colourItems },
    { separator: true },
    { label: 'Search inside this group…', icon: 'search',
      run: () => searchDialog({
        scope: 'group', model, groupId: group.id,
        labelFor: apply.labelFor,
        onPick: (id) => apply({ ...model, activeTab: id }),
        onModel: apply
      }) },
    { label: 'Move this group to the front', icon: 'arrow',
      run: () => apply(tabsCore.reorderGroup(model, group.id, 0).model) },
    { label: 'Move this group to the back', icon: 'arrow',
      run: () => apply(tabsCore.reorderGroup(model, group.id, model.groups.length - 1).model) },
    { separator: true },
    { label: 'Ungroup these tabs', icon: 'x', danger: true, run: () => {
      const r = tabsCore.deleteGroup(model, group.id);
      ui.notify('The group is gone. Its ' + r.released + ' tab' + (r.released === 1 ? '' : 's') +
        ' are still open, now ungrouped.', { kind: 'ok' });
      apply(r.model);
    } }
  ], { label: 'Group menu', width: 280, filterPlaceholder: 'Filter this menu…' });
}

function renameDialog(model, group, apply) {
  const input = h('input', { type: 'text', value: group.name, 'aria-label': 'Group name' });
  ui.dialog({
    title: 'Rename group',
    body: h('div', { class: 'field' }, input),
    actions: [
      { label: 'Cancel' },
      { label: 'Rename', primary: true, run: () => apply(tabsCore.renameGroup(model, group.id, input.value).model) }
    ]
  });
}

// ---------------------------------------------------------------- the strip

/**
 * Draws the strip into a container.
 *
 * @param model      the tab model
 * @param apply      called with a new model whenever anything changes
 * @param labelFor   page id to human label
 * @param iconFor    page id to icon name
 * @param extras     per-tab menu items contributed by the shell (locks, and so on)
 */
export function renderStrip(container, { model, apply, labelFor, iconFor, extras }) {
  clear(container);
  const axis = tabsCore.axisFor(model.dock);

  container.className = 'tabstrip tabstrip--' + model.dock;
  container.setAttribute('role', 'tablist');
  container.setAttribute('aria-orientation', axis.ariaOrientation);
  container.setAttribute('aria-label', 'Open tabs, docked ' + model.dock);

  // A helper the group menu needs, passed along rather than duplicated.
  apply.labelFor = labelFor;

  const buttons = [];
  let lastGroup;

  function tabButton(t) {
    const group = model.groups.find((g) => g.id === t.group);
    const active = t.id === model.activeTab;
    const btn = h('button', {
      class: 'wtab' + (t.pinned ? ' wtab--pinned' : '') + (group ? ' wtab--grouped' : ''),
      role: 'tab',
      'aria-selected': String(active),
      tabindex: active ? '0' : '-1',
      draggable: 'true',
      'data-tab': t.id,
      title: labelFor(t.page) + (group ? ' — ' + group.name : ''),
      onclick: () => apply({ ...model, activeTab: t.id }),
      oncontextmenu: (e) => { e.preventDefault(); tabMenu(btn, t); }
    },
      icon(iconFor(t.page), 'icon icon--sm'),
      t.pinned ? null : h('span', { class: 'wtab__label' }, labelFor(t.page)),
      ...(extras ? extras.decorate(t) : []),
      t.pinned
        ? null
        : h('span', {
            class: 'wtab__close', role: 'button', 'aria-label': 'Close ' + labelFor(t.page),
            onclick: (e) => { e.stopPropagation(); apply(tabsCore.close(model, t.id).model); }
          }, icon('x', 'icon icon--sm'))
    );

    btn.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', t.id);
      e.dataTransfer.effectAllowed = 'move';
      btn.classList.add('wtab--dragging');
    });
    btn.addEventListener('dragend', () => btn.classList.remove('wtab--dragging'));
    btn.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
    btn.addEventListener('drop', (e) => {
      e.preventDefault();
      const draggedId = e.dataTransfer.getData('text/plain');
      if (!draggedId || draggedId === t.id) return;
      const region = model.tabs.filter((x) => (x.pinned ? 'pinned' : x.group || 'loose') === (t.pinned ? 'pinned' : t.group || 'loose'));
      const toIndex = region.findIndex((x) => x.id === t.id);
      apply(tabsCore.reorder(model, draggedId, toIndex).model);
    });

    buttons.push(btn);
    return btn;
  }

  function tabMenu(anchor, t) {
    const groupItems = [
      ...model.groups.map((g) => ({
        label: g.name,
        run: () => apply(tabsCore.moveToGroup(model, t.id, g.id).model)
      })),
      { label: 'New group…', run: () => {
        const made = tabsCore.createGroup(model, 'Group ' + (model.groups.length + 1), tabsCore.GROUP_COLOURS[model.groups.length % tabsCore.GROUP_COLOURS.length].id);
        if (made.error) { ui.notify(made.error, { kind: 'bad' }); return; }
        apply(tabsCore.moveToGroup(made.model, t.id, made.group.id).model);
      } },
      t.group ? { label: 'Take it out of its group', run: () => apply(tabsCore.moveToGroup(model, t.id, null).model) } : null
    ].filter(Boolean);

    ui.menu(anchor, [
      { label: t.pinned ? 'Unpin this tab' : 'Pin this tab', icon: 'lock',
        run: () => apply(tabsCore.setPinned(model, t.id, !t.pinned).model) },
      { label: 'Move to group', icon: 'grid', sub: groupItems },
      { separator: true },
      ...(extras ? extras.items(anchor, t) : []),
      { separator: true },
      { label: 'Search these tabs…', icon: 'search',
        run: () => searchDialog({
          scope: 'strip', model, labelFor,
          onPick: (id) => apply({ ...model, activeTab: id }),
          onModel: apply
        }) },
      { separator: true },
      { label: 'Close this tab', icon: 'x', danger: true,
        run: () => apply(tabsCore.close(model, t.id).model) },
      { label: 'Close other tabs', icon: 'x',
        run: () => apply(tabsCore.closeOthers(model, t.id).model) },
      { label: 'Close tabs containing text…', icon: 'search',
        run: () => searchDialog({ scope: 'strip', model, labelFor, onPick: (id) => apply({ ...model, activeTab: id }), onModel: apply }) }
    ], { label: 'Tab menu', width: 280, filterPlaceholder: 'Filter this menu…' });
  }

  // ---------- the regions, in order ----------

  const pinned = model.tabs.filter((t) => t.pinned);
  if (pinned.length) {
    const region = h('div', { class: 'tabstrip__pinned', 'aria-label': 'Pinned tabs' });
    for (const t of pinned) add(region, tabButton(t));
    add(container, region, h('div', { class: 'tabstrip__divider', 'aria-hidden': 'true' }));
  }

  for (const t of model.tabs) {
    if (t.pinned) continue;
    const group = model.groups.find((g) => g.id === t.group);
    if (group && group.id !== lastGroup) {
      lastGroup = group.id;
      const count = model.tabs.filter((x) => x.group === group.id).length;
      const header = h('button', {
        type: 'button',
        class: 'tabgroup__head tabgroup__head--' + group.colour,
        'aria-expanded': String(!group.collapsed),
        title: group.name + ' — ' + count + ' tabs',
        onclick: () => apply(tabsCore.setGroupCollapsed(model, group.id, !group.collapsed).model),
        oncontextmenu: (e) => { e.preventDefault(); groupMenu(header, model, group, apply); }
      }, h('span', { class: 'tabgroup__dot' }), group.name, group.collapsed ? h('span', { class: 'tabgroup__count' }, String(count)) : null);
      add(container, header);
    }
    if (!group) lastGroup = undefined;
    if (group && group.collapsed && t.id !== model.activeTab) continue;
    add(container, tabButton(t));
  }

  // ---------- keyboard, on the axis this dock actually runs along ----------

  container.addEventListener('keydown', (e) => {
    if (e.key === axis.previousKey || e.key === axis.nextKey) {
      e.preventDefault();
      const next = tabsCore.step(model, model.activeTab, e.key === axis.nextKey ? 1 : -1);
      apply({ ...model, activeTab: next });
      return;
    }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const visible = model.tabs.filter((t) => {
        const g = model.groups.find((x) => x.id === t.group);
        return !g || !g.collapsed || t.id === model.activeTab;
      });
      apply({ ...model, activeTab: (e.key === 'Home' ? visible[0] : visible[visible.length - 1]).id });
    }
  });

  // ---------- the strip's own menu ----------

  const stripMenu = (anchor) => ui.menu(anchor, [
    { label: 'Dock the strip', icon: 'desktop', sub: tabsCore.DOCKS.map((d) => ({
      label: d[0].toUpperCase() + d.slice(1) + (d === model.dock ? ' (current)' : ''),
      run: () => apply(tabsCore.setDock(model, d).model)
    })) },
    { separator: true },
    { label: 'Search this strip…', icon: 'search',
      run: () => searchDialog({ scope: 'strip', model, labelFor, onPick: (id) => apply({ ...model, activeTab: id }), onModel: apply }) },
    { label: 'Search groups by name…', icon: 'search',
      run: () => searchDialog({ scope: 'groups', model, labelFor, onPick: (id) => apply({ ...model, activeTab: id }), onModel: apply }) },
    { label: 'Search everything…', icon: 'search',
      run: () => searchDialog({ scope: 'everything', model, labelFor, onPick: (id) => apply({ ...model, activeTab: id }), onModel: apply }) },
    { separator: true },
    { label: 'New group…', icon: 'plus', run: () => {
      const made = tabsCore.createGroup(model, 'Group ' + (model.groups.length + 1), tabsCore.GROUP_COLOURS[model.groups.length % tabsCore.GROUP_COLOURS.length].id);
      if (made.error) { ui.notify(made.error, { kind: 'bad' }); return; }
      apply(made.model);
    } }
  ], { label: 'Tab strip menu', width: 260, filterPlaceholder: 'Filter this menu…' });

  const more = h('button', {
    class: 'tabstrip__more', 'aria-label': 'Tab strip options',
    onclick: () => stripMenu(more)
  }, icon('menu', 'icon icon--sm'));
  add(container, more);

  container.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.wtab, .tabgroup__head')) return;
    e.preventDefault();
    stripMenu(more);
  });

  // ---------- overflow, measured on the right axis ----------
  //
  // Measuring the other dimension produces a strip that reports it fits while
  // running off the edge, which is exactly as useless as no measurement at all.
  requestAnimationFrame(() => {
    const overflowing = container[axis.scrollSize] > container[axis.clientSize] + 1;
    container.classList.toggle('tabstrip--overflowing', overflowing);
    const active = container.querySelector('[aria-selected="true"]');
    if (active && overflowing) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });

  return { axis };
}
