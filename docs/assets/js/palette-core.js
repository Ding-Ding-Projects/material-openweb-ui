// The command palette, with no opinion about what it is searching.
//
// Both surfaces open the same palette on Ctrl+Shift+F and get the same
// behaviour — live controls in rows, keyboard traversal, an anchored regex
// builder on its own field, a persisted card/full-window size. The only thing
// that differs is what they hand it, so that is the only thing it takes.
//
// A caller supplies `entries()`, which returns rows of:
//   { kind, id, icon, label, hint, run, control? }
// where `control` is an element to render inline. A setting row passes the REAL
// control its own surface builds, which is what stops a palette row from being
// a lookalike that drifts away from the thing it claims to change.

import { h, icon, clear, trapFocus } from './dom.js';
import { makeMatcher, searchField } from './regex.js';

export function createPalette({ entries, getSize, setSize, placeholder = 'Search…', emptyText = 'No matches.' }) {
  let open = null;

  function isOpen() {
    return !!open;
  }

  function toggleSize() {
    setSize(getSize() === 'full' ? 'card' : 'full');
    if (open) { close(); show(); }
  }

  function show() {
    if (open) return;

    const size = getSize() === 'full' ? 'full' : 'card';
    const list = h('div', { class: 'palette__list', role: 'listbox', 'aria-label': 'Results' });
    const live = h('div', { class: 'sr-only', 'aria-live': 'polite' });

    const state = { query: '', pattern: '', flags: 'i', useRegex: false };
    let active = 0;
    let rows = [];

    const input = h('input', {
      class: 'palette__input', type: 'text', id: 'palette-input',
      placeholder, 'aria-label': placeholder,
      autocomplete: 'off', spellcheck: 'false',
      oninput: (e) => {
        if (state.useRegex) state.pattern = e.target.value; else state.query = e.target.value;
        active = 0;
        render();
      }
    });

    const rxBtn = h('button', {
      type: 'button', class: 'rx-btn', 'aria-pressed': 'false', 'aria-haspopup': 'dialog',
      title: 'Open the regex builder for this field', 'aria-label': 'Open the regex builder for this field',
      onclick: () => openBuilder()
    }, '.*');

    function openBuilder() {
      // The palette's field gets the same anchored builder every other field
      // has, bound to this field's state and nothing else.
      const f = searchField({
        query: state.query, pattern: state.pattern, flags: state.flags,
        sampleFrom: () => entries().slice(0, 8).map((e) => e.label)
      });
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
      rows = entries().filter((e) => m.test(e.label + ' ' + (e.hint || '')));
      clear(list);

      if (!rows.length) {
        list.appendChild(h('div', { class: 'menu__empty' }, m.ok ? emptyText : 'That pattern is not valid yet.'));
        live.textContent = '0 results';
        return;
      }

      rows.forEach((e, i) => {
        const row = h('button', {
          type: 'button', class: 'palette__row', role: 'option',
          dataset: { active: String(i === active) },
          'aria-selected': String(i === active),
          onclick: () => { if (!e.control) { close(); e.run && e.run(); } }
        },
          icon(e.icon || 'info', 'icon icon--sm'),
          h('span', { class: 'palette__label' }, e.label),
          h('span', { class: 'palette__hint' }, e.hint || '')
        );

        // A row carrying a real control keeps it operable in place, and offers
        // a separate way to travel to the surface it belongs to.
        if (e.control) {
          row.appendChild(h('span', { class: 'palette__control', onclick: (ev) => ev.stopPropagation() }, e.control));
          if (e.run) {
            row.appendChild(h('span', {
              class: 'btn btn--text', style: { height: '30px', fontSize: '.72rem' },
              onclick: (ev) => { ev.stopPropagation(); close(); e.run(); }
            }, 'Go'));
          }
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
          onclick: () => toggleSize(), 'aria-label': 'Switch palette size'
        }, size === 'full' ? 'Card' : 'Full'),
        h('span', { class: 'chip chip--tonal mono', style: { height: '24px', fontSize: '.66rem' } }, 'esc')
      ),
      live,
      list
    );

    const scrim = h('div', { class: 'scrim', style: { zIndex: '100' }, onclick: close });
    document.body.append(scrim, el);
    const untrap = trapFocus(el);

    function scrollActive() {
      const node = list.children[active];
      if (node && node.scrollIntoView) node.scrollIntoView({ block: 'nearest' });
    }

    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, rows.length - 1); render(); scrollActive(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); render(); scrollActive(); }
      if (e.key === 'Enter' && rows[active]) { e.preventDefault(); const r = rows[active]; close(); r.run && r.run(); }
    });

    open = { el, scrim, untrap };
    render();
    setTimeout(() => input.focus(), 0);
  }

  function close() {
    if (!open) return;
    open.untrap();
    open.el.remove();
    open.scrim.remove();
    open = null;
  }

  return {
    show,
    close,
    isOpen,
    toggle: () => (open ? close() : show()),
    toggleSize
  };
}

/** Binds Ctrl+Shift+F. Deliberately not Ctrl+K, which is a competing default. */
export function bindShortcut(palette) {
  const handler = (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
      e.preventDefault();
      palette.toggle();
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}
