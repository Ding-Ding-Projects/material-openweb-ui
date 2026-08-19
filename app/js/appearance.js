// Per-element appearance.
//
// The contract asks for something more specific than a theme switch: every
// rendered element exposes "Edit appearance…" from its own context menu, and
// what opens is a real editor — typography down to the axis, shape, elevation,
// and the same set again for each interaction state.
//
// Three rules that shape the design:
//
//   - Overrides are stored against a STABLE key, not a DOM node. Elements are
//     rebuilt on every render here, so anything holding a node reference would
//     lose the edit on the next paint.
//   - Reset works at three depths — one property, one element, everything —
//     because "reset" that only means "all of it" makes people afraid to try
//     anything.
//   - The editor themes itself. A theming feature that cannot theme its own
//     window is not finished, it is a demonstration.

import { h, add, clear, icon } from '../../docs/assets/js/dom.js';
import * as ui from '../../docs/assets/js/ui.js';
import * as state from './state.js';
import { colourPicker } from './colour-picker.js';

const STYLE_ID = 'mowui-appearance';

// ---------------------------------------------------------------- the property set

/**
 * Every property the editor can set.
 *
 * `css` is the declaration written out; `kind` picks the control. The list is
 * hand-written rather than derived from a stylesheet so that a property nobody
 * meant to expose cannot appear by accident.
 */
export const PROPERTIES = [
  // typography
  { id: 'fontFamily', group: 'Typography', label: 'Typeface', css: 'font-family', kind: 'font' },
  { id: 'fontWeight', group: 'Typography', label: 'Weight', css: 'font-weight', kind: 'range', min: 100, max: 1000, step: 1, unit: '' },
  { id: 'fontStyle', group: 'Typography', label: 'Style', css: 'font-style', kind: 'choice', options: ['normal', 'italic', 'oblique'] },
  { id: 'fontSize', group: 'Typography', label: 'Size', css: 'font-size', kind: 'range', min: 8, max: 72, step: 0.5, unit: 'px' },
  { id: 'lineHeight', group: 'Typography', label: 'Line height', css: 'line-height', kind: 'range', min: 0.8, max: 3, step: 0.05, unit: '' },
  { id: 'letterSpacing', group: 'Typography', label: 'Letter spacing', css: 'letter-spacing', kind: 'range', min: -3, max: 12, step: 0.1, unit: 'px' },
  { id: 'wordSpacing', group: 'Typography', label: 'Word spacing', css: 'word-spacing', kind: 'range', min: -6, max: 24, step: 0.5, unit: 'px' },
  { id: 'textTransform', group: 'Typography', label: 'Capitalisation', css: 'text-transform', kind: 'choice', options: ['none', 'uppercase', 'lowercase', 'capitalize'] },
  { id: 'verticalAlign', group: 'Typography', label: 'Baseline offset', css: 'vertical-align', kind: 'range', min: -12, max: 12, step: 0.5, unit: 'px' },
  { id: 'fontVariationSettings', group: 'Typography', label: 'Variable axes', css: 'font-variation-settings', kind: 'axes' },

  // decoration
  { id: 'textDecorationLine', group: 'Decoration', label: 'Line', css: 'text-decoration-line', kind: 'choice', options: ['none', 'underline', 'overline', 'line-through', 'underline overline'] },
  { id: 'textDecorationStyle', group: 'Decoration', label: 'Line style', css: 'text-decoration-style', kind: 'choice', options: ['solid', 'double', 'dotted', 'dashed', 'wavy'] },
  { id: 'textDecorationThickness', group: 'Decoration', label: 'Line thickness', css: 'text-decoration-thickness', kind: 'range', min: 0.5, max: 8, step: 0.5, unit: 'px' },
  { id: 'textUnderlineOffset', group: 'Decoration', label: 'Underline offset', css: 'text-underline-offset', kind: 'range', min: -4, max: 12, step: 0.5, unit: 'px' },
  { id: 'textDecorationColor', group: 'Decoration', label: 'Line colour', css: 'text-decoration-color', kind: 'colour' },

  // colour
  { id: 'color', group: 'Colour', label: 'Text', css: 'color', kind: 'colour' },
  { id: 'background', group: 'Colour', label: 'Background', css: 'background-color', kind: 'colour' },
  { id: 'borderColor', group: 'Colour', label: 'Border', css: 'border-color', kind: 'colour' },

  // shape
  { id: 'borderRadius', group: 'Shape', label: 'Corner radius', css: 'border-radius', kind: 'range', min: 0, max: 48, step: 1, unit: 'px' },
  { id: 'borderWidth', group: 'Shape', label: 'Border width', css: 'border-width', kind: 'range', min: 0, max: 8, step: 0.5, unit: 'px' },
  { id: 'borderStyle', group: 'Shape', label: 'Border style', css: 'border-style', kind: 'choice', options: ['none', 'solid', 'dashed', 'dotted', 'double'] },
  { id: 'padding', group: 'Shape', label: 'Padding', css: 'padding', kind: 'range', min: 0, max: 48, step: 1, unit: 'px' },
  { id: 'opacity', group: 'Shape', label: 'Opacity', css: 'opacity', kind: 'range', min: 0, max: 1, step: 0.01, unit: '' },

  // elevation
  { id: 'boxShadow', group: 'Elevation', label: 'Elevation', css: 'box-shadow', kind: 'elevation' }
];

/**
 * The interaction states an override may target.
 *
 * `:focus-visible` rather than `:focus` on purpose — styling plain focus puts a
 * ring on every mouse click, which is the change people immediately try to undo.
 */
export const STATES = [
  { id: 'base', label: 'Normal', suffix: '' },
  { id: 'hover', label: 'Hover', suffix: ':hover' },
  { id: 'focus', label: 'Keyboard focus', suffix: ':focus-visible' },
  { id: 'active', label: 'Pressed', suffix: ':active' },
  { id: 'disabled', label: 'Disabled', suffix: ':disabled, [aria-disabled="true"]' }
];

const ELEVATIONS = [
  { label: 'None', value: 'none' },
  { label: 'Level 1', value: 'var(--elev1)' },
  { label: 'Level 2', value: 'var(--elev2)' },
  { label: 'Level 3', value: 'var(--elev3)' }
];

// ---------------------------------------------------------------- storage

function all() {
  return state.get('appearance') || {};
}

/**
 * A stable key for an element.
 *
 * `data-ap` is authoritative when present, because it is chosen by whoever
 * built the element and survives every refactor of the markup around it.
 * Without one, the key is derived from the tag and its stable classes — good
 * enough to be useful, and honest about being a guess: an element edited by a
 * derived key says so in the editor.
 */
/**
 * Classes that describe a moment rather than an element, and must never end up
 * in a stored key.
 *
 * `ap-target` is this editor's own marker. Deriving a key while it is present
 * produced `button.wtab.ap-target`, which matched perfectly for exactly as long
 * as the editor stayed open and then silently stopped matching anything the
 * instant it closed — the edit appearing to work and then vanishing with no
 * error anywhere.
 */
const TRANSIENT_CLASS = /^(is-|has-|js-)|^(ap-target|dragging|open|active|selected)$/;

export function keyFor(el) {
  if (el.dataset && el.dataset.ap) return { key: el.dataset.ap, exact: true };
  const classes = Array.from(el.classList || [])
    .filter((c) => !TRANSIENT_CLASS.test(c))
    .slice(0, 2);
  const tag = el.tagName.toLowerCase();
  return { key: tag + (classes.length ? '.' + classes.join('.') : ''), exact: false };
}

/** The CSS selector an override key applies to. */
function selectorFor(key) {
  return key.includes('.') || key.includes('[') ? key : '[data-ap="' + key + '"]';
}

export function get(key, stateId = 'base') {
  const record = all()[key];
  return (record && record[stateId]) || {};
}

export function setProperty(key, stateId, propId, value) {
  const next = { ...all() };
  const record = { ...(next[key] || {}) };
  const forState = { ...(record[stateId] || {}) };
  if (value === null || value === undefined || value === '') delete forState[propId];
  else forState[propId] = value;
  if (Object.keys(forState).length) record[stateId] = forState;
  else delete record[stateId];
  if (Object.keys(record).length) next[key] = record;
  else delete next[key];
  state.set('appearance', next);
  apply();
}

export function resetProperty(key, stateId, propId) {
  setProperty(key, stateId, propId, null);
  state.log('Appearance reset', propId + ' on ' + key);
}

export function resetElement(key) {
  const next = { ...all() };
  delete next[key];
  state.set('appearance', next);
  apply();
  state.log('Appearance reset', 'everything on ' + key);
}

export function resetAll() {
  state.set('appearance', {});
  apply();
  state.log('Appearance reset', 'every element');
}

export function exportJson() {
  return JSON.stringify({ schema: 'mowui.appearance.v1', overrides: all() }, null, 2);
}

/**
 * Reads an exported set back.
 *
 * The schema tag is checked rather than assumed. Importing an arbitrary object
 * as appearance would let any JSON file write CSS declarations into the page,
 * so unrecognised property ids and non-string values are dropped rather than
 * trusted.
 */
export function importJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That is not valid JSON.');
  }
  if (!parsed || parsed.schema !== 'mowui.appearance.v1') {
    throw new Error('That file does not carry the mowui.appearance.v1 schema tag.');
  }
  const known = new Set(PROPERTIES.map((p) => p.id));
  const knownStates = new Set(STATES.map((s) => s.id));
  const clean = {};
  let dropped = 0;
  for (const [key, record] of Object.entries(parsed.overrides || {})) {
    if (typeof key !== 'string' || key.length > 120) { dropped++; continue; }
    const outRecord = {};
    for (const [stateId, props] of Object.entries(record || {})) {
      if (!knownStates.has(stateId)) { dropped++; continue; }
      const outProps = {};
      for (const [propId, value] of Object.entries(props || {})) {
        if (!known.has(propId) || typeof value !== 'string' || value.length > 200) { dropped++; continue; }
        // A declaration may not close its own rule and start a new one.
        if (/[{}<>;]/.test(value)) { dropped++; continue; }
        outProps[propId] = value;
      }
      if (Object.keys(outProps).length) outRecord[stateId] = outProps;
    }
    if (Object.keys(outRecord).length) clean[key] = outRecord;
  }
  state.set('appearance', clean);
  apply();
  state.log('Appearance imported', Object.keys(clean).length + ' elements');
  return { elements: Object.keys(clean).length, dropped };
}

// ---------------------------------------------------------------- applying

/** Writes every override into one stylesheet, replacing whatever was there. */
export function apply() {
  let sheet = document.getElementById(STYLE_ID);
  if (!sheet) {
    sheet = document.createElement('style');
    sheet.id = STYLE_ID;
    document.head.appendChild(sheet);
  }
  const byId = Object.fromEntries(PROPERTIES.map((p) => [p.id, p]));
  const rules = [];
  for (const [key, record] of Object.entries(all())) {
    for (const st of STATES) {
      const props = record[st.id];
      if (!props) continue;
      const decls = Object.entries(props)
        .filter(([id]) => byId[id])
        .map(([id, value]) => byId[id].css + ': ' + value + ' !important;');
      if (!decls.length) continue;
      const base = selectorFor(key);
      const selector = st.suffix
        ? st.suffix.split(',').map((s) => base + s.trim()).join(', ')
        : base;
      rules.push(selector + ' { ' + decls.join(' ') + ' }');
    }
  }
  sheet.textContent = rules.join('\n');
}

// ---------------------------------------------------------------- fonts

let fontCache = null;

/**
 * The typefaces available to choose from.
 *
 * `queryLocalFonts()` needs a permission the user grants once. Where it is not
 * available — or not granted — the list falls back to what this application
 * ships plus the generic families, and SAYS which of the two it is showing. A
 * fallback presented as the whole truth is the thing to avoid: someone hunting
 * for a font they know they installed deserves to be told why it is missing
 * rather than left to conclude the editor is broken.
 */
export async function fonts() {
  if (fontCache) return fontCache;
  const bundled = ['Roboto Flex', 'Roboto Mono', 'Noto Sans HK'];
  const generic = ['system-ui', 'serif', 'sans-serif', 'monospace', 'cursive'];

  if (typeof window.queryLocalFonts !== 'function') {
    fontCache = {
      families: [...bundled, ...generic],
      source: 'bundled',
      note: 'This build cannot enumerate the typefaces installed on this computer, so the list is the faces the application ships plus the generic families. Any other installed face can still be used by typing its exact name.'
    };
    return fontCache;
  }
  try {
    const found = await window.queryLocalFonts();
    const families = [...new Set(found.map((f) => f.family))].sort((a, b) => a.localeCompare(b));
    fontCache = {
      families: [...bundled, ...generic, ...families.filter((f) => !bundled.includes(f))],
      source: 'system',
      note: families.length + ' typefaces installed on this computer, plus the faces this application ships.'
    };
  } catch (e) {
    fontCache = {
      families: [...bundled, ...generic],
      source: 'refused',
      note: 'Permission to read the installed typefaces was not granted, so this is the faces the application ships plus the generic families. Any other installed face can still be used by typing its exact name.'
    };
  }
  return fontCache;
}

// ---------------------------------------------------------------- the editor

/**
 * Opens the editor anchored beside the element being edited.
 *
 * It tracks the anchor while open, because an editor that stays where it was
 * first drawn ends up describing an element that has scrolled off the screen.
 */
export function editor(target, opts = {}) {
  const { key, exact } = opts.key ? { key: opts.key, exact: true } : keyFor(target);
  let stateId = 'base';

  const body = h('div', { class: 'ap__body' });
  const panel = h('div', {
    class: 'ap', role: 'dialog', 'aria-modal': 'false',
    'aria-label': 'Appearance of ' + key,
    // The editor themes itself: this is the only element in the application
    // whose own appearance key is the editor. A theming feature that cannot
    // theme its own window is a demonstration, not a feature.
    'data-ap': 'appearance-editor'
  });

  const scrim = h('div', { class: 'ap__scrim', onclick: () => close() });
  const prevFocus = document.activeElement;

  function position() {
    if (!target.isConnected) return;
    const box = target.getBoundingClientRect();
    const width = panel.offsetWidth || 360;
    const height = panel.offsetHeight || 480;
    // Preferred position is beside the element; second choice is the other side;
    // last resort is wherever it fits. Clamping only the lower bound leaves the
    // panel hanging off the right edge on a narrow window, with the properties
    // that fall off simply unreachable.
    let left = box.right + 12;
    if (left + width > window.innerWidth - 8) left = box.left - width - 12;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    let top = box.top;
    top = Math.max(8, Math.min(top, window.innerHeight - height - 8));
    panel.style.left = Math.round(left) + 'px';
    panel.style.top = Math.round(top) + 'px';
    target.classList.add('ap-target');
  }

  const track = () => position();
  window.addEventListener('scroll', track, true);
  window.addEventListener('resize', track);

  function close() {
    window.removeEventListener('scroll', track, true);
    window.removeEventListener('resize', track);
    document.removeEventListener('keydown', onKey);
    target.classList.remove('ap-target');
    panel.remove();
    scrim.remove();
    // Focus returns to the element that was edited, so a keyboard user is not
    // dropped back at the top of the document.
    if (target.isConnected && target.focus) target.focus();
    else if (prevFocus && prevFocus.focus) prevFocus.focus();
  }
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey);

  // ---------- one control per property ----------

  function control(prop) {
    const current = get(key, stateId)[prop.id];
    const row = h('div', { class: 'ap__prop' + (current ? ' ap__prop--set' : '') });
    const label = h('label', { class: 'ap__label' },
      prop.label,
      current
        ? h('button', {
            type: 'button', class: 'ap__reset', title: 'Reset just this property',
            onclick: () => { resetProperty(key, stateId, prop.id); paint(); }
          }, icon('undo', 'icon icon--xs'), 'Reset')
        : null);

    let field;
    if (prop.kind === 'range') {
      const readout = h('span', { class: 'ap__readout mono' }, current || 'inherited');
      const input = h('input', {
        type: 'range', min: String(prop.min), max: String(prop.max), step: String(prop.step),
        value: String(parseFloat(current) || (prop.min + prop.max) / 2),
        'aria-label': prop.label,
        oninput: (e) => {
          const value = e.target.value + prop.unit;
          readout.textContent = value;
          setProperty(key, stateId, prop.id, value);
        }
      });
      field = h('div', { class: 'ap__range' }, input, readout);
    } else if (prop.kind === 'choice') {
      field = ui.select({
        value: current || prop.options[0],
        width: 190,
        label: prop.label,
        options: [{ value: '', label: 'Inherited' }, ...prop.options.map((o) => ({ value: o, label: o }))],
        onChange: (v) => { setProperty(key, stateId, prop.id, v || null); paint(); }
      }).el;
    } else if (prop.kind === 'elevation') {
      field = ui.select({
        value: current || '',
        width: 190,
        label: prop.label,
        options: [{ value: '', label: 'Inherited' }, ...ELEVATIONS.map((e) => ({ value: e.value, label: e.label }))],
        onChange: (v) => { setProperty(key, stateId, prop.id, v || null); paint(); }
      }).el;
    } else if (prop.kind === 'colour') {
      const preview = h('button', {
        type: 'button', class: 'ap__colour',
        style: { background: current || 'transparent' },
        'aria-label': prop.label + ' — opens a colour picker',
        onclick: () => {
          const picker = colourPicker({
            value: current || '#6750A4',
            background: backgroundOf(target),
            onChange: ({ css }) => {
              preview.style.background = css;
              setProperty(key, stateId, prop.id, css);
            }
          });
          ui.dialog({
            title: prop.label,
            wide: false,
            body: picker.el,
            actions: [{ label: 'Done', primary: true }],
            onClose: paint
          });
        }
      }, current || 'Choose…');
      field = preview;
    } else if (prop.kind === 'font') {
      const input = h('input', {
        type: 'text', list: 'ap-fonts', value: current || '',
        placeholder: 'Inherited', 'aria-label': 'Typeface',
        oninput: (e) => setProperty(key, stateId, prop.id, e.target.value || null)
      });
      const preview = h('div', { class: 'ap__fontpreview' }, 'Handgloves 手民 0123');
      input.addEventListener('input', () => { preview.style.fontFamily = input.value || 'inherit'; });
      preview.style.fontFamily = current || 'inherit';
      field = h('div', { class: 'ap__stack' }, h('div', { class: 'field' }, input), preview);
    } else if (prop.kind === 'axes') {
      // Variable axes are typed rather than guessed at: the axes a face exposes
      // are the face's business, and inventing a list would be fiction.
      const input = h('input', {
        type: 'text', class: 'mono', value: current || '',
        placeholder: '"wght" 500, "wdth" 90', 'aria-label': 'Variable font axes',
        oninput: (e) => setProperty(key, stateId, prop.id, e.target.value || null)
      });
      field = h('div', { class: 'ap__stack' },
        h('div', { class: 'field' }, input),
        h('div', { class: 'ap__hint' },
          'Axis tags as the typeface publishes them. Roboto Flex carries wght, wdth, opsz, GRAD and slnt.'));
    }

    return add(row, label, field);
  }

  // ---------- painting ----------

  function paint() {
    clear(body);
    const overrides = get(key, stateId);
    const count = Object.keys(overrides).length;

    const stateTabs = h('div', { class: 'ap__states', role: 'tablist', 'aria-label': 'Interaction state' });
    for (const st of STATES) {
      const setCount = Object.keys(get(key, st.id)).length;
      add(stateTabs, h('button', {
        type: 'button', role: 'tab', class: 'ap__state' + (st.id === stateId ? ' ap__state--on' : ''),
        'aria-selected': String(st.id === stateId),
        onclick: () => { stateId = st.id; paint(); }
      }, st.label, setCount ? h('span', { class: 'ap__count' }, String(setCount)) : null));
    }

    add(body,
      h('div', { class: 'ap__head' },
        h('div', { class: 'ap__key mono' }, key),
        h('button', { type: 'button', class: 'ap__close', 'aria-label': 'Close', onclick: close }, icon('x', 'icon icon--sm'))),
      exact ? null : h('div', { class: 'ap__hint ap__hint--warn' },
        'This element carries no appearance identifier, so the edit is matched by its tag and classes and will apply to every element that looks the same.'),
      stateTabs,
      h('div', { class: 'ap__scroll' },
        ...groupControls()),
      h('div', { class: 'ap__foot' },
        h('span', { class: 'muted' }, count ? count + ' set on ' + STATES.find((s) => s.id === stateId).label.toLowerCase() : 'Nothing overridden'),
        h('button', {
          type: 'button', class: 'btn btn--outlined btn--sm',
          disabled: !Object.keys(all()[key] || {}).length,
          onclick: () => { resetElement(key); paint(); }
        }, 'Reset this element')));
    position();
  }

  function groupControls() {
    const groups = [];
    let last = null;
    let list = null;
    for (const prop of PROPERTIES) {
      if (prop.group !== last) {
        last = prop.group;
        list = h('div', { class: 'ap__group' }, h('h3', { class: 'ap__grouptitle' }, prop.group));
        groups.push(list);
      }
      add(list, control(prop));
    }
    return groups;
  }

  add(panel, body);
  document.body.appendChild(scrim);
  document.body.appendChild(panel);

  // The typeface list is populated once it is known, rather than blocking the
  // editor on a permission prompt.
  let datalist = document.getElementById('ap-fonts');
  if (!datalist) {
    datalist = h('datalist', { id: 'ap-fonts' });
    document.body.appendChild(datalist);
  }
  fonts().then((f) => {
    clear(datalist);
    for (const family of f.families) add(datalist, h('option', { value: family }));
    const hint = panel.querySelector('.ap__fontsource');
    if (hint) hint.textContent = f.note;
  });

  paint();
  setTimeout(() => (panel.querySelector('button, input') || panel).focus(), 0);
  return { close, key };
}

/** The colour an element actually sits on, for an honest contrast reading. */
function backgroundOf(el) {
  let node = el;
  while (node && node !== document.documentElement) {
    const bg = getComputedStyle(node).backgroundColor;
    const m = bg.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const parts = m[1].split(',').map(Number);
      if (parts.length < 4 || parts[3] > 0.5) return [parts[0] / 255, parts[1] / 255, parts[2] / 255];
    }
    node = node.parentElement;
  }
  return [1, 1, 1];
}

// ---------------------------------------------------------------- wiring

/**
 * Shift+right-click anywhere opens the editor for whatever is under the cursor.
 *
 * The contract asks for this alongside the context-menu entry because not every
 * element in a running application has a context menu of its own, and "every
 * rendered element" has to mean every one.
 */
export function installShortcut() {
  document.addEventListener('contextmenu', (e) => {
    if (!e.shiftKey) return;
    const el = e.target.closest('[data-ap], button, a, input, h1, h2, h3, p, li, td, th, .card, .btn');
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    editor(el);
  }, true);
}

/** The context-menu entry every menu can include. */
export function menuItem(el) {
  return { label: 'Edit appearance…', icon: 'palette', run: () => editor(el) };
}
