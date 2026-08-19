// The command palette, on Ctrl+Shift+F.
//
// Two things separate this from a list of links:
//   * A setting result renders its REAL control inline, built by the same
//     factory the settings page uses. Changing it here validates, persists and
//     records history identically, because it is not a copy.
//   * Selecting a destination teleports: it opens the owning surface, scrolls
//     the exact element into view, focuses it and flashes it briefly, rather
//     than dropping the reader on a page to hunt.

import { h, icon, clear, trapFocus } from './dom.js';
import { makeMatcher, searchField } from './regex.js';
import * as ui from './ui.js';
import * as store from './store.js';
import * as i18n from './i18n.js';
import * as settingsDef from './settings.js';
import { PAGES, PAGE_ORDER } from './pages.js';
import { FEATURES, DOCS } from './content.js';

let open = null;

export function isOpen() {
  return !!open;
}

function entries() {
  const out = [];

  for (const id of PAGE_ORDER) {
    out.push({
      kind: 'page', id: 'page-' + id, icon: PAGES[id].icon,
      label: PAGES[id].title(), hint: 'page',
      run: () => window.mowui.open(id)
    });
  }

  for (const r of settingsDef.visibleRows()) {
    out.push({
      kind: 'setting', id: r.id, icon: 'gear',
      label: r.label(), hint: 'setting · ' + r.section,
      row: r,
      run: () => window.mowui.open('settings', null, r.id)
    });
  }

  for (const f of FEATURES) {
    out.push({
      kind: 'feature', id: 'feature-' + f.id, icon: f.icon,
      label: f.name, hint: 'feature · ' + f.group,
      run: () => window.mowui.open('features', null, 'feature-' + f.id)
    });
  }

  for (const d of DOCS) {
    out.push({
      kind: 'doc', id: 'doc-' + d.id, icon: 'book',
      label: d.title + ' — article', hint: 'documentation',
      run: () => window.mowui.open('docs', d.id)
    });
  }

  out.push(
    { kind: 'action', id: 'act-theme', icon: 'sun', label: 'Toggle light and dark', hint: 'action', run: () => window.mowui.toggleTheme() },
    { kind: 'action', id: 'act-export', icon: 'download', label: 'Export everything this site has stored', hint: 'action', run: () => window.mowui.exportAll() },
    { kind: 'action', id: 'act-size', icon: 'grid', label: 'Switch palette between card and full window', hint: 'action', run: () => togglePaletteSize() },
    { kind: 'action', id: 'act-reset', icon: 'trash', label: 'Reset this site', hint: 'action · destructive', run: () => window.mowui.open('settings', null, 'set-theme') }
  );

  return out;
}

function togglePaletteSize() {
  const next = store.get('settings').paletteSize === 'full' ? 'card' : 'full';
  store.patchSettings({ paletteSize: next }, { path: 'paletteSize', label: 'Palette size → ' + next });
  if (open) { close(); show(); }
}

export function show() {
  if (open) return;

  const size = store.get('settings').paletteSize || 'card';
  const list = h('div', { class: 'palette__list', role: 'listbox', 'aria-label': 'Results' });
  const live = h('div', { class: 'sr-only', 'aria-live': 'polite' });

  const state = { query: '', pattern: '', flags: 'i', useRegex: false };
  let active = 0;
  let rows = [];

  const input = h('input', {
    class: 'palette__input', type: 'text', id: 'palette-input',
    placeholder: i18n.t('palette.placeholder'),
    'aria-label': i18n.t('palette.placeholder'),
    autocomplete: 'off', spellcheck: 'false',
    oninput: (e) => {
      if (state.useRegex) state.pattern = e.target.value; else state.query = e.target.value;
      active = 0;
      render();
    }
  });

  const rxBtn = h('button', {
    type: 'button', class: 'rx-btn', 'aria-pressed': 'false', 'aria-haspopup': 'dialog',
    title: i18n.t('search.regex'), 'aria-label': i18n.t('search.regex'),
    onclick: () => openBuilder()
  }, '.*');

  function openBuilder() {
    // The palette's own field gets the same anchored builder every other field
    // has, bound to this field's state and nothing else.
    const f = searchField({ query: state.query, pattern: state.pattern, flags: state.flags, sampleFrom: () => entries().slice(0, 8).map((e) => e.label) });
    f.state.useRegex = state.useRegex;
    f.onChange((s) => {
      state.query = s.query; state.pattern = s.pattern; state.flags = s.flags; state.useRegex = s.useRegex;
      input.value = s.useRegex ? s.pattern : s.query;
      input.classList.toggle('mono', s.useRegex);
      rxBtn.setAttribute('aria-pressed', String(s.useRegex));
      render();
    });
    f.el.querySelector('.rx-btn').click();
  }

  function render() {
    const m = makeMatcher(state);
    rows = entries().filter((e) => m.test(e.label + ' ' + e.hint));
    clear(list);

    if (!rows.length) {
      list.appendChild(h('div', { class: 'menu__empty' },
        m.ok ? i18n.t('empty.noMatch') : 'That pattern is not valid yet.'));
      live.textContent = '0 results';
      return;
    }

    rows.forEach((e, i) => {
      const row = h('button', {
        type: 'button', class: 'palette__row', role: 'option',
        dataset: { active: String(i === active) },
        'aria-selected': String(i === active),
        onclick: () => { if (e.kind !== 'setting') { close(); e.run(); } }
      },
        icon(e.icon, 'icon icon--sm'),
        h('span', { class: 'palette__label' }, e.label),
        h('span', { class: 'palette__hint' }, e.hint)
      );

      // A setting row carries the real control, so it can be changed here.
      if (e.kind === 'setting') {
        const c = settingsDef.control(e.row, () => { window.mowui.refresh(); render(); });
        const holder = h('span', { class: 'palette__control', onclick: (ev) => ev.stopPropagation() }, c.el);
        row.appendChild(holder);
        row.appendChild(h('span', {
          class: 'btn btn--text', style: { height: '30px', fontSize: '.72rem' },
          onclick: (ev) => { ev.stopPropagation(); close(); e.run(); }
        }, 'Go'));
      }

      list.appendChild(row);
    });
    live.textContent = rows.length + ' results';
  }

  const el = h('div', {
    class: 'palette' + (size === 'full' ? ' palette--full' : ''),
    role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Command palette'
  },
    h('div', { class: 'palette__head' },
      icon('search', 'icon icon--sm'),
      input,
      rxBtn,
      h('button', {
        class: 'btn btn--text', style: { height: '32px', fontSize: '.72rem' },
        onclick: () => togglePaletteSize(),
        'aria-label': 'Switch palette size'
      }, size === 'full' ? 'Card' : 'Full'),
      h('span', { class: 'chip chip--tonal mono', style: { height: '24px', fontSize: '.66rem' } }, 'esc')
    ),
    live,
    list
  );

  const scrim = h('div', { class: 'scrim', style: { zIndex: '100' }, onclick: close });
  document.body.append(scrim, el);
  const untrap = trapFocus(el);

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, rows.length - 1); render(); scrollActive(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); render(); scrollActive(); }
    if (e.key === 'Enter' && rows[active]) { e.preventDefault(); const r = rows[active]; close(); r.run(); }
  }
  function scrollActive() {
    const node = list.children[active];
    if (node && node.scrollIntoView) node.scrollIntoView({ block: 'nearest' });
  }

  el.addEventListener('keydown', onKey);

  open = { el, scrim, untrap, onKey };
  render();
  setTimeout(() => input.focus(), 0);
}

export function close() {
  if (!open) return;
  open.untrap();
  open.el.remove();
  open.scrim.remove();
  open = null;
}

/** Opens the palette, or closes it if it is already open. */
export function toggle() {
  open ? close() : show();
}
