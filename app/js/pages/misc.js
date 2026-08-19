// Status, Settings, Changelog, and the two surfaces that need the Open WebUI
// backend. The last two are the interesting ones: rather than rendering an
// empty table when there is no backend, they say which state they are in and
// what would change it.

import { h, icon, clear, fmtTime, add } from '../../../docs/assets/js/dom.js';
import { searchField } from '../../../docs/assets/js/regex.js';
import * as ui from '../../../docs/assets/js/ui.js';
import * as state from '../state.js';
import * as desktop from '../desktop.js';
import * as ollama from '../core/ollama.js';
import { bulkBar, rowCheckbox } from '../../../docs/assets/js/bulk.js';

// ---------------------------------------------------------------- status

export function renderStatus(root) {
	const page = h('div', { class: 'page' });
	const log = h('div', { class: 'stack', style: { gap: '6px' } });
	const count = h('div', { class: 'muted', style: { fontSize: '.78rem' } });
	const field = searchField({
		placeholder: 'Search the event log…',
		label: 'Search the event log'
	});

	const entries = () =>
		(state.get('statusLog') || []).map((e, i) => (e.id ? e : { ...e, id: 'legacy-' + i }));
	const shown = () => {
		const m = field.matcher();
		return entries().filter((e) => m.test(e.event + ' ' + (e.detail || '')));
	};

	const bar = bulkBar({
		getScopeIds: () => shown().map((e) => e.id),
		getAllIds: () => entries().map((e) => e.id),
		noun: 'event',
		actions: [
			{
				id: 'delete',
				label: 'Delete',
				icon: 'trash',
				danger: true,
				run: (ids) => {
					const drop = new Set(ids);
					state.set(
						'statusLog',
						entries().filter((e) => !drop.has(e.id))
					);
					paint();
				}
			}
		],
		exportRows: (ids) => {
			const want = new Set(ids);
			return entries()
				.filter((e) => want.has(e.id))
				.map((e) => ({ at: new Date(e.t).toISOString(), event: e.event, detail: e.detail || '' }));
		}
	});

	function paint() {
		const m = field.matcher();
		clear(log);
		const all = entries();
		const rows = shown();
		bar.refresh();
		count.textContent = rows.length + ' of ' + all.length + ' events shown';
		if (!rows.length) {
			log.append(
				h(
					'div',
					{ class: 'pending' },
					h('strong', {}, all.length ? 'No matches' : 'Nothing has happened yet'),
					h(
						'span',
						{ class: 'muted', style: { fontSize: '.84rem', maxWidth: '54ch' } },
						all.length
							? 'No event matches that search.'
							: 'Every feature writes here as it acts, so this log is what happened rather than what was meant to.'
					)
				)
			);
			return;
		}
		for (const e of rows) {
			log.append(
				h(
					'div',
					{
						class: 'card',
						style: { display: 'flex', gap: '12px', alignItems: 'center', padding: '10px 16px' }
					},
					rowCheckbox(bar, e.id, e.event + ' ' + (e.detail || '')),
					h(
						'span',
						{ class: 'chip chip--tonal', style: { height: '22px', fontSize: '.66rem' } },
						e.event
					),
					h('span', { style: { flex: '1', fontSize: '.84rem' } }, e.detail || ''),
					h('span', { class: 'mono muted', style: { fontSize: '.7rem' } }, fmtTime(e.t))
				)
			);
		}
	}
	field.onChange(paint);

	const session = h(
		'div',
		{ class: 'card', style: { marginBottom: '20px' } },
		h('div', { class: 'muted' }, 'Reading the session…')
	);
	(async () => {
		const info = desktop.isDesktop ? await desktop.appInfo() : null;
		const data = desktop.isDesktop ? await desktop.appData() : null;
		const health = await ollama.health(state.get('settings').ollamaHost).catch(() => null);
		clear(session);
		const cell = (k, v) =>
			h(
				'div',
				{ class: 'stack', style: { gap: '2px' } },
				h(
					'span',
					{
						class: 'muted',
						style: { fontSize: '.68rem', textTransform: 'uppercase', letterSpacing: '.06em' }
					},
					k
				),
				h('span', { style: { fontSize: '.86rem', fontWeight: '600' } }, v)
			);
		add(
			session,
			h(
				'div',
				{ class: 'row', style: { gap: '10px', marginBottom: '14px' } },
				icon('pulse'),
				h('strong', {}, 'This session')
			),
			h(
				'div',
				{ class: 'grid grid--3' },
				cell('Surface', desktop.isDesktop ? 'Desktop shell' : 'Browser (development)'),
				cell('Version', info?.version ?? '0.0.0'),
				cell(
					'Data directory',
					info?.userData ? '…' + String(info.userData).slice(-28) : 'browser storage'
				),
				cell(
					'Ollama',
					health
						? health.status === 'ready'
							? 'ready · v' + health.version
							: health.status
						: 'not checked'
				),
				cell('Backend', data?.backend?.status ?? 'not started'),
				cell('Recorded events', String((state.get('statusLog') || []).length))
			),
			data?.backend?.status === 'unavailable'
				? h(
						'div',
						{ class: 'state state--info', style: { marginTop: '14px' } },
						icon('info'),
						h(
							'div',
							{ class: 'state__body' },
							h('div', { class: 'state__title' }, 'Running local-only'),
							h('div', { class: 'state__text' }, data.backend.reason)
						)
					)
				: null
		);
	})();

	page.append(
		h(
			'div',
			{ class: 'page__head' },
			h(
				'div',
				{ style: { flex: '1' } },
				h('div', { class: 'page__title' }, 'Status'),
				h(
					'div',
					{ class: 'page__sub' },
					'A live session card and the real event log. Every feature writes to it as it acts.'
				)
			)
		),
		session,
		field.el,
		count,
		bar.el,
		log
	);
	root.append(page);
	paint();
}

// ---------------------------------------------------------------- settings

export { render as renderSettings } from './settings.js';

export function applyTheme() {
	const t = state.get('settings').theme;
	if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
	else document.documentElement.removeAttribute('data-theme');
}

// ---------------------------------------------------------------- changelog

export function renderChangelog(root) {
	const page = h('div', { class: 'page' });
	page.append(
		h(
			'div',
			{ class: 'page__head' },
			h(
				'div',
				{ style: { flex: '1' } },
				h('div', { class: 'page__title' }, 'Changelog'),
				h('div', { class: 'page__sub' }, 'Every released version, in the application.')
			)
		),
		h(
			'div',
			{ class: 'pending' },
			icon('clock', 'icon icon--lg'),
			h('strong', {}, 'No version has been released'),
			h(
				'span',
				{ class: 'muted', style: { fontSize: '.85rem', maxWidth: '58ch' } },
				"There is nothing to list, and inventing entries to fill the space would make this viewer document a history that never happened. The repository's commit log is the real record until the first release exists."
			)
		)
	);
	root.append(page);
}

// ---------------------------------------------------------------- backend-dependent

function backendGated(root, { title, sub, needs }) {
	const page = h('div', { class: 'page' });
	const box = h('div', {});

	(async () => {
		const data = desktop.isDesktop ? await desktop.appData() : null;
		const b = data?.backend;
		clear(box);

		if (b?.status === 'ready') {
			box.append(
				h(
					'div',
					{ class: 'state state--ok' },
					icon('check'),
					h(
						'div',
						{ class: 'state__body' },
						h('div', { class: 'state__title' }, 'The backend is running at ' + b.url),
						h(
							'div',
							{ class: 'state__text' },
							'This surface is not implemented yet — INVENTORY.md marks it planned. It is left empty rather than filled with a table of nothing.'
						)
					)
				)
			);
			return;
		}

		const reason =
			b?.status === 'unavailable'
				? b.reason
				: b?.status === 'failed'
					? 'The backend process started and then exited. ' + (b.reason || '')
					: desktop.isDesktop
						? 'The backend has not started yet.'
						: 'These files are running in a browser, which has no backend to supervise.';

		add(
			box,
			h(
				'div',
				{ class: 'state state--info' },
				icon('info'),
				h(
					'div',
					{ class: 'state__body' },
					h(
						'div',
						{ class: 'state__title' },
						'Running local-only, so ' + needs + ' is unavailable'
					),
					h('div', { class: 'state__text' }, reason),
					h(
						'div',
						{ class: 'state__text', style: { marginTop: '10px' } },
						'Everything that works without a server — chat against a local model, the converter, the authenticator — is unaffected and continues to work.'
					),
					desktop.isDesktop
						? h(
								'button',
								{
									class: 'btn btn--outlined',
									style: { marginTop: '14px' },
									onclick: async () => {
										ui.notify('Asking the shell to start the backend…', { kind: 'info' });
										await desktop.startBackend();
										window.mowuiApp.refresh();
									}
								},
								'Try to start it'
							)
						: null
				)
			)
		);
	})();

	page.append(
		h(
			'div',
			{ class: 'page__head' },
			h(
				'div',
				{ style: { flex: '1' } },
				h('div', { class: 'page__title' }, title),
				h('div', { class: 'page__sub' }, sub)
			)
		),
		box
	);
	root.append(page);
}

export function renderWorkspace(root) {
	backendGated(root, {
		title: 'Workspace',
		sub: 'Models, prompts, knowledge and tools.',
		needs: 'the workspace'
	});
}

export function renderAdmin(root) {
	backendGated(root, {
		title: 'Admin',
		sub: 'Users, roles and instance settings.',
		needs: 'the admin panel'
	});
}
