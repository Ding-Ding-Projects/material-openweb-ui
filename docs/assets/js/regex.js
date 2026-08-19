// The regex builder, and the search field that carries one.
//
// Every search field on this site is built by `searchField()`, so no field can
// ship without its builder — the affordance is part of the component rather
// than something each caller remembers to add. That includes dropdown filters
// and right-click menu filters, which is where it is otherwise always missed.
//
// Each field owns its own query, pattern, flags, validity and mode. There is no
// shared builder state, so a pattern typed in one field can never leak into
// whichever field was touched last.

import { h, icon, popover } from './dom.js';
import * as i18n from './i18n.js';

const MAX_PATTERN = 400;
const MAX_SAMPLE = 4000;

const TOKENS = [
  { ins: '.',      label: '.',      desc: 'any character' },
  { ins: '\\d',    label: '\\d',    desc: 'a digit' },
  { ins: '\\w',    label: '\\w',    desc: 'a word character' },
  { ins: '\\s',    label: '\\s',    desc: 'whitespace' },
  { ins: '[a-z]',  label: '[a-z]',  desc: 'character class' },
  { ins: '[^a-z]', label: '[^…]',   desc: 'negated class' },
  { ins: '^',      label: '^',      desc: 'start of input' },
  { ins: '$',      label: '$',      desc: 'end of input' },
  { ins: '(…)',    label: '(…)',    desc: 'capture group' },
  { ins: '(?:…)',  label: '(?:…)',  desc: 'group, no capture' },
  { ins: '|',      label: '|',      desc: 'either side' },
  { ins: '*',      label: '*',      desc: 'zero or more' },
  { ins: '+',      label: '+',      desc: 'one or more' },
  { ins: '?',      label: '?',      desc: 'optional' },
  { ins: '{2,4}',  label: '{n,m}',  desc: 'between n and m' },
  { ins: '\\b',    label: '\\b',    desc: 'word boundary' }
];

export function compile(pattern, flags) {
  if (typeof pattern !== 'string' || !pattern) return { ok: false, error: 'Empty pattern' };
  if (pattern.length > MAX_PATTERN) return { ok: false, error: 'Pattern is longer than ' + MAX_PATTERN + ' characters' };
  try {
    return { ok: true, re: new RegExp(pattern, flags) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** The one predicate every search on this site matches with, so plain-text and
 *  pattern mode can never disagree about what "matches" means. */
export function makeMatcher({ query, pattern, flags, useRegex }) {
  if (useRegex) {
    const c = compile(pattern, flags);
    if (!c.ok) return { ok: false, error: c.error, test: () => false };
    return { ok: true, test: (s) => { c.re.lastIndex = 0; return c.re.test(String(s ?? '')); } };
  }
  const q = String(query ?? '').toLowerCase();
  if (!q) return { ok: true, empty: true, test: () => true };
  return { ok: true, test: (s) => String(s ?? '').toLowerCase().includes(q) };
}

/**
 * A search field with its own anchored regex builder.
 * Returns { el, state, matcher(), onChange(fn), focus() }.
 */
export function searchField(opts = {}) {
  const state = {
    query: opts.query || '',
    pattern: opts.pattern || '',
    flags: opts.flags || 'i',
    useRegex: false,
    sample: opts.sample || ''
  };
  const subs = new Set();
  const notify = () => { for (const fn of subs) fn(state); };

  const input = h('input', {
    type: 'search',
    value: state.query,
    placeholder: opts.placeholder || i18n.t('search.site'),
    'aria-label': opts.label || opts.placeholder || i18n.t('search.site'),
    autocomplete: 'off',
    spellcheck: 'false',
    oninput: (e) => {
      if (state.useRegex) state.pattern = e.target.value;
      else state.query = e.target.value;
      notify();
    },
    onkeydown: (e) => {
      if (e.key === 'Escape' && (state.query || state.pattern)) {
        e.stopPropagation();
        state.query = ''; state.pattern = ''; input.value = '';
        notify();
      }
      if (opts.onKeyDown) opts.onKeyDown(e);
    }
  });

  const rxBtn = h('button', {
    type: 'button',
    class: 'rx-btn',
    'aria-pressed': 'false',
    'aria-haspopup': 'dialog',
    title: i18n.t('search.regex'),
    'aria-label': i18n.t('search.regex'),
    onclick: () => openBuilder()
  }, '.*');

  const el = h('div', { class: 'field' + (opts.className ? ' ' + opts.className : '') },
    icon('search', 'icon icon--sm'),
    input,
    rxBtn
  );

  function syncInput() {
    input.value = state.useRegex ? state.pattern : state.query;
    input.placeholder = state.useRegex ? 'pattern, e.g. ^ollama.*chat$' : (opts.placeholder || i18n.t('search.site'));
    rxBtn.setAttribute('aria-pressed', String(state.useRegex));
    input.classList.toggle('mono', state.useRegex);
  }

  function openBuilder() {
    let handle = null;

    const pat = h('input', {
      type: 'text', class: 'mono', value: state.pattern || state.query,
      placeholder: '^ollama.*chat$',
      'aria-label': i18n.t('rx.pattern'),
      style: { flex: '1', border: '0', background: 'transparent', outline: 'none', fontSize: '.85rem' },
      oninput: () => live()
    });

    const sample = h('textarea', {
      class: 'mono', rows: '3',
      placeholder: 'paste text to test against',
      'aria-label': i18n.t('rx.sample'),
      style: {
        width: '100%', resize: 'vertical', borderRadius: '12px', padding: '10px 12px',
        border: '1px solid var(--outv)', background: 'var(--sclowest)', color: 'var(--ons)',
        fontSize: '.8rem', outline: 'none'
      },
      oninput: () => live()
    });
    sample.value = state.sample || (opts.sampleFrom ? opts.sampleFrom().slice(0, 6).join('\n') : '');

    const flagI = h('input', { type: 'checkbox', checked: state.flags.includes('i'), style: { accentColor: 'var(--p)' }, onchange: () => live() });
    const flagM = h('input', { type: 'checkbox', checked: state.flags.includes('m'), style: { accentColor: 'var(--p)' }, onchange: () => live() });

    const status = h('div', { class: 'mono', style: { fontSize: '.74rem', minHeight: '18px', lineHeight: '1.5' } });
    const groups = h('div', { style: { fontSize: '.74rem', color: 'var(--onsv)', lineHeight: '1.6' } });

    function currentFlags() {
      return (flagI.checked ? 'i' : '') + (flagM.checked ? 'm' : '') + 'g';
    }

    function live() {
      const p = pat.value.slice(0, MAX_PATTERN);
      const c = compile(p, currentFlags());
      if (!p) {
        status.textContent = 'Enter a pattern.';
        status.style.color = 'var(--onsv)';
        groups.textContent = '';
        return;
      }
      if (!c.ok) {
        status.textContent = '✕ ' + c.error;
        status.style.color = 'var(--err)';
        groups.textContent = '';
        return;
      }
      const text = sample.value.slice(0, MAX_SAMPLE);
      let count = 0; let firstGroups = null; let guard = 0;
      c.re.lastIndex = 0;
      let m;
      while ((m = c.re.exec(text)) !== null) {
        count++;
        if (!firstGroups && m.length > 1) firstGroups = m.slice(1);
        if (m.index === c.re.lastIndex) c.re.lastIndex++; // zero-width match
        if (++guard > 10000) break;
      }
      status.textContent = '✓ valid · ' + count + (count === 1 ? ' match' : ' matches') + ' in the sample';
      status.style.color = 'var(--ok)';
      groups.textContent = firstGroups
        ? 'First match groups: ' + firstGroups.map((g, i) => '$' + (i + 1) + '=' + JSON.stringify(g ?? null)).join('  ')
        : '';
    }

    function insert(tok) {
      const s = pat.selectionStart ?? pat.value.length;
      const e = pat.selectionEnd ?? s;
      const inner = tok.includes('…') && e > s ? tok.replace('…', pat.value.slice(s, e)) : tok.replace('…', '');
      pat.value = pat.value.slice(0, s) + inner + pat.value.slice(e);
      pat.focus();
      pat.setSelectionRange(s + inner.length, s + inner.length);
      live();
    }

    const body = h('div', { class: 'stack', style: { gap: '12px' } },
      h('div', { class: 'row', style: { gap: '8px' } },
        icon('search', 'icon icon--sm'),
        h('div', { style: { fontWeight: '700', flex: '1', fontSize: '.9rem' } }, i18n.t('rx.title'))
      ),
      h('div', { class: 'field', style: { height: '42px' } }, pat),
      h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
        ...TOKENS.map((t) => h('button', {
          type: 'button', class: 'chip chip--tonal', title: t.desc, 'aria-label': t.label + ' — ' + t.desc,
          style: { height: '28px', padding: '0 10px', cursor: 'pointer', border: '1px solid var(--outv)', fontFamily: 'var(--font-mono)', fontSize: '.72rem' },
          onclick: () => insert(t.ins)
        }, t.label))
      ),
      h('div', { style: { display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '.78rem' } },
        h('label', { style: { display: 'flex', gap: '7px', alignItems: 'center', cursor: 'pointer' } }, flagI, i18n.t('rx.flagI')),
        h('label', { style: { display: 'flex', gap: '7px', alignItems: 'center', cursor: 'pointer' } }, flagM, i18n.t('rx.flagM'))
      ),
      sample,
      status,
      groups,
      h('div', { style: { fontSize: '.7rem', color: 'var(--onsv)', lineHeight: '1.55' } }, i18n.t('rx.engine')),
      h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' } },
        h('button', {
          type: 'button', class: 'btn btn--text',
          onclick: () => { navigator.clipboard?.writeText(pat.value); }
        }, i18n.t('action.copy')),
        state.useRegex ? h('button', {
          type: 'button', class: 'btn btn--outlined',
          onclick: () => { state.useRegex = false; state.pattern = ''; syncInput(); notify(); handle.close(); }
        }, i18n.t('rx.plain')) : null,
        h('button', {
          type: 'button', class: 'btn btn--filled',
          onclick: () => {
            const c = compile(pat.value, currentFlags());
            if (!c.ok) { status.textContent = '✕ ' + c.error; status.style.color = 'var(--err)'; return; }
            state.pattern = pat.value;
            state.flags = currentFlags().replace('g', '');
            state.sample = sample.value;
            state.useRegex = true;
            syncInput();
            notify();
            handle.close();
          }
        }, i18n.t('rx.use'))
      )
    );

    // Anchored to whichever button the caller actually put on the page.
    //
    // The command palette builds a searchField purely for its builder and never
    // mounts it, then anchored the popover to that detached button. A detached
    // element's bounding rect is all zeros, so the panel clamped to the top-left
    // corner of the viewport instead of appearing beside the field — the exact
    // "detached dialog somewhere else" the contract rules out.
    const anchor = (opts.anchor && opts.anchor.isConnected) ? opts.anchor : rxBtn;
    handle = popover(anchor, body, { width: 380, label: i18n.t('rx.title') });
    live();
    setTimeout(() => pat.focus(), 0);
  }

  syncInput();

  return {
    el,
    state,
    matcher: () => makeMatcher(state),
    /** Opens the builder directly, for a caller that has its own trigger. */
    openBuilder,
    onChange(fn) { subs.add(fn); return () => subs.delete(fn); },
    focus() { input.focus(); },
    setSampleSource(fn) { opts.sampleFrom = fn; }
  };
}
