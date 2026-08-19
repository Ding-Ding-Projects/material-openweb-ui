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
import * as locksPage from './pages/locks.js';
import * as locksUi from './locks-ui.js';
import * as locksCore from './core/locks.js';
import { palette, wire as wirePalette } from './palette.js';
import * as i18n from './i18n.js';
import * as narrator from './core/narrator.js';
import * as appearance from './appearance.js';

const PAGES = {
  chat:          { ...chatPage.meta, render: chatPage.render },
  ollama:        { ...ollamaPage.meta, render: ollamaPage.render },
  converter:     { ...converterPage.meta, render: converterPage.render },
  authenticator: { ...authPage.meta, render: authPage.render },
  locks:         { ...locksPage.meta, render: locksPage.render },
  workspace:     { id: 'workspace', title: 'Workspace', zh: '工作區', icon: 'grid', render: misc.renderWorkspace },
  admin:         { id: 'admin', title: 'Admin', zh: '管理', icon: 'shield', render: misc.renderAdmin },
  settings:      { id: 'settings', title: 'Settings', zh: '設定', icon: 'gear', render: misc.renderSettings },
  status:        { id: 'status', title: 'Status', zh: '狀態', icon: 'pulse', render: misc.renderStatus },
  changelog:     { id: 'changelog', title: 'Changelog', zh: '更新紀錄', icon: 'clock', render: misc.renderChangelog }
};

const ORDER = ['chat', 'ollama', 'converter', 'authenticator', 'locks', 'workspace', 'admin', 'settings', 'status', 'changelog'];

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
  return i18n.isBilingual();
}

/** A destination's label in the active language mode. */
function pageLabel(id) {
  const key = 'nav.' + id;
  const t = i18n.t(key);
  return t === key ? (PAGES[id]?.title ?? id) : t;
}

function pageLabel2(id) {
  return i18n.t2('nav.' + id);
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
        const lockId = 'tab:' + t.page;
        const existing = locksCore.get(lockId);
        ui.menu(btn, [
          existing
            ? { label: locksCore.isLocked(lockId) ? 'Unlock this tab…' : 'Lock it again', icon: 'lock',
                run: () => locksCore.isLocked(lockId) ? locksUi.unlockPrompt(lockId, render) : (locksCore.relock(lockId), render()) }
            : { label: 'Lock this tab…', icon: 'lock',
                run: () => locksUi.wizard(lockId, pageLabel(t.page)) },
          { label: 'Manage every lock', icon: 'unlock', run: () => open('locks') },
          { separator: true },
          appearance.menuItem(btn),
          { separator: true },
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
      h('span', { class: 'wtab__label' }, pageLabel(t.page)),
      locksCore.isLocked('tab:' + t.page) ? icon('lock', 'icon tab__lock') : null,
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
      h('span', {}, pageLabel(id), bilingual() && pageLabel2(id) ? h('span', { class: 'rail__zh cjk' }, pageLabel2(id)) : null)
    ));
  }
  rail.appendChild(h('div', { class: 'rail__spacer' }));
  rail.appendChild(h('div', { class: 'muted', style: { fontSize: '.64rem', padding: '0 14px 6px', lineHeight: '1.5' } },
    desktop.isDesktop ? i18n.t('rail.local') : i18n.t('rail.browser')));
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

// ---------------------------------------------------------------- exports

/**
 * Everything this application holds, in one file.
 *
 * Authenticator secrets are not in it, and the file says so rather than
 * quietly omitting them — an export that drops a field without mentioning it is
 * the reason nobody trusts exports.
 */
function exportAll() {
  const bundle = {
    schema: 'material-open-webui.app-state',
    version: 1,
    exportedAt: new Date().toISOString(),
    encoding: 'UTF-8',
    lineEndings: 'LF',
    omitted: [
      'Authenticator secrets — they are held in memory for the session only and are never written anywhere, including here.',
      'Any credential for a lock, once locks exist.'
    ],
    settings: state.get('settings'),
    tabs: state.get('tabs'),
    chats: state.get('chats'),
    convResults: (state.get('convResults') || []).map((r) => ({ ...r, url: undefined })),
    statusLog: state.get('statusLog')
  };
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: 'material-open-webui-state.json' });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  state.log('Exported', 'application state');
  ui.notify('Exported. Authenticator secrets were left out, and the file lists what it omitted.', { kind: 'ok', persist: true });
}

function toggleTheme() {
  const cur = state.get('settings').theme;
  const isDark = cur === 'dark' || (cur === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const next = isDark ? 'light' : 'dark';
  state.patchSettings({ theme: next });
  state.log('Setting changed', 'Theme → ' + next);
  render();
}

// ---------------------------------------------------------------- dim sum
//
// A one-in-ten chance per launch, non-blocking, auto-dismissing, and with no
// setting to switch it off. The photographs live in the public catalogue and are
// never copied into this repository, so the surprise ships the part it can
// honour offline — the dish, named in both languages — and links to the rest.

const DIM_SUM = [
  { en: 'Har Gow', zh: '蝦餃' },
  { en: 'Scallop Har Gow', zh: '帶子蝦餃' },
  { en: 'Bamboo Shoot Har Gow', zh: '筍尖蝦餃' },
  { en: 'Siu Mai', zh: '燒賣' },
  { en: 'Char Siu Bao', zh: '叉燒包' },
  { en: 'Cheung Fun', zh: '腸粉' }
];

function maybeDimSum() {
  // School mode covers every dim-sum capability, and covering it means the
  // surprise does not happen at all - not that it happens with a note
  // explaining what was hidden, which would name the thing being hidden.
  const school = state.get('settings').school;
  if (school && school.on) return;
  if (Math.random() >= 0.10) return;
  const d = DIM_SUM[Math.floor(Math.random() * DIM_SUM.length)];
  ui.notify(
    h('span', {},
      h('span', {}, d.en + ' · '),
      h('span', { class: 'cjk' }, d.zh),
      h('br'),
      h('span', { style: { fontSize: '.78rem', opacity: '.85' } },
        'The photograph lives in the public dim-sum catalogue rather than in this repository, and this application loads no remote images.')),
    { title: 'A dish, for no reason at all', kind: 'info', duration: 9000 }
  );
  state.log('Dim sum', d.en + ' · ' + d.zh);
}

window.mowuiApp = { open, refresh: render, exportAll, toggleTheme, palette, appearance };

// ---------------------------------------------------------------- start

misc.applyTheme();

// Appearance overrides are applied before the first paint, so a customised
// element never flashes its default on the way in.
appearance.apply();
appearance.installShortcut();

render();

// The narrator reads what the event log records, so it describes what actually
// happened rather than a separate script that can drift away from it.
state.subscribe((key, value) => {
  if (key !== 'statusLog' || !Array.isArray(value) || !value.length) return;
  const latest = value[0];
  narrator.say(latest.event + (latest.detail ? '. ' + latest.detail : ''), i18n.isCantonese() ? 'zh' : 'en');
});

state.log('Application started', desktop.isDesktop ? 'desktop shell' : 'browser preview');

desktop.onEvent((event) => {
  if (event?.type === 'window:maximize') { maximised = true; buildTitlebar(); }
  if (event?.type === 'window:unmaximize') { maximised = false; buildTitlebar(); }
});

wirePalette({ pages: PAGES, order: ORDER, open });

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
    e.preventDefault();
    palette.toggle();
  }
});

setTimeout(maybeDimSum, 1500);

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => misc.applyTheme());
