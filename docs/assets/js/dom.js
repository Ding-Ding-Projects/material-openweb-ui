// Element construction, the icon set, and the anchored-popover primitive every
// overlay on this site is built from.
//
// Two rules the popover exists to enforce, because both are silent failures:
//   1. It paints its own background, border, elevation and shape. An overlay
//      that renders transparent lets the page read straight through its text.
//   2. It is bounded by the viewport and scrolls inside that bound. Capping a
//      height and hiding the overflow deletes content with no scrollbar to say
//      anything is missing — a menu quietly loses its last items.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    // `ref` hands back the element once it exists. It is the only way to reach
    // a DOM PROPERTY that has no attribute behind it — `indeterminate` on a
    // checkbox being the one this project needs. Setting it as an attribute
    // does nothing at all, silently.
    else if (k === 'ref' && typeof v === 'function') v(el);
    // `props` assigns real DOM properties rather than attributes, for the same
    // reason: `checked`, `value` and `indeterminate` do not round-trip through
    // setAttribute the way they appear to.
    else if (k === 'props' && typeof v === 'object') Object.assign(el, v);
    else if (typeof v === 'function') {
      // A function anywhere else would be stringified into an attribute — the
      // whole body of it, as text, doing nothing. That is always a mistake, and
      // it is completely invisible until someone reads the markup.
      throw new Error('h(): "' + k + '" was given a function. Handlers are on* names; use ref or props for anything else.');
    }
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/**
 * Appends children, skipping the falsy ones.
 *
 * Use this instead of `parent.append(...)` anywhere a child is conditional.
 * The DOM's own `append` STRINGIFIES whatever it is handed, so `append(null)`
 * quietly adds a text node reading "null" — and because a text node is not an
 * element, it does not show up in `children`, `querySelector`, or anything else
 * you would inspect while wondering where the word came from. `h()` has always
 * filtered these; this brings the same rule to imperative appends.
 */
export function add(parent, ...children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    parent.append(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return parent;
}

// ---------- icons ----------
// Drawn as inline SVG on a 24px grid rather than pulled from an icon font, so
// they survive an offline load and recolour with the rest of the interface.

const PATHS = {
  chat: '<path d="M4 7.5A3.5 3.5 0 0 1 7.5 4h9A3.5 3.5 0 0 1 20 7.5v6a3.5 3.5 0 0 1-3.5 3.5H11l-4.2 3.1a.6.6 0 0 1-1-.5V17H7.5A3.5 3.5 0 0 1 4 13.5z"/><path d="M9 10.5h6"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  shield: '<path d="M12 3.5 5 6.5v5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9v-5z"/><path d="m9.3 12 1.9 1.9 3.6-3.7"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="2.2"/><rect x="3" y="13" width="18" height="7" rx="2.2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  swap: '<path d="M4 8.5h11l-3-3"/><path d="M20 15.5H9l3 3"/>',
  undo: '<path d="M4 10h10a5 5 0 0 1 0 10H9"/><path d="M4 10l4-4M4 10l4 4"/>',
  phonelock: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.6"/><path d="M10.5 17.5h3"/><path d="M9.5 7.5h5M9.5 11h5"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7"/>',
  pulse: '<path d="M3.5 12h4l2-5 3.5 10 2.5-5h5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.2 1.9"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.6-3.6"/>',
  download: '<path d="M12 4v11"/><path d="m7.5 11 4.5 4.5 4.5-4.5"/><path d="M5 19h14"/>',
  arrow: '<path d="M5 12h13"/><path d="m12.5 6.5 6 5.5-6 5.5"/>',
  github: '<path d="M9 19.5c-4 1.2-4-2.2-5.5-2.7M15 21v-3.2a2.8 2.8 0 0 0-.8-2.2c2.7-.3 5.4-1.3 5.4-5.9a4.6 4.6 0 0 0-1.2-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.3 1.2a11.4 11.4 0 0 0-6 0C6.7 2.9 5.7 3.3 5.7 3.3a4.3 4.3 0 0 0-.1 3.2 4.6 4.6 0 0 0-1.2 3.2c0 4.6 2.7 5.6 5.4 5.9-.4.4-.7 1-.8 1.7V21"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>',
  moon: '<path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2z"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  warn: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v5M12 16h.01"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="9.5" rx="2.4"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/><path d="M12 14.5v2"/>',
  unlock: '<rect x="4.5" y="10.5" width="15" height="9.5" rx="2.4"/><path d="M8 10.5V8a4 4 0 0 1 7.5-2"/><path d="M12 14.5v2"/>',
  desktop: '<rect x="2.5" y="4" width="19" height="13" rx="2.5"/><path d="M8 21h8M12 17v4"/>',
  language: '<path d="M4 6h9M8.5 4v2M11 6c0 4-3.5 7.5-7 8.5"/><path d="M6 10.5c1.6 2.4 3.9 4 6.5 4.5"/><path d="m13.5 20 4-9 4 9M15 17.2h5"/>',
  image: '<rect x="2.5" y="4.5" width="19" height="13" rx="2.5"/><path d="M8 21h8"/><path d="M12 17.5V21"/><path d="m6.5 14 3-3.2 2.4 2.3 3-3.4 2.6 4.3"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4.5 7h15M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7"/><path d="M6.5 7l.8 12.1A1.5 1.5 0 0 0 8.8 20.5h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7"/>',
  history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4.5V10h5.5"/><path d="M12 8v4.4l3 1.8"/>',
  bell: '<path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10z"/><path d="M10 19a2.2 2.2 0 0 0 4 0"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.4-.5-.7-.5-1.2 0-.9.7-1.6 1.7-1.6h1.2a4.8 4.8 0 0 0 4.8-4.8c0-3.6-3.7-6.5-8.5-6.5z"/><circle cx="7.8" cy="11.2" r="1.1"/><circle cx="10.4" cy="7.6" r="1.1"/><circle cx="14.6" cy="7.9" r="1.1"/>',
  file: '<path d="M13.5 3.5H7.5A2 2 0 0 0 5.5 5.5v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8.5z"/><path d="M13.5 3.5v5h5"/>',
  book: '<path d="M4.5 5.5A2 2 0 0 1 6.5 3.5H19v15H6.5a2 2 0 0 0-2 2z"/><path d="M4.5 18.5a2 2 0 0 1 2-2H19"/>'
};

export function icon(name, cls = 'icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', cls);
  svg.innerHTML = PATHS[name] || PATHS.info;
  return svg;
}

export function hasIcon(name) {
  return name in PATHS;
}

// ---------- anchored popover ----------

const openPopovers = new Set();

/**
 * Opens a decorated overlay anchored beside `anchor`, bounded by the viewport.
 * Returns a handle with `close()`. Focus returns to the anchor on close, which
 * is the difference between a menu and a trap.
 */
export function popover(anchor, content, opts = {}) {
  const { placement = 'bottom-start', width = 340, onClose, className = '' } = opts;

  const el = h('div', {
    class: 'popover ' + className,
    role: opts.role || 'dialog',
    'aria-modal': 'false',
    'aria-label': opts.label || 'Panel',
    style: { width: typeof width === 'number' ? width + 'px' : width }
  }, content);

  const veil = h('div', {
    style: { position: 'fixed', inset: '0', zIndex: '90' },
    onclick: () => handle.close()
  });

  document.body.appendChild(veil);
  document.body.appendChild(el);

  function place() {
    const a = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: 16, top: 16, right: 16, bottom: 16, width: 0, height: 0 };
    const margin = 10;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;

    // Height is bounded to the space actually available, and the panel scrolls
    // inside that bound rather than clipping.
    const below = vh - a.bottom - margin * 2;
    const above = a.top - margin * 2;
    const preferBelow = below >= Math.min(280, above) || below >= above;
    el.style.maxHeight = Math.max(160, (preferBelow ? below : above)) + 'px';

    const r = el.getBoundingClientRect();
    let left = placement.endsWith('end') ? a.right - r.width : a.left;
    left = Math.min(Math.max(margin, left), Math.max(margin, vw - r.width - margin));

    let top = preferBelow ? a.bottom + 8 : a.top - r.height - 8;
    top = Math.min(Math.max(margin, top), Math.max(margin, vh - r.height - margin));

    el.style.left = left + 'px';
    el.style.top = top + 'px';
  }

  place();
  requestAnimationFrame(place);

  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); handle.close(); }
  };
  const onScroll = () => place();

  el.addEventListener('keydown', onKey);
  window.addEventListener('resize', onScroll);
  window.addEventListener('scroll', onScroll, true);

  const handle = {
    el,
    reposition: place,
    close() {
      if (!openPopovers.has(handle)) return;
      openPopovers.delete(handle);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
      el.remove();
      veil.remove();
      if (anchor && anchor.focus) anchor.focus();
      if (onClose) onClose();
    }
  };
  openPopovers.add(handle);
  return handle;
}

export function closeAllPopovers() {
  for (const p of [...openPopovers]) p.close();
}

/** Keeps Tab inside `el` while it is open. */
export function trapFocus(el) {
  const sel = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,summary,[tabindex]:not([tabindex="-1"])';
  const onKey = (e) => {
    if (e.key !== 'Tab') return;
    const items = [...el.querySelectorAll(sel)].filter((n) => n.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  el.addEventListener('keydown', onKey);
  return () => el.removeEventListener('keydown', onKey);
}

export function fmtTime(ts) {
  return new Date(ts).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function bytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}
