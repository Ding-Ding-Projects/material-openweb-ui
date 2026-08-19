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
import * as tabsCore from './tabs.js';
import * as tabsUi from './tabs-ui.js';
import * as dimsum from './dimsum.js';

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

function tabs() {
	return tabModel().tabs;
}
function activeTab() {
	const m = tabModel();
	return m.tabs.find((t) => t.id === m.activeTab) || m.tabs[0];
}

function openPage(page, article = null, target = null) {
	const m = tabModel();
	const existing = m.tabs.find((t) => t.page === page);
	if (existing) {
		store.set('tabModel', { ...m, activeTab: existing.id }, { record: false });
	} else {
		const result = tabsCore.open(m, page);
		if (result.error) {
			ui.notify(result.error, { kind: 'bad' });
			return;
		}
		store.set('tabModel', result.model, {
			action: 'created',
			label: 'Opened the ' + page + ' tab'
		});
	}
	currentArticle = article;
	pendingTarget = target;
	render();
}

function closeTab(id) {
	const m = tabModel();
	const t = m.tabs.find((x) => x.id === id);
	const result = tabsCore.close(m, id);
	if (result.refused) {
		ui.notify(result.refused, { kind: 'info' });
		return;
	}
	store.set('tabModel', result.model, {
		action: 'deleted',
		label: 'Closed the ' + (t ? t.page : id) + ' tab'
	});
	render();
}

// The context menu, the bulk closes and the four discovery searches all live in
// the shared strip now. What used to be here was a second implementation of the
// same rules, and it had already drifted: it offered "Edit tab appearance" and
// "Lock this tab" as entries that only explained why they did nothing.

/**
 * The tab model, read through the shared normaliser.
 *
 * The site kept its own array of `{ id, page, pinned }` and its own sort. That
 * worked and stopped at pinning: no docking, no groups, no discovery searches,
 * and a second implementation of the rules to keep in step with the first.
 * There is one model now, and it is the application's.
 */
function tabModel() {
	const stored = store.get('tabModel');
	if (stored) return tabsCore.normalise(stored, PAGE_ORDER, 'home');
	// A model written by the previous shape is read rather than discarded.
	const legacy = store.get('tabs');
	return tabsCore.normalise(
		// No dock is stated, so the shared default applies — the same edge the
		// application opens on. Forcing 'top' here would have made the contract's
		// stated default true on one surface and false on the other.
		{ tabs: legacy || [], activeTab: store.get('activeTab'), groups: [] },
		PAGE_ORDER,
		'home'
	);
}

function applyTabModel(next) {
	store.set('tabModel', next, { record: false });
	currentArticle = null;
	render();
}

/**
 * Places the strip on whichever edge it is docked to.
 *
 * The topbar is a horizontal row and always was, so the strip sat in it and the
 * dock setting had nowhere to go. It is moved out of the topbar for the three
 * other edges and the body is flipped to a column, which is the same thing the
 * desktop shell does — and it is done here rather than left as a difference
 * between the two surfaces.
 */
function placeStrip(dock) {
	const bar = document.querySelector('.topbar');
	const main = document.getElementById('main');
	if (!bar || !main) return;

	document.body.dataset.dock = dock;
	stripEl.remove();

	if (dock === 'top') {
		// Back where it started: inside the topbar, after the brand.
		const anchor = bar.querySelector('.brand');
		if (anchor && anchor.nextSibling) bar.insertBefore(stripEl, anchor.nextSibling);
		else bar.appendChild(stripEl);
		return;
	}

	let body = document.querySelector('.sitebody');
	if (!body) {
		body = h('div', { class: 'sitebody' });
		main.parentNode.insertBefore(body, main);
		body.appendChild(main);
	}
	if (dock === 'left') body.insertBefore(stripEl, body.firstChild);
	else if (dock === 'right') body.appendChild(stripEl);
	else document.body.appendChild(stripEl);
	stripEl.classList.add('tabstrip--docked');
}

function renderStrip() {
	const model = tabModel();
	placeStrip(model.dock);
	tabsUi.renderStrip(stripEl, {
		model,
		apply: applyTabModel,
		labelFor: (page) => (PAGES[page] ? PAGES[page].title() : page),
		iconFor: (page) => (PAGES[page] ? PAGES[page].icon : 'file'),
		extras: {
			decorate: () => [],
			items: () => []
		}
	});
}

// ---------------------------------------------------------------- teleport

function teleport(targetId) {
	if (!targetId) return;
	const el =
		document.getElementById(targetId) ||
		document.querySelector('[data-setting-row="' + targetId + '"]');
	if (!el) return;
	el.scrollIntoView({
		block: 'center',
		behavior: store.get('settings').reducedMotion ? 'auto' : 'smooth'
	});
	const focusable = el.matches('button, a, input, select')
		? el
		: el.querySelector('button, a, input, select, [tabindex]');
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
	return h(
		'footer',
		{ class: 'footer' },
		h(
			'div',
			{ class: 'wrap stack', style: { gap: '18px' } },
			h(
				'div',
				{ class: 'row', style: { gap: '48px', alignItems: 'flex-start', flexWrap: 'wrap' } },
				h(
					'div',
					{ class: 'stack', style: { gap: '10px', maxWidth: '52ch' } },
					h('strong', {}, i18n.t('foot.built')),
					h(
						'p',
						{ class: 'muted', style: { fontSize: '.85rem', lineHeight: '1.7' } },
						i18n.t('foot.builtBody')
					),
					h(
						'a',
						{ href: UPSTREAM, rel: 'noopener', style: { fontSize: '.85rem' } },
						UPSTREAM.replace('https://', '')
					)
				),
				h(
					'div',
					{ class: 'stack', style: { gap: '8px' } },
					h(
						'div',
						{
							class: 'muted',
							style: {
								fontSize: '.7rem',
								fontWeight: '700',
								letterSpacing: '.07em',
								textTransform: 'uppercase'
							}
						},
						'Source'
					),
					h('a', { href: REPO, rel: 'noopener', style: { fontSize: '.85rem' } }, 'Repository'),
					h(
						'a',
						{ href: REPO + '/issues', rel: 'noopener', style: { fontSize: '.85rem' } },
						'Issues'
					),
					h(
						'a',
						{ href: REPO + '/blob/main/LICENSE', rel: 'noopener', style: { fontSize: '.85rem' } },
						'Licence'
					)
				),
				h(
					'div',
					{ class: 'stack', style: { gap: '8px' } },
					h(
						'div',
						{
							class: 'muted',
							style: {
								fontSize: '.7rem',
								fontWeight: '700',
								letterSpacing: '.07em',
								textTransform: 'uppercase'
							}
						},
						'This site'
					),
					h(
						'button',
						{ class: 'btn btn--text footlink', onclick: () => openPage('settings') },
						'Appearance and language'
					),
					h(
						'button',
						{ class: 'btn btn--text footlink', onclick: () => openPage('status') },
						'Event log'
					),
					h(
						'button',
						{ class: 'btn btn--text footlink', onclick: () => window.mowui.exportAll() },
						'Export everything'
					)
				)
			),
			h('hr'),
			h(
				'div',
				{ class: 'row', style: { gap: '16px', flexWrap: 'wrap' } },
				h(
					'span',
					{ class: 'muted', style: { fontSize: '.76rem', flex: '1', minWidth: '260px' } },
					i18n.t('foot.legal')
				),
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

function maybeDimSum() {
	const school = store.get('settings').school;
	const drawn = dimsum.draw({ schoolOn: Boolean(school && school.on) });
	if (!drawn) return;
	ui.notify(
		h(
			'span',
			{},
			h('span', {}, drawn.dish.en + ' · '),
			h('span', { class: 'cjk' }, drawn.dish.zh),
			h('br'),
			h(
				'span',
				{ style: { fontSize: '.78rem', opacity: '.85' } },
				drawn.provenance + ' ',
				h(
					'a',
					{
						href: drawn.catalogUrl,
						rel: 'noopener',
						style: { color: 'inherit', textDecoration: 'underline' }
					},
					'See the catalogue'
				)
			)
		),
		{ title: drawn.title, kind: 'info', duration: 9000 }
	);
}

// ---------------------------------------------------------------- chrome

function buildChrome() {
	brandNameEl = h('div', { class: 'brand__name' }, SHIPPED_NAME);

	const siteSearch = searchField({
		placeholder: i18n.t('search.site'),
		label: i18n.t('search.site'),
		className: 'topbar-search',
		onKeyDown: (e) => {
			if (e.key === 'Enter') {
				palette.show();
			}
		}
	});
	siteSearch.el.style.maxWidth = '300px';
	siteSearch.el.style.flex = '1 1 220px';
	siteSearch.el.addEventListener('click', (e) => {
		if (e.target.closest('.rx-btn')) return;
		palette.show();
	});

	const themeBtn = h(
		'button',
		{
			class: 'btn btn--icon btn--outlined',
			'aria-label': i18n.t('theme.toggle'),
			title: i18n.t('theme.toggle'),
			onclick: () => window.mowui.toggleTheme()
		},
		icon('sun')
	);

	const moreBtn = h(
		'button',
		{ class: 'btn btn--icon btn--outlined', 'aria-label': 'More', title: 'More' },
		icon('menu')
	);
	moreBtn.addEventListener('click', () => {
		ui.menu(
			moreBtn,
			[
				{
					label: 'Command palette',
					icon: 'search',
					key: 'Ctrl+Shift+F',
					run: () => palette.show()
				},
				{ label: 'Export everything', icon: 'download', run: () => window.mowui.exportAll() },
				{ label: 'Event log', icon: 'pulse', run: () => openPage('status') },
				{ separator: true },
				{ label: 'Repository', icon: 'github', run: () => window.open(REPO, '_blank', 'noopener') },
				{
					label: 'Upstream project',
					icon: 'github',
					run: () => window.open(UPSTREAM, '_blank', 'noopener')
				},
				{ separator: true },
				{ label: 'Settings', icon: 'gear', run: () => openPage('settings') }
			],
			{ label: 'More', width: 300, filterPlaceholder: 'Filter this menu…' }
		);
	});

	stripEl = h('div', {
		class: 'tabstrip',
		role: 'tablist',
		'aria-label': 'Site sections',
		'aria-orientation': 'horizontal'
	});

	const bar = h(
		'header',
		{ class: 'topbar' },
		h(
			'button',
			{
				class: 'brand',
				style: {
					border: 0,
					background: 'transparent',
					cursor: 'pointer',
					padding: 0,
					color: 'inherit'
				},
				onclick: () => openPage('home'),
				'aria-label': 'Home'
			},
			h('span', { class: 'brand__mark' }, icon('chat')),
			h(
				'span',
				{ class: 'stack', style: { alignItems: 'flex-start' } },
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
		const isDark =
			cur === 'dark' || (cur === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
		const next = isDark ? 'light' : 'dark';
		store.patchSettings({ theme: next }, { path: 'theme', label: 'Theme → ' + next });
		render();
	},
	exportAll() {
		const b = store.exportBundle();
		ui.downloadFile(
			'material-open-webui-site-state.json',
			JSON.stringify(b, null, 2),
			'application/json'
		);
		ui.notify(
			'Exported. Lock credentials, authenticator secrets and vocabulary contents were omitted, and the file lists what it left out.',
			{ kind: 'ok', persist: true }
		);
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

	store.subscribe((key) => {
		if (key === 'settings') applySettings();
	});

	setTimeout(maybeDimSum, 1400);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
