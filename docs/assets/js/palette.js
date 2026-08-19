// The documentation site's palette: what it can reach, and nothing about how a
// palette works. That lives in palette-core.js, which the desktop application
// uses too — so the two cannot end up behaving differently.

import { createPalette } from './palette-core.js';
import * as store from './store.js';
import * as settingsDef from './settings.js';
import { PAGES, PAGE_ORDER } from './pages.js';
import { FEATURES, DOCS } from './content.js';

function entries() {
  const out = [];

  for (const id of PAGE_ORDER) {
    out.push({
      kind: 'page', id: 'page-' + id, icon: PAGES[id].icon,
      label: PAGES[id].title(), hint: 'page',
      run: () => window.mowui.open(id)
    });
  }

  // A setting row carries the control the settings page itself builds, from the
  // same factory. Changing it here validates, persists and records history
  // identically, because there is only one implementation to disagree with.
  for (const r of settingsDef.visibleRows()) {
    const c = settingsDef.control(r, () => window.mowui.refresh());
    out.push({
      kind: 'setting', id: r.id, icon: 'gear',
      label: r.label(), hint: 'setting · ' + r.section,
      control: c.el,
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
    { kind: 'action', id: 'act-size', icon: 'grid', label: 'Switch palette between card and full window', hint: 'action', run: () => palette.toggleSize() },
    { kind: 'action', id: 'act-reset', icon: 'trash', label: 'Reset this site', hint: 'action · destructive', run: () => window.mowui.open('settings', null, 'set-theme') }
  );

  return out;
}

const palette = createPalette({
  entries,
  getSize: () => store.get('settings').paletteSize || 'card',
  setSize: (v) => store.patchSettings({ paletteSize: v }, { path: 'paletteSize', label: 'Palette size → ' + v }),
  placeholder: 'Search every page, setting and action…'
});

export const show = palette.show;
export const close = palette.close;
export const toggle = palette.toggle;
export const isOpen = palette.isOpen;
