// The history panel.
//
// Everything on this surface is derived from what was actually recorded: the
// action filter, the days the date pickers offer, the counts. A hardcoded list
// of actions goes stale the moment a new kind of change is recorded, and it
// goes stale silently — by simply not offering a filter for something that is
// sitting right there in the list.

import { h, add, clear, icon } from '../../../docs/assets/js/dom.js';
import { searchField } from '../../../docs/assets/js/regex.js';
import * as ui from '../../../docs/assets/js/ui.js';
import * as state from '../state.js';
import * as historyCore from '../core/history.js';
import * as formats from '../../../docs/assets/js/formats.js';
import { bulkBar, rowCheckbox } from '../../../docs/assets/js/bulk.js';

export const meta = { title: 'History', icon: 'history', zh: '版本記錄' };

function log() {
	const stored = state.get('history');
	return stored && Array.isArray(stored.entries) ? stored : historyCore.empty();
}

export function render(root) {
	const page = h('div', { class: 'page' });
	const list = h('div', { class: 'hist__list' });
	const chainRow = h('div', { class: 'hist__chain', role: 'status' });

	let action = '';
	let from = '';
	let to = '';
	const field = searchField({
		placeholder: 'Search the history…',
		label: 'Search history entries'
	});

	function visible() {
		return historyCore.filter(log(), {
			test: field.matcher().ok ? field.matcher().test : null,
			action,
			from,
			to
		});
	}

	const bar = bulkBar({
		getScopeIds: () => visible().map((e) => String(e.seq)),
		getAllIds: () => log().entries.map((e) => String(e.seq)),
		noun: 'entry',
		actions: [
			{
				id: 'label',
				label: 'Label',
				icon: 'file',
				confirm: false,
				run: async (ids) => {
					const input = h('input', {
						type: 'text',
						placeholder: 'A note you will recognise later',
						'aria-label': 'Label'
					});
					ui.dialog({
						title: 'Label ' + ids.length + ' entr' + (ids.length === 1 ? 'y' : 'ies'),
						body: h('div', { class: 'field' }, input),
						actions: [
							{ label: 'Cancel' },
							{
								label: 'Apply',
								primary: true,
								run: async () => {
									let current = log();
									for (const id of ids) {
										({ log: current } = await historyCore.label(current, Number(id), input.value));
									}
									state.set('history', current);
									paint();
								}
							}
						]
					});
				}
			}
		],
		exportRows: (ids) => {
			const wanted = new Set(ids);
			return historyCore.forExport(log()).rows.filter((r) => wanted.has(String(r.seq)));
		}
	});

	// ---------- painting ----------

	async function paintChain() {
		clear(chainRow);
		const verdict = await historyCore.verify(log());
		add(
			chainRow,
			icon(verdict.ok ? 'check' : 'warn', 'icon icon--sm'),
			h(
				'span',
				{},
				verdict.ok
					? verdict.checked + ' entries, each carrying the hash of the one before it.'
					: 'The chain breaks at entry ' + verdict.seq + ': ' + verdict.reason + '.'
			),
			// Stated rather than implied. A chain that anything able to edit an entry
			// can also recompute is a corruption check, not a tamper-proof one, and
			// saying otherwise would be a security claim this cannot support.
			h(
				'span',
				{ class: 'muted hist__caveat' },
				'This catches corruption and accidental edits. It is not a security boundary: anything that can rewrite an entry can rewrite the chain with it.'
			)
		);
	}

	function paint() {
		const entries = visible();
		const all = log();
		bar.refresh();
		clear(list);

		if (!all.entries.length) {
			add(
				list,
				h(
					'div',
					{ class: 'state state--info' },
					icon('info'),
					h(
						'div',
						{ class: 'state__body' },
						h('div', { class: 'state__title' }, 'Nothing recorded yet'),
						h(
							'div',
							{ class: 'state__text' },
							'History starts the first time a setting or record changes. Nothing is written retrospectively, so this is empty rather than pretending to know what happened before it existed.'
						)
					)
				)
			);
			return;
		}

		if (!entries.length) {
			add(
				list,
				h(
					'div',
					{ class: 'muted', style: { padding: '14px 0', fontSize: '.84rem' } },
					'No entry matches the current filter. ' + all.entries.length + ' are hidden by it.'
				)
			);
			return;
		}

		for (const e of entries.slice().reverse()) {
			const changes = historyCore.diff(e.before, e.after);
			const labelText = historyCore.labelFor(all, e.seq);
			add(
				list,
				h(
					'div',
					{ class: 'hist__row' },
					rowCheckbox(bar, String(e.seq), 'entry ' + e.seq),
					h(
						'div',
						{ class: 'hist__body' },
						h(
							'div',
							{ class: 'hist__head' },
							h('span', { class: 'hist__action' }, e.action),
							e.target ? h('span', { class: 'hist__target' }, e.target) : null,
							labelText ? h('span', { class: 'hist__label' }, labelText) : null,
							h('span', { style: { flex: '1' } }),
							h('span', { class: 'hist__at mono' }, String(e.at).replace('T', ' ').slice(0, 19)),
							h('span', { class: 'hist__seq mono' }, '#' + e.seq)
						),
						changes.length
							? h(
									'div',
									{ class: 'hist__diff' },
									...changes.map((c) =>
										h(
											'div',
											{ class: 'hist__change' },
											h('span', { class: 'hist__key mono' }, c.key || '(value)'),
											h('span', { class: 'hist__kind hist__kind--' + c.kind }, c.kind),
											h('span', { class: 'hist__from mono' }, JSON.stringify(c.before)),
											h('span', { class: 'hist__arrow' }, '→'),
											h('span', { class: 'hist__to mono' }, JSON.stringify(c.after))
										)
									)
								)
							: h('div', { class: 'muted', style: { fontSize: '.74rem' } }, 'No field changed.'),
						h(
							'div',
							{ class: 'hist__actions' },
							h(
								'button',
								{
									class: 'btn btn--outlined btn--sm',
									onclick: async () => {
										const result = await historyCore.restore(log(), e.seq);
										state.set('history', result.log);
										ui.notify(
											'Restored, and recorded as a new entry — the original is still there.',
											{ kind: 'ok' }
										);
										paint();
										paintChain();
									}
								},
								icon('undo', 'icon icon--sm'),
								'Restore this value'
							),
							h(
								'button',
								{
									class: 'btn btn--outlined btn--sm',
									onclick: () => ui.copyToClipboard(e.hash, 'Hash copied.')
								},
								'Copy hash'
							)
						)
					)
				)
			);
		}
	}

	// ---------- filters, all derived ----------

	function filterRow() {
		const all = log();
		const acts = historyCore.actions(all);
		const dayList = historyCore.days(all);

		const actionSel = ui.select({
			value: action,
			width: 210,
			label: 'Action',
			options: [
				{ value: '', label: 'Every action (' + all.entries.length + ')' },
				...acts.map((a) => ({ value: a.action, label: a.action + ' (' + a.count + ')' }))
			],
			onChange: (v) => {
				action = v;
				paint();
			}
		});

		const fromSel = ui.select({
			value: from,
			width: 190,
			label: 'From',
			options: [
				{ value: '', label: 'The beginning' },
				...dayList
					.slice()
					.reverse()
					.map((d) => ({ value: d.day, label: d.day + ' (' + d.count + ')' }))
			],
			onChange: (v) => {
				from = v;
				paint();
			}
		});
		const toSel = ui.select({
			value: to,
			width: 190,
			label: 'To',
			options: [
				{ value: '', label: 'Today' },
				...dayList.map((d) => ({ value: d.day, label: d.day + ' (' + d.count + ')' }))
			],
			onChange: (v) => {
				to = v;
				paint();
			}
		});

		return h('div', { class: 'hist__filters' }, field.el, actionSel.el, fromSel.el, toSel.el);
	}

	// ---------- prune ----------

	function pruneDialog() {
		const all = log();
		const dayList = historyCore.days(all);
		let before = dayList.length ? dayList[Math.floor(dayList.length / 2)].day : '';
		let keepLabelled = true;

		const daySel = ui.select({
			value: before,
			width: 210,
			label: 'Remove entries before',
			options: dayList
				.slice()
				.reverse()
				.map((d) => ({ value: d.day, label: d.day })),
			onChange: (v) => {
				before = v;
			}
		});
		const keep = ui.toggle({
			checked: true,
			label: 'Keep labelled entries',
			onChange: (v) => {
				keepLabelled = v;
			}
		});

		ui.dialog({
			title: 'Prune the history',
			emoji: '🧹',
			body: h(
				'div',
				{ class: 'stack', style: { gap: '12px' } },
				h(
					'p',
					{ class: 'muted', style: { fontSize: '.82rem', lineHeight: '1.6' } },
					'Pruning is the one thing that takes something out of an append-only history, so it records that it happened and how much went. A history that quietly becomes shorter is worse than one that is honestly incomplete.'
				),
				daySel.el,
				h(
					'div',
					{ class: 'row', style: { gap: '10px', alignItems: 'center' } },
					keep.el,
					h('span', {}, 'Keep labelled entries')
				),
				h(
					'p',
					{ class: 'muted', style: { fontSize: '.78rem' } },
					'The chain is rebuilt across what remains, so it still verifies afterwards.'
				)
			),
			actions: [
				{ label: 'Cancel' },
				{
					label: 'Prune',
					danger: true,
					run: async () => {
						const result = await historyCore.prune(log(), { before, keepLabelled });
						state.set('history', result.log);
						ui.notify(result.removed + ' entries removed, and the removal recorded.', {
							kind: 'ok'
						});
						paint();
						paintChain();
					}
				}
			]
		});
	}

	// ---------- assembly ----------

	field.onChange(paint);

	add(
		page,
		h(
			'div',
			{ class: 'page__head' },
			h(
				'div',
				{ style: { flex: '1' } },
				h('div', { class: 'page__title' }, 'History'),
				h(
					'div',
					{ class: 'page__sub' },
					"Every change to a setting or a record, in the order it happened. Kept in this application's own data — never as a repository inside one of your folders."
				)
			),
			h(
				'div',
				{ class: 'row', style: { gap: '8px' } },
				h(
					'button',
					{ class: 'btn btn--outlined', onclick: pruneDialog },
					icon('trash', 'icon icon--sm'),
					'Prune…'
				),
				h(
					'button',
					{
						class: 'btn btn--outlined',
						onclick: () => {
							const out = historyCore.forExport(log());
							ui.dialog({
								title: 'Export the whole history',
								wide: true,
								body: h(
									'div',
									{ class: 'stack', style: { gap: '10px' } },
									h('p', {}, out.rows.length + ' entries.'),
									h(
										'div',
										{ class: 'state state--info' },
										icon('info'),
										h(
											'div',
											{ class: 'state__body' },
											h('div', { class: 'state__title' }, 'What this export does not contain'),
											...out.omitted.map((o) => h('div', { class: 'state__text' }, o))
										)
									)
								),
								actions: [
									{ label: 'Cancel' },
									{
										label: 'Save as JSON',
										primary: true,
										run: () =>
											ui.downloadFile(
												'history.json',
												formats.serialise(out.rows, 'json'),
												'application/json'
											)
									}
								]
							});
						}
					},
					icon('download', 'icon icon--sm'),
					'Export all'
				)
			)
		),
		chainRow,
		filterRow(),
		bar.el,
		list
	);

	root.append(page);
	paint();
	paintChain();
}
