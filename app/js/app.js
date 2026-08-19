// The application shell: title bar, destination rail, tab strip and routing.
//
// The title bar is the real one — the operating system's is hidden, this is the
// drag region, and its three buttons are IPC rather than pictures of buttons.

import { h, icon, clear } from '../../docs/assets/js/dom.js';
import * as ui from '../../docs/assets/js/ui.js';
import * as state from './state.js';
import * as desktop from './desktop.js';

import * as ollamaPage from './pages/ollama.js';
import * as chatPage from './pages/chat.js';
import * as converterPage from './pages/converter.js';
import * as authPage from './pages/authenticator.js';
import * as misc from './pages/misc.js';

const PAGES = {
  chat:          { ...chatPage.meta, render: chatPage.render },
  ollama:        { ...ollamaPage.meta, render: ollamaPage.render },
  converter:     { ...converterPage.meta, render: converterPage.render },
  authenticator: { ...authPage.meta, render: authPage.render },
  workspace:     { id: 'workspace', title: 'Workspace', zh: '工作區', icon: 'grid', render: misc.renderWorkspace },
  admin:         { id: 'admin', title: 'Admin', zh: '管理', icon: 'shield', render: misc.renderAdmin },
  settings:      { id: 'settings', title: 'Settings', zh: '設定', icon: 'gear', render: misc.renderSettings },
  status:        { id: 'status', title: 'Status', zh: '狀態', icon: 'pulse', render: misc.renderStatus },
  changelog:     { id: 'changelog', title: 'Changelog', zh: '更新紀錄', icon: 'clock', render: misc.renderChangelog }
};

const ORDER = ['chat', 'ollama', 'converter', 'authenticator', 'workspace', 'admin', 'settings', 'status', 'changelog'];

const titlebar = document.getElementById('titlebar');
const rail = document.getElementById('rail');
const surface = document.getElementById('surface');

let maximised = false;

// h() builds HTML elements, and document.createElement('svg') yields an
// HTMLUnknownElement that renders nothing at all. The window-control glyphs are
// tiny one-off shapes rather than icon-set entries, so they get their own
// namespaced builder.
function svg(paths, size = 11) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 12 12');
  el.setAttribute('width', String(size));
  el.setAttribute('height', String(size));
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('fill', 'none');
  el.setAttribute('stroke', 'currentColor');
  el.setAttribute('stroke-width', '1.2');
  el.innerHTML = paths;
  return el;
}

function bilingual() {
  return state.get('settings').language === 'Bilingual';
}

// ---------------------------------------------------------------- tabs

function tabs() { return state.get('tabs') || []; }
function activeTab() { return tabs().find((t) => t.id === state.get('activeTab')) || tabs()[0]; }

function open(pageId) {
  const existing = tabs().find((t) => t.page === pageId);
  if (existing) {
    state.set('activeTab', existing.id);
  } else {
    const t = { id: 'tb-' + pageId + '-' + Math.random().toString(36).slice(2, 6), page: pageId };
    state.set('tabs', [...tabs(), t]);
    state.set('activeTab', t.id);
  }
  render();
}

function close(id) {
  const list = tabs();
  if (list.length <= 1) {
    ui.notify('That is the last tab. Closing it would leave nothing to look at, so it stays open.', { kind: 'info' });
    return;
  }
  const t = list.find((x) => x.id === id);
  const next = list.filter((x) => x.id !== id);
  state.set('tabs', next);
  if (state.get('activeTab') === id) state.set('activeTab', next[0].id);
  state.log('Tab closed', PAGES[t.page]?.title ?? t.page);
  render();
}

// ---------------------------------------------------------------- chrome

function buildTitlebar() {
  clear(titlebar);

  const strip = h('div', { class: 'titlebar__tabs', role: 'tablist', 'aria-label': 'Open tabs' });
  const act = activeTab();

  for (const t of tabs()) {
    const page = PAGES[t.page];
    if (!page) continue;
    const btn = h('button', {
      class: 'wtab', role: 'tab',
      'aria-selected': String(act && t.id === act.id),
      onclick: () => { state.set('activeTab', t.id); render(); },
      oncontextmenu: (e) => {
        e.preventDefault();
        ui.menu(btn, [
          { label: 'Close this tab', icon: 'x', danger: true, run: () => close(t.id) },
          { label: 'Close other tabs', icon: 'x', run: () => {
            state.set('tabs', tabs().filter((x) => x.id === t.id));
            state.set('activeTab', t.id);
            render();
          } }
        ], { label: 'Tab menu', width: 260, filterPlaceholder: 'Filter this menu…' });
      }
    },
      icon(page.icon, 'icon icon--sm'),
      h('span', { class: 'wtab__label' }, page.title),
      h('span', {
        class: 'wtab__close', role: 'button', 'aria-label': 'Close ' + page.title,
        onclick: (e) => { e.stopPropagation(); close(t.id); }
      }, icon('x', 'icon icon--sm'))
    );
    strip.appendChild(btn);
  }

  const controls = h('div', { class: 'wctl' },
    h('button', { 'aria-label': 'Minimise', title: 'Minimise', onclick: () => desktop.windowControls.minimize() },
      svg('<path d="M2 6h8"/>')),
    h('button', { 'aria-label': maximised ? 'Restore' : 'Maximise', title: maximised ? 'Restore' : 'Maximise', onclick: async () => {
      const r = await desktop.windowControls.toggleMaximize();
      maximised = !!r?.isMaximized;
      buildTitlebar();
    } },
      svg(maximised ? '<rect x="2" y="4" width="6" height="6"/><path d="M4 4V2h6v6h-2"/>' : '<rect x="2.5" y="2.5" width="7" height="7"/>')),
    h('button', { 'data-close': '1', 'aria-label': 'Close', title: 'Close', onclick: () => desktop.windowControls.close() },
      svg('<path d="M3 3l6 6M9 3l-6 6"/>'))
  );

  titlebar.append(
    h('div', { class: 'titlebar__mark' }, icon('chat', 'icon icon--sm')),
    h('div', { class: 'titlebar__title' }, 'Material Open WebUI'),
    strip,
    desktop.isDesktop ? controls : h('div', { class: 'wctl' })
  );
}

function buildRail() {
  clear(rail);
  const act = activeTab();
  for (const id of ORDER) {
    const page = PAGES[id];
    rail.appendChild(h('button', {
      class: 'rail__item',
      'aria-current': act && act.page === id ? 'page' : null,
      onclick: () => open(id)
    },
      icon(page.icon),
      h('span', {}, page.title, bilingual() ? h('span', { class: 'rail__zh' }, page.zh) : null)
    ));
  }
  rail.appendChild(h('div', { class: 'rail__spacer' }));
  rail.appendChild(h('div', { class: 'muted', style: { fontSize: '.64rem', padding: '0 14px 6px', lineHeight: '1.5' } },
    desktop.isDesktop ? 'Everything stays on this machine' : 'Browser preview — no shell'));
}

// ---------------------------------------------------------------- render

function render() {
  misc.applyTheme();
  buildTitlebar();
  buildRail();
  clear(surface);
  const act = activeTab();
  const page = PAGES[act ? act.page : 'ollama'] || PAGES.ollama;
  try {
    page.render(surface);
  } catch (e) {
    console.error(e);
    surface.append(h('div', { class: 'page' },
      h('div', { class: 'state state--bad' }, icon('warn'),
        h('div', { class: 'state__body' },
          h('div', { class: 'state__title' }, 'This surface failed to render'),
          h('div', { class: 'state__text' }, String(e && e.message ? e.message : e))))));
  }
}

window.mowuiApp = { open, refresh: render };

// ---------------------------------------------------------------- start

misc.applyTheme();
render();
state.log('Application started', desktop.isDesktop ? 'desktop shell' : 'browser preview');

desktop.onEvent((event) => {
  if (event?.type === 'window:maximize') { maximised = true; buildTitlebar(); }
  if (event?.type === 'window:unmaximize') { maximised = false; buildTitlebar(); }
});

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
    e.preventDefault();
    ui.notify('The command palette is not implemented in the application yet — INVENTORY.md marks it planned here, and shipped on the documentation site.', { kind: 'info' });
  }
});

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => misc.applyTheme());
