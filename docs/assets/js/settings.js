// Settings are defined once, as data, and rendered by both the settings page
// and the command palette.
//
// That is what makes a palette row a real control rather than a shortcut to
// one: both paths call the same `control()` factory, so they cannot disagree
// about the value, the validation, the persistence or the history entry.
//
// Every row carries two things a settings surface owes the reader: an
// explanation behind progressive disclosure that says what the setting does
// rather than restating its label, and a provenance line that says whether the
// current value is theirs or a compiled-in default — naming the real default
// rather than the opaque word "default".

import { h, icon } from './dom.js';
import * as ui from './ui.js';
import * as store from './store.js';
import * as i18n from './i18n.js';

export const THEMES = [
  { value: 'system', label: 'Follow this device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
];

function levelLabel(n) {
  return ['1 — fully serious', '2 — dry', '3 — warm', '4 — playful', '5 — maximum'][n - 1] || String(n);
}

/** Every row the palette must be able to find and operate. */
export const ROWS = [
  {
    id: 'set-language',
    path: 'language',
    section: 'General',
    label: () => i18n.t('set.language'),
    why: () => i18n.t('set.languageWhy'),
    kind: 'select',
    options: () => i18n.LANGUAGES.map((l) => ({ value: l, label: l })),
    get: () => store.settingValue('language'),
    set: (v) => store.patchSettings({ language: v }, { path: 'language', label: 'Language mode → ' + v }),
    hiddenUnderSchool: true
  },
  {
    id: 'set-funny-en',
    path: 'funnyEn',
    section: 'General',
    label: () => i18n.t('set.funnyEn'),
    why: () => i18n.t('set.funnyWhy'),
    kind: 'range',
    min: 1, max: 5, step: 1,
    format: levelLabel,
    get: () => store.settingValue('funnyEn'),
    set: (v) => store.patchSettings({ funnyEn: Number(v) }, { path: 'funnyEn', label: 'Funny level (English) → ' + v }),
    hiddenUnderSchool: true
  },
  {
    id: 'set-funny-zh',
    path: 'funnyZh',
    section: 'General',
    label: () => i18n.t('set.funnyZh'),
    why: () => i18n.t('set.funnyWhy'),
    kind: 'range',
    min: 1, max: 5, step: 1,
    format: levelLabel,
    get: () => store.settingValue('funnyZh'),
    set: (v) => store.patchSettings({ funnyZh: Number(v) }, { path: 'funnyZh', label: 'Funny level (Cantonese) → ' + v }),
    hiddenUnderSchool: true
  },
  {
    id: 'set-theme',
    path: 'theme',
    section: 'Appearance',
    label: () => i18n.t('set.theme'),
    why: () => i18n.t('set.themeWhy'),
    kind: 'select',
    options: () => THEMES,
    get: () => store.settingValue('theme'),
    set: (v) => store.patchSettings({ theme: v }, { path: 'theme', label: 'Theme → ' + v })
  },
  {
    id: 'set-scale',
    path: 'scale',
    section: 'Appearance',
    label: () => i18n.t('set.scale'),
    why: () => 'Scales every text size on this site proportionally. Layouts are checked at each step for clipping, so a larger size reflows rather than truncating.',
    kind: 'range',
    min: 0.85, max: 1.4, step: 0.05,
    format: (v) => Math.round(v * 100) + '%',
    get: () => store.settingValue('scale'),
    set: (v) => store.patchSettings({ scale: Number(v) }, { path: 'scale', label: 'Text size → ' + Math.round(v * 100) + '%' })
  },
  {
    id: 'set-density',
    path: 'density',
    section: 'Appearance',
    label: () => i18n.t('set.density'),
    why: () => 'Adds or removes height from controls without changing their type size, so a denser layout stays as readable and as tappable as a comfortable one.',
    kind: 'range',
    min: -1, max: 2, step: 1,
    format: (v) => ['Compact', 'Default', 'Comfortable', 'Spacious'][Number(v) + 1] || String(v),
    get: () => store.settingValue('density'),
    set: (v) => store.patchSettings({ density: Number(v) }, { path: 'density', label: 'Density → ' + v })
  },
  {
    id: 'set-radius',
    path: 'radiusScale',
    section: 'Appearance',
    label: () => i18n.t('set.radius'),
    why: () => 'Scales every corner radius together. Material 3 shape is a system rather than a per-element choice, so this moves the whole product at once.',
    kind: 'range',
    min: 0, max: 1.5, step: 0.1,
    format: (v) => Number(v) === 0 ? 'Square' : Math.round(v * 100) + '%',
    get: () => store.settingValue('radiusScale'),
    set: (v) => store.patchSettings({ radiusScale: Number(v) }, { path: 'radiusScale', label: 'Corner radius → ' + v })
  },
  {
    id: 'set-emoji',
    path: 'emojiDialogs',
    section: 'General',
    label: () => i18n.t('set.emoji'),
    why: () => i18n.t('set.emojiWhy'),
    kind: 'switch',
    get: () => !!store.settingValue('emojiDialogs'),
    set: (v) => store.patchSettings({ emojiDialogs: !!v }, { path: 'emojiDialogs', label: 'Emoji in dialogs → ' + (v ? 'on' : 'off') }),
    hiddenUnderSchool: true
  },
  {
    id: 'set-app-name',
    path: 'appName',
    section: 'General',
    label: () => i18n.t('set.appName'),
    why: () => i18n.t('set.appNameWhy'),
    kind: 'text',
    placeholder: 'Material Open WebUI',
    get: () => store.settingValue('appName'),
    set: (v) => store.patchSettings({ appName: v }, { path: 'appName', label: 'Display name → ' + (v || '(shipped name)') })
  },
  {
    id: 'set-palette-size',
    path: 'paletteSize',
    section: 'General',
    label: () => 'Command palette size',
    why: () => 'The palette opens as a bounded card by default and can be switched to a full-window view. The choice is remembered.',
    kind: 'select',
    options: () => [{ value: 'card', label: 'Bounded card' }, { value: 'full', label: 'Full window' }],
    get: () => store.settingValue('paletteSize'),
    set: (v) => store.patchSettings({ paletteSize: v }, { path: 'paletteSize', label: 'Palette size → ' + v })
  }
];

/** Whether School mode is on right now. */
export function schoolIsOn() {
  const school = store.get('settings').school;
  return Boolean(school && school.on);
}

/**
 * A list of features with the playful ones REMOVED under School mode.
 *
 * Every surface that lists features calls this. The settings page had its own
 * filter and the other three surfaces had none, so turning School mode on hid
 * the controls while the features page, the documentation list and the command
 * palette all went on naming the same features in their search results — which
 * is the leak the mode exists to prevent, arrived at from three directions.
 */
export function withoutHidden(items) {
  if (!schoolIsOn()) return items;
  return items.filter((x) => !x.playful);
}

export function visibleRows() {
  const school = store.get('settings').school;
  // Under School mode the playful settings are OMITTED, not disabled — a
  // greyed-out control still names the thing it is hiding.
  return ROWS.filter((r) => !(school && school.on && r.hiddenUnderSchool));
}

export function rowById(id) {
  return visibleRows().find((r) => r.id === id);
}

/** Truthful provenance: whose value is this, and if it is a default, which one. */
export function provenance(row) {
  if (store.isUserSet(row.path)) return i18n.t('set.provUser');
  const d = store.DEFAULTS.settings[row.path];
  const shown = row.format ? row.format(d) : (typeof d === 'boolean' ? (d ? 'on' : 'off') : String(d === '' ? '(none)' : d));
  return i18n.t('set.provDefault') + shown;
}

/**
 * Builds the live control for a row. Used by BOTH the settings page and the
 * palette, which is the whole point of defining rows as data.
 */
export function control(row, onAfter) {
  const after = () => { if (onAfter) onAfter(); };

  if (row.kind === 'switch') {
    const t = ui.toggle({ checked: row.get(), label: row.label(), onChange: (v) => { row.set(v); after(); } });
    return { el: t.el, sync: () => t.set(row.get()) };
  }

  if (row.kind === 'select') {
    const s = ui.select({
      value: row.get(),
      options: row.options(),
      label: row.label(),
      width: 210,
      onChange: (v) => { row.set(v); after(); }
    });
    return { el: s.el, sync: () => s.set(row.get()) };
  }

  if (row.kind === 'range') {
    const out = h('span', { class: 'mono', style: { fontSize: '.74rem', color: 'var(--onsv)', minWidth: '108px', textAlign: 'right' } });
    const input = h('input', {
      type: 'range', class: 'slider', min: String(row.min), max: String(row.max), step: String(row.step),
      value: String(row.get()), 'aria-label': row.label(),
      style: { width: '150px' },
      oninput: (e) => { out.textContent = row.format ? row.format(Number(e.target.value)) : e.target.value; },
      onchange: (e) => { row.set(Number(e.target.value)); after(); }
    });
    out.textContent = row.format ? row.format(Number(row.get())) : String(row.get());
    return {
      el: h('div', { class: 'row', style: { gap: '10px' } }, input, out),
      sync: () => { input.value = String(row.get()); out.textContent = row.format ? row.format(Number(row.get())) : String(row.get()); }
    };
  }

  if (row.kind === 'text') {
    const input = h('input', {
      type: 'text', value: row.get() || '', placeholder: row.placeholder || '', 'aria-label': row.label(),
      onchange: (e) => { row.set(e.target.value.slice(0, 80)); after(); }
    });
    return {
      el: h('div', { class: 'field', style: { width: '240px' } }, input),
      sync: () => { input.value = row.get() || ''; }
    };
  }

  return { el: h('span', { class: 'muted' }, 'no control'), sync: () => {} };
}

/** One full settings row: label, provenance, disclosure, and the live control. */
export function renderRow(row, onAfter) {
  const c = control(row, onAfter);
  const el = h('div', { class: 'setting', id: row.id, dataset: { settingRow: row.id } },
    h('div', { class: 'setting__main' },
      h('div', { class: 'setting__label' }, row.label()),
      i18n.isBilingual() ? h('div', { class: 'muted cjk', style: { fontSize: '.8rem' } }, '') : null,
      h('div', { class: 'setting__prov' }, provenance(row)),
      h('details', { class: 'setting__why' },
        h('summary', {}, 'What does this do?'),
        h('p', {}, row.why())
      )
    ),
    h('div', { class: 'setting__control' }, c.el)
  );
  return { el, sync: c.sync };
}
