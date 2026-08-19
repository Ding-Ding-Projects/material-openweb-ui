// Bootstrap: applies settings to the document, builds the chrome, owns the tab
// strip and routing, and exposes the small `window.mowui` surface that pages
// and the palette call back into.

import { h, icon, clear } from './dom.js';
import { searchField } from './regex.js';
import * as ui from './ui.js';
import * as store from './store.js';
import * as i18n from './i18n.js';
import * as palette from './palette.js';
import { PAGES, PAGE_ORDER, REPO, UPSTREAM } from './pages.js';

const SHIPPED_NAME = 'Material Open WebUI';

const root = document.documentElement;
let mainEl = null;
let stripEl = null;
let brandNameEl = null;
let pendingTarget = null;
let currentArticle = null;

// ---------------------------------------------------------------- settings → document

function applySettings() {
  const s = store.get('settings');

  // Theme: an explicit choice wins; "system" leaves the media query to decide.
  if (s.theme === 'light' || s.theme === 'dark') root.setAttribute('data-theme', s.theme);
  else root.removeAttribute('data-theme');

  root.style.setProperty('--scale', String(s.scale ?? 1));
  root.style.setProperty('--density', String(s.density ?? 0));
  root.style.setProperty('--radius-scale', String(s.radiusScale ?? 1));

  document.documentElement.lang = s.language === '粵語' ? 'zh-HK' : 'en';

  const name = (s.appName || '').trim() || SHIPPED_NAME;
  if (brandNameEl) brandNameEl.textContent = name;
  // Identity never moves with presentation: the document title shows the chosen
  // name, while storage keys, the repository and the package identity do not.
  document.title = name + ' — local-first Open WebUI for Windows';
}

// ---------------------------------------------------------------- tabs

function tabs() { return store.get('tabs') || []; }
function activeTab() { return tabs().find((t) => t.id === store.get('activeTab')) || tabs()[0]; }

function openPage(page, article = null, target = null) {
  const existing = tabs().find((t) => t.page === page);
  if (existing) {
    store.set('activeTab', existing.id, { record: false });
  } else {
    const t = { id: 't-' + page + '-' + Math.random().toString(36).slice(2, 6), page, pinned: false };
    store.set('tabs', [...tabs(), t], { action: 'created', label: 'Opened the ' + page + ' tab' });
    store.set('activeTab', t.id, { record: false });
  }
  currentArticle = article;
  pendingTarget = target;
  render();
}

function closeTab(id) {
  const list = tabs();
  const t = list.find((x) => x.id === id);
  if (!t || t.pinned) return;
  const next = list.filter((x) => x.id !== id);
  store.set('tabs', next.length ? next : [{ id: 't-home', page: 'home', pinned: true }], { action: 'deleted', label: 'Closed the ' + t.page + ' tab' });
  if (store.get('activeTab') === id) store.set('activeTab', (next[0] || { id: 't-home' }).id, { record: false });
  render();
}

function tabContextMenu(anchor, tab) {
  const isLast = tabs().length <= 1;
  ui.menu(anchor, [
    { label: tab.pinned ? 'Unpin this tab' : 'Pin this tab', icon: 'check', key: '', run: () => {
      store.set('tabs', tabs().map((t) => t.id === tab.id ? { ...t, pinned: !t.pinned } : t), { action: 'updated', label: (tab.pinned ? 'Unpinned' : 'Pinned') + ' the ' + tab.page + ' tab' });
      render();
    } },
    { label: 'Duplicate', icon: 'plus', run: () => ui.notify('This surface only opens one tab per page, so a duplicate would be the same tab. Nothing was opened.', { kind: 'info' }) },
    { separator: true },
    { label: 'Edit tab appearance…', icon: 'palette', key: 'Shift+RClick', run: () => ui.notify('Per-element appearance editing is a planned feature. It is listed as planned on the features page rather than shown here as if it worked.', { kind: 'info' }) },
    { label: 'Lock this tab…', icon: 'lock', run: () => ui.notify('Toy locks are a planned feature on this site. The features page marks them planned rather than pretending otherwise.', { kind: 'info' }) },
    { separator: true },
    { label: 'Close tabs containing text…', icon: 'search', run: () => bulkClose(false) },
    { label: 'Close tabs not containing text…', icon: 'search', run: () => bulkClose(true) },
    { separator: true },
    { label: 'Close this tab', icon: 'x', danger: true, run: () => closeTab(tab.id) }
  ], { label: 'Tab menu', width: 300 });
}

function bulkClose(invert) {
  const field = searchField({ placeholder: 'Text to match against tab labels…', label: 'Tab label match', sampleFrom: () => tabs().map((t) => PAGES[t.page].title()) });
  const preview = h('div', { class: 'stack', style: { gap: '6px', marginTop: '12px' } });

  function affected() {
    const m = field.matcher();
    if (m.empty) return [];
    return tabs().filter((t) => {
      const hit = m.test(PAGES[t.page].title());
      return (invert ? !hit : hit) && !t.pinned;
    });
  }

  function renderPreview() {
    clear(preview);
    const m = field.matcher();
    const list = affected();
    if (!m.ok) { preview.appendChild(h('div', { class: 'muted', style: { fontSize: '.82rem' } }, 'That pattern is not valid yet.')); return; }
    if (m.empty) { preview.appendChild(h('div', { class: 'muted', style: { fontSize: '.82rem' } }, 'Enter text or a pattern. A bulk close never runs on an empty query.')); return; }
    preview.append(
      h('div', { style: { fontSize: '.85rem', fontWeight: '600' } }, list.length + ' tab(s) would close'),
      h('div', { class: 'muted', style: { fontSize: '.8rem' } }, 'Pinned tabs are excluded by default: ' + tabs().filter((t) => t.pinned).map((t) => PAGES[t.page].title()).join(', ')),
      ...list.map((t) => h('div', { class: 'chip chip--tonal', style: { alignSelf: 'flex-start' } }, PAGES[t.page].title()))
    );
  }
  field.onChange(renderPreview);

  const d = ui.dialog({
    title: invert ? 'Close tabs NOT containing text' : 'Close tabs containing text',
    emoji: '🧹',
    body: h('div', { class: 'stack', style: { gap: '10px' } },
      h('p', { class: 'muted', style: { fontSize: '.86rem' } }, 'Matches against the visible tab label only. Both actions share one predicate, so flags and casing cannot drift between them.'),
      field.el, preview),
    actions: [
      { label: i18n.t('action.cancel') },
      { label: 'Close them', danger: true, run: () => {
        const list = affected();
        if (!list.length) { ui.notify('Nothing matched, so nothing closed.', { kind: 'info' }); return; }
        list.forEach((t) => closeTab(t.id));
        ui.notify('Closed ' + list.length + ' tab(s). Pinned tabs were excluded.', { kind: 'ok' });
      } }
    ]
  });
  renderPreview();
  return d;
}

function renderStrip() {
  clear(stripEl);
  const act = activeTab();
  const sorted = [...tabs()].sort((a, b) => Number(b.pinned) - Number(a.pinned));
  for (const t of sorted) {
    const page = PAGES[t.page];
    if (!page) continue;
    const btn = h('button', {
      class: 'tab', role: 'tab', id: 'tab-' + t.id,
      'aria-selected': String(act && t.id === act.id),
      'aria-controls': 'main',
      onclick: () => { store.set('activeTab', t.id, { record: false }); currentArticle = null; render(); },
      oncontextmenu: (e) => { e.preventDefault(); tabContextMenu(btn, t); }
    },
      icon(page.icon, 'icon icon--sm'),
      h('span', {}, page.title()),
      i18n.isBilingual() ? h('span', { class: 'tab__zh cjk' }, page.zh) : null,
      t.pinned ? icon('lock', 'icon tab__lock') : null
    );
    stripEl.appendChild(btn);
  }
}

// ---------------------------------------------------------------- teleport

function teleport(targetId) {
  if (!targetId) return;
  const el = document.getElementById(targetId) || document.querySelector('[data-setting-row="' + targetId + '"]');
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: store.get('settings').reducedMotion ? 'auto' : 'smooth' });
  const focusable = el.matches('button, a, input, select') ? el : el.querySelector('button, a, input, select, [tabindex]');
  if (focusable && focusable.focus) focusable.focus({ preventScroll: true });
  el.classList.add('teleport-flash');
  setTimeout(() => el.classList.remove('teleport-flash'), 1200);
}

// ---------------------------------------------------------------- render

function render() {
  applySettings();
  renderStrip();
  const act = activeTab();
  const page = PAGES[act ? act.page : 'home'] || PAGES.home;
  clear(mainEl);
  page.render(mainEl, currentArticle);
  mainEl.appendChild(footer());
  if (pendingTarget) {
    const target = pendingTarget;
    pendingTarget = null;
    requestAnimationFrame(() => teleport(target));
  }
}

function footer() {
  return h('footer', { class: 'footer' },
    h('div', { class: 'wrap stack', style: { gap: '18px' } },
      h('div', { class: 'row', style: { gap: '48px', alignItems: 'flex-start', flexWrap: 'wrap' } },
        h('div', { class: 'stack', style: { gap: '10px', maxWidth: '52ch' } },
          h('strong', {}, i18n.t('foot.built')),
          h('p', { class: 'muted', style: { fontSize: '.85rem', lineHeight: '1.7' } }, i18n.t('foot.builtBody')),
          h('a', { href: UPSTREAM, rel: 'noopener', style: { fontSize: '.85rem' } }, UPSTREAM.replace('https://', ''))
        ),
        h('div', { class: 'stack', style: { gap: '8px' } },
          h('div', { class: 'muted', style: { fontSize: '.7rem', fontWeight: '700', letterSpacing: '.07em', textTransform: 'uppercase' } }, 'Source'),
          h('a', { href: REPO, rel: 'noopener', style: { fontSize: '.85rem' } }, 'Repository'),
          h('a', { href: REPO + '/issues', rel: 'noopener', style: { fontSize: '.85rem' } }, 'Issues'),
          h('a', { href: REPO + '/blob/main/LICENSE', rel: 'noopener', style: { fontSize: '.85rem' } }, 'Licence')
        ),
        h('div', { class: 'stack', style: { gap: '8px' } },
          h('div', { class: 'muted', style: { fontSize: '.7rem', fontWeight: '700', letterSpacing: '.07em', textTransform: 'uppercase' } }, 'This site'),
          h('button', { class: 'btn btn--text footlink', onclick: () => openPage('settings') }, 'Appearance and language'),
          h('button', { class: 'btn btn--text footlink', onclick: () => openPage('status') }, 'Event log'),
          h('button', { class: 'btn btn--text footlink', onclick: () => window.mowui.exportAll() }, 'Export everything')
        )
      ),
      h('hr'),
      h('div', { class: 'row', style: { gap: '16px', flexWrap: 'wrap' } },
        h('span', { class: 'muted', style: { fontSize: '.76rem', flex: '1', minWidth: '260px' } }, i18n.t('foot.legal')),
        h('span', { class: 'chip' }, i18n.t('foot.free'))
      )
    )
  );
}

// ---------------------------------------------------------------- dim sum
//
// The contract wants a dish, named in both languages, with its picture, and no
// way to opt out. Two of its rules collide on a static site: photographs must
// come from the public dim-sum catalogue and must never be copied into a
// consumer repository, while this site must not load a remote image.
//
// So the surprise ships the part it can honour locally — the dish, named in
// both languages — and links to the public photo rather than embedding it,
// saying exactly why. That is the closest accessible equivalent, and stating
// the reason is the contract's own instruction for a surface that cannot take
// a rule literally.

const DIM_SUM = [
  { id: 'hk-dish-0001', en: 'Har Gow', zh: '蝦餃' },
  { id: 'hk-dish-0002', en: 'Scallop Har Gow', zh: '帶子蝦餃' },
  { id: 'hk-dish-0003', en: 'Bamboo Shoot Har Gow', zh: '筍尖蝦餃' },
  { id: 'hk-dish-0004', en: 'Siu Mai', zh: '燒賣' },
  { id: 'hk-dish-0005', en: 'Char Siu Bao', zh: '叉燒包' },
  { id: 'hk-dish-0006', en: 'Cheung Fun', zh: '腸粉' }
];
const CATALOG = 'https://github.com/Ding-Ding-Projects/dim-sum-photos';

function maybeDimSum() {
  if (store.get('settings').school && store.get('settings').school.on) return; // omitted, not disabled
  if (Math.random() >= 0.10) return;
  const d = DIM_SUM[Math.floor(Math.random() * DIM_SUM.length)];
  ui.notify(
    h('span', {},
      h('span', {}, d.en + ' · '),
      h('span', { class: 'cjk' }, d.zh),
      h('br'),
      h('span', { style: { fontSize: '.78rem', opacity: '.85' } },
        'The photograph lives in the public catalogue rather than in this repository, and this page loads no remote images. ',
        h('a', { href: CATALOG, rel: 'noopener', style: { color: 'inherit', textDecoration: 'underline' } }, 'See the catalogue')
      )
    ),
    { title: 'A dish, for no reason at all', kind: 'info', duration: 9000 }
  );
}

// ---------------------------------------------------------------- chrome

function buildChrome() {
  brandNameEl = h('div', { class: 'brand__name' }, SHIPPED_NAME);

  const siteSearch = searchField({
    placeholder: i18n.t('search.site'),
    label: i18n.t('search.site'),
    className: 'topbar-search',
    onKeyDown: (e) => { if (e.key === 'Enter') { palette.show(); } }
  });
  siteSearch.el.style.maxWidth = '300px';
  siteSearch.el.style.flex = '1 1 220px';
  siteSearch.el.addEventListener('click', (e) => {
    if (e.target.closest('.rx-btn')) return;
    palette.show();
  });

  const themeBtn = h('button', {
    class: 'btn btn--icon btn--outlined', 'aria-label': i18n.t('theme.toggle'), title: i18n.t('theme.toggle'),
    onclick: () => window.mowui.toggleTheme()
  }, icon('sun'));

  const moreBtn = h('button', { class: 'btn btn--icon btn--outlined', 'aria-label': 'More', title: 'More' }, icon('menu'));
  moreBtn.addEventListener('click', () => {
    ui.menu(moreBtn, [
      { label: 'Command palette', icon: 'search', key: 'Ctrl+Shift+F', run: () => palette.show() },
      { label: 'Export everything', icon: 'download', run: () => window.mowui.exportAll() },
      { label: 'Event log', icon: 'pulse', run: () => openPage('status') },
      { separator: true },
      { label: 'Repository', icon: 'github', run: () => window.open(REPO, '_blank', 'noopener') },
      { label: 'Upstream project', icon: 'github', run: () => window.open(UPSTREAM, '_blank', 'noopener') },
      { separator: true },
      { label: 'Settings', icon: 'gear', run: () => openPage('settings') }
    ], { label: 'More', width: 300, filterPlaceholder: 'Filter this menu…' });
  });

  stripEl = h('div', { class: 'tabstrip', role: 'tablist', 'aria-label': 'Site sections', 'aria-orientation': 'horizontal' });

  const bar = h('header', { class: 'topbar' },
    h('button', {
      class: 'brand', style: { border: 0, background: 'transparent', cursor: 'pointer', padding: 0, color: 'inherit' },
      onclick: () => openPage('home'), 'aria-label': 'Home'
    },
      h('span', { class: 'brand__mark' }, icon('chat')),
      h('span', { class: 'stack', style: { alignItems: 'flex-start' } },
        brandNameEl,
        h('span', { class: 'brand__ver mono' }, 'v0.0.0 · unreleased')
      )
    ),
    stripEl,
    h('div', { style: { flex: '1' } }),
    siteSearch.el,
    themeBtn,
    moreBtn
  );

  return bar;
}

// ---------------------------------------------------------------- public surface

window.mowui = {
  open: openPage,
  refresh: () => render(),
  teleport,
  toggleTheme() {
    const cur = store.get('settings').theme;
    const isDark = cur === 'dark' || (cur === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    const next = isDark ? 'light' : 'dark';
    store.patchSettings({ theme: next }, { path: 'theme', label: 'Theme → ' + next });
    render();
  },
  exportAll() {
    const b = store.exportBundle();
    ui.downloadFile('material-open-webui-site-state.json', JSON.stringify(b, null, 2), 'application/json');
    ui.notify('Exported. Lock credentials, authenticator secrets and vocabulary contents were omitted, and the file lists what it left out.', { kind: 'ok', persist: true });
  }
};

// ---------------------------------------------------------------- start

function start() {
  document.body.prepend(buildChrome());
  mainEl = document.getElementById('main');
  render();

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
      e.preventDefault();
      palette.toggle();
    }
  });

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (store.get('settings').theme === 'system') applySettings();
  });

  store.subscribe((key) => { if (key === 'settings') applySettings(); });

  setTimeout(maybeDimSum, 1400);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
