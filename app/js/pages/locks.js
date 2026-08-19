// Every lock in one place.
//
// The contract asks for locks to be tracked as a real list — enumerable,
// individually editable, individually removable, searchable through the same
// regex-wired search every other list has, and manageable in bulk. A feature
// that scatters its state across the elements it locks is a feature nobody can
// audit or clean up.

import { h, icon, clear, add, fmtTime } from '../../../docs/assets/js/dom.js';
import { searchField } from '../../../docs/assets/js/regex.js';
import * as ui from '../../../docs/assets/js/ui.js';
import * as locks from '../core/locks.js';
import * as locksUi from '../locks-ui.js';
import * as state from '../state.js';

export function render(root) {
	const page = h('div', { class: 'page' });
	const list = h('div', { class: 'stack', style: { gap: '10px' } });
	const count = h('div', { class: 'muted', style: { fontSize: '.78rem' } });
	const bulkBar = h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap' } });
	const selected = new Set();

	const field = searchField({
		placeholder: 'Search locks…',
		label: 'Search locks',
		sampleFrom: () => locks.list().map((l) => l.label)
	});

	function view() {
		const m = field.matcher();
		return locks.list().filter((l) => m.test(l.label + ' ' + l.method));
	}

	function paint() {
		const rows = view();
		clear(list);
		count.textContent = rows.length + ' of ' + locks.list().length + ' locks shown';

		if (!rows.length) {
			add(
				list,
				h(
					'div',
					{ class: 'pending' },
					h('strong', {}, locks.list().length ? 'No matches' : 'Nothing is locked'),
					h(
						'span',
						{ class: 'muted', style: { fontSize: '.85rem', maxWidth: '56ch' } },
						locks.list().length
							? 'No lock matches that search.'
							: 'Right-click a tab and choose “Lock this tab…” to create one. Each lock gets its own credential — there is no master answer here.'
					)
				)
			);
			return;
		}

		for (const l of rows) {
			const open = !locks.isLocked(l.id);
			const cb = h('input', {
				type: 'checkbox',
				'aria-label': 'Select ' + l.label,
				style: { accentColor: 'var(--p)' },
				checked: selected.has(l.id),
				onchange: (e) => {
					e.target.checked ? selected.add(l.id) : selected.delete(l.id);
					sync();
				}
			});

			add(
				list,
				h(
					'div',
					{
						class: 'card',
						style: { display: 'flex', gap: '12px', alignItems: 'center', padding: '14px 18px' }
					},
					cb,
					icon(open ? 'unlock' : 'lock'),
					h(
						'div',
						{ class: 'stack', style: { gap: '2px', flex: '1', minWidth: '0' } },
						h('strong', { style: { fontSize: '.9rem' } }, l.label),
						h(
							'span',
							{ class: 'muted', style: { fontSize: '.74rem' } },
							(l.method === 'password' ? 'Password' : 'One-time code') +
								' · created ' +
								fmtTime(l.createdAt) +
								' · ' +
								(open ? 'open' : 'locked')
						)
					),
					open
						? h(
								'button',
								{
									class: 'btn btn--outlined',
									onclick: () => {
										locks.relock(l.id);
										paint();
									}
								},
								'Lock again'
							)
						: h(
								'button',
								{ class: 'btn btn--outlined', onclick: () => locksUi.unlockPrompt(l.id, paint) },
								'Unlock'
							),
					h(
						'button',
						{
							class: 'btn btn--text',
							style: { color: 'var(--err)' },
							onclick: () =>
								ui.superConfirm({
									what: 'Remove the lock on “' + l.label + '”',
									affects:
										'The lock and its credential are removed from this machine. The element stops being locked. Nothing else is touched, and nothing you have stored is deleted.',
									onConfirm: () => {
										locks.remove(l.id);
										selected.delete(l.id);
										paint();
										sync();
									}
								})
						},
						'Remove'
					)
				)
			);
		}
	}

	function sync() {
		clear(bulkBar);
		const rows = view();
		add(
			bulkBar,
			h(
				'button',
				{
					class: 'btn btn--text',
					onclick: () => {
						rows.forEach((r) => selected.add(r.id));
						paint();
						sync();
					}
				},
				'Select all ' + rows.length + ' matching'
			),
			h(
				'button',
				{
					class: 'btn btn--text',
					onclick: () => {
						rows.forEach((r) => (selected.has(r.id) ? selected.delete(r.id) : selected.add(r.id)));
						paint();
						sync();
					}
				},
				'Invert'
			),
			h(
				'button',
				{
					class: 'btn btn--text',
					onclick: () => {
						selected.clear();
						paint();
						sync();
					}
				},
				'Clear'
			),
			selected.size ? h('span', { class: 'chip' }, selected.size + ' selected') : null,
			selected.size
				? h(
						'button',
						{
							class: 'btn btn--danger',
							onclick: () =>
								ui.superConfirm({
									what: 'Remove ' + selected.size + ' lock(s)',
									affects:
										'Each selected lock and its credential is removed from this machine. The elements stop being locked. Nothing you have stored is deleted.',
									onConfirm: () => {
										const n = selected.size;
										[...selected].forEach((id) => locks.remove(id));
										selected.clear();
										paint();
										sync();
										ui.notify('Removed ' + n + ' lock(s).', { kind: 'ok' });
									}
								})
						},
						icon('trash', 'icon icon--sm'),
						'Remove selected'
					)
				: null
		);
	}

	field.onChange(() => {
		paint();
		sync();
	});

	add(
		page,
		h(
			'div',
			{ class: 'page__head' },
			h(
				'div',
				{ style: { flex: '1' } },
				h('div', { class: 'page__title' }, 'Locks'),
				h(
					'div',
					{ class: 'page__sub' },
					'Every lock you have set, each with its own credential. Unlocking one never unlocks another.'
				)
			),
			h(
				'button',
				{ class: 'btn btn--outlined', onclick: () => locksUi.supportTickets() },
				icon('file', 'icon icon--sm'),
				'Support Tickets'
			)
		),
		h(
			'div',
			{ class: 'state state--info', style: { marginBottom: '18px' } },
			icon('info'),
			h(
				'div',
				{ class: 'state__body' },
				h('div', { class: 'state__title' }, 'These are toy locks'),
				h('div', { class: 'state__text' }, locks.DISCLOSURE)
			)
		),
		field.el,
		count,
		bulkBar,
		h('div', { style: { height: '10px' } }),
		list
	);

	root.append(page);
	paint();
	sync();
}

export const meta = { id: 'locks', title: 'Locks', zh: '鎖', icon: 'lock' };
