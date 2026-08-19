#!/usr/bin/env node
// The appearance editor's contract, and the colour translator's honesty.
//
// This runs the real module against a small DOM stand-in rather than reading
// the source for keywords, because the two defects worth catching here are both
// behavioural and both silent:
//
//   - A key derived while the editor's own marker class is on the element comes
//     out as `button.wtab.ap-target`, which matches for exactly as long as the
//     editor stays open and then stops matching anything. The edit appears to
//     work and vanishes on close, with nothing logged.
//   - An imported override file that is not screened can write arbitrary CSS
//     declarations into the page, because that is precisely what the feature
//     does with what it is given.
//
//   node scripts/test-appearance.mjs

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const ROOT = process.cwd();
let failures = 0;
function check(name, ok, detail = '') {
  if (ok) console.log('  pass  ' + name);
  else { console.error('  FAIL  ' + name + (detail ? ' — ' + detail : '')); failures++; }
}

// ---------- a DOM small enough to be honest about ----------
//
// Only the handful of members the module actually touches. A fuller fake would
// invite the test to pass against behaviour the browser does not have.

const created = [];
function fakeElement(tag) {
  const el = {
    tagName: tag.toUpperCase(),
    id: '',
    dataset: {},
    style: {},
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      contains(c) { return this._set.has(c); },
      [Symbol.iterator]() { return this._set[Symbol.iterator](); }
    },
    children: [],
    textContent: '',
    isConnected: true,
    appendChild(c) { this.children.push(c); return c; },
    append(...c) { this.children.push(...c); },
    remove() {},
    setAttribute() {},
    getAttribute() { return null; },
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { top: 0, left: 0, right: 100, bottom: 30, width: 100, height: 30 }; },
    focus() {}
  };
  created.push(el);
  return el;
}

const head = fakeElement('head');
const body = fakeElement('body');

globalThis.document = {
  head, body,
  documentElement: fakeElement('html'),
  activeElement: null,
  createElement: fakeElement,
  createTextNode: (t) => ({ nodeValue: t }),
  createDocumentFragment: () => fakeElement('fragment'),
  getElementById: (id) => created.find((e) => e.id === id) || null,
  addEventListener() {},
  removeEventListener() {},
  querySelector() { return null; }
};
globalThis.window = {
  innerWidth: 1280, innerHeight: 800,
  addEventListener() {}, removeEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  localStorage: undefined,
  getComputedStyle: () => ({ backgroundColor: 'rgb(255, 255, 255)' })
};
globalThis.getComputedStyle = window.getComputedStyle;
globalThis.localStorage = {
  _d: new Map(),
  getItem(k) { return this._d.has(k) ? this._d.get(k) : null; },
  setItem(k, v) { this._d.set(k, String(v)); },
  removeItem(k) { this._d.delete(k); }
};
window.localStorage = globalThis.localStorage;

const mod = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
const ap = await mod('app/js/appearance.js');

// ---------- keys ----------

console.log('keys');

function withClasses(tag, ...classes) {
  const el = fakeElement(tag);
  for (const c of classes) el.classList.add(c);
  return el;
}

check('a data-ap identifier wins and is reported as exact', (() => {
  const el = fakeElement('button');
  el.dataset.ap = 'send-button';
  const k = ap.keyFor(el);
  return k.key === 'send-button' && k.exact === true;
})());

check('a derived key is reported as inexact rather than presented as certain', (() => {
  const k = ap.keyFor(withClasses('button', 'wtab'));
  return k.key === 'button.wtab' && k.exact === false;
})());

// The regression that prompted this file.
check("the editor's own marker class never lands in a key",
  ap.keyFor(withClasses('button', 'wtab', 'ap-target')).key === 'button.wtab',
  ap.keyFor(withClasses('button', 'wtab', 'ap-target')).key);

check('other momentary classes are excluded too', (() => {
  const k = ap.keyFor(withClasses('div', 'card', 'dragging', 'is-open')).key;
  return k === 'div.card';
})(), ap.keyFor(withClasses('div', 'card', 'dragging', 'is-open')).key);

// ---------- setting and resetting ----------

console.log('');
console.log('setting and resetting');

const KEY = 'test-element';
ap.resetAll();
ap.setProperty(KEY, 'base', 'borderRadius', '2px');
ap.setProperty(KEY, 'base', 'fontSize', '19px');
ap.setProperty(KEY, 'hover', 'color', '#00ff00');

const sheet = () => (document.getElementById('mowui-appearance') || { textContent: '' }).textContent;

check('a base override is written as a rule', /border-radius: 2px/.test(sheet()), sheet());
check('a state override is written against its own selector',
  /:hover/.test(sheet()) && /#00ff00/.test(sheet()), sheet());
check('an override wins over the stylesheet it is overriding',
  (sheet().match(/!important/g) || []).length >= 3, sheet());

check('one property resets without touching its neighbours', (() => {
  ap.resetProperty(KEY, 'base', 'borderRadius');
  return !/border-radius/.test(sheet()) && /font-size: 19px/.test(sheet());
})(), sheet());

check('one element resets without touching the others', (() => {
  ap.setProperty('other-element', 'base', 'opacity', '0.5');
  ap.resetElement(KEY);
  return !/font-size/.test(sheet()) && /opacity: 0\.5/.test(sheet());
})(), sheet());

check('resetting everything leaves nothing behind', (() => {
  ap.resetAll();
  return sheet() === '';
})(), sheet());

// ---------- import screening ----------

console.log('');
console.log('import screening');

function throws(fn) { try { fn(); return false; } catch { return true; } }

check('a file without the schema tag is refused',
  throws(() => ap.importJson(JSON.stringify({ overrides: { a: { base: { color: 'red' } } } }))));
check('something that is not JSON is refused', throws(() => ap.importJson('not json at all')));

const result = ap.importJson(JSON.stringify({
  schema: 'mowui.appearance.v1',
  overrides: {
    good: { base: { color: '#ff0000' } },
    // Every one of these must be dropped rather than written into the page.
    breakout: { base: { color: 'red } body { display: none } .x {' } },
    unknownProp: { base: { evilProperty: 'anything' } },
    unknownState: { hovering: { color: 'red' } },
    notAString: { base: { color: 12345 } }
  }
}));

check('a good override survives the screen', /color: #ff0000/.test(sheet()), sheet());
check('a value that would close its own rule is dropped',
  !/display: none/.test(sheet()) && !sheet().includes('body {'), sheet());
check('an unknown property is dropped', !/evilProperty/.test(sheet()));
check('an unknown state is dropped', !/hovering/.test(sheet()));
check('a non-string value is dropped', !/12345/.test(sheet()));
check('the count of what was dropped is reported rather than swallowed',
  result.dropped >= 4, JSON.stringify(result));

ap.resetAll();

// ---------- what the source has to say ----------

console.log('');
console.log('stated honestly');

const src = readFileSync(join(ROOT, 'app', 'js', 'appearance.js'), 'utf8');
const picker = readFileSync(join(ROOT, 'app', 'js', 'colour-picker.js'), 'utf8');

check('a derived key warns the user it may match more than one element',
  /no appearance identifier/i.test(src));
check('the typeface list says which source it came from',
  /cannot enumerate|not granted/i.test(src) && /source: 'bundled'|source: 'system'/.test(src));
check('the editor is itself an editable element',
  /'data-ap': 'appearance-editor'/.test(src));
check('focus returns to the element that was being edited',
  /target\.focus\(\)/.test(src));
check('the picker is a continuous field, not only swatches',
  /cp__field/.test(picker) && /pointermove/.test(picker));
check('the picker field is operable from the keyboard',
  /ArrowLeft/.test(picker) && /ArrowUp/.test(picker));
check('an out-of-gamut value warns before it is applied, not after',
  /Outside what sRGB can show/.test(picker));
check('the CMYK conversion admits it has no colour profile',
  /no colour profile/i.test(picker));
check('every interaction state is offered, not only the resting one',
  ap.STATES.length >= 5 && ap.STATES.some((s) => s.suffix.includes(':focus-visible')));
check('keyboard focus is styled rather than plain focus',
  ap.STATES.every((s) => !/(^|[^-]):focus\b(?!-visible)/.test(s.suffix)));

console.log('');
if (failures) {
  console.error(failures + ' check(s) failed.');
  process.exit(1);
}
console.log('Appearance keys are stable, resets are surgical, and imported overrides are screened.');
process.exit(0);
