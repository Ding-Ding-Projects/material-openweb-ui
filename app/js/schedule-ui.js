// The scheduled-settings surface.
//
// Two things this surface must do that a rule list usually does not:
//
//   - Say what is in force RIGHT NOW and which rule is responsible. With more
//     than two rules, "why is it dark at four in the afternoon" is otherwise
//     unanswerable without reading the whole list and doing the precedence by
//     hand.
//   - State the timezone and what happens at a daylight-saving boundary where
//     the rules are, not in a help page nobody opens.

import { h, add, clear, icon } from '../../docs/assets/js/dom.js';
import * as ui from '../../docs/assets/js/ui.js';
import * as state from './state.js';
import * as schedule from './core/schedule.js';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const SETTING_CHOICES = {
	theme: { label: 'Theme', options: ['system', 'light', 'dark'] },
	language: { label: 'Language mode', options: ['English', '廣東話', 'Bilingual'] },
	funnyEn: { label: 'Funny level (English)', options: ['1', '2', '3', '4', '5'] },
	funnyZh: { label: 'Funny level (Cantonese)', options: ['1', '2', '3', '4', '5'] },
	narratorOn: { label: 'Narrator', options: ['true', 'false'] }
};

function current() {
	const stored = state.get('schedule');
	if (!stored) return schedule.empty();
	try {
		return schedule.validate(stored);
	} catch (e) {
		// A stored schedule that no longer validates is reported rather than
		// silently discarded — losing someone's rules without saying so is worse
		// than refusing to run them.
		return { ...schedule.empty(), broken: e.message, rules: [] };
	}
}

function save(doc) {
	const validated = schedule.validate(doc);
	state.set('schedule', validated);
	state.log('Schedule changed', validated.rules.length + ' rule(s)');
	return validated;
}

function newId() {
	return 'rule-' + Math.random().toString(36).slice(2, 8);
}

// ---------------------------------------------------------------- rule editor

function ruleDialog(doc, existing, onDone) {
	const rule = existing || {
		id: newId(),
		name: '',
		startTime: '20:00',
		endTime: '07:00',
		startDate: '',
		endDate: '',
		days: [0, 1, 2, 3, 4, 5, 6],
		patch: { theme: 'dark' },
		enabled: true
	};

	const name = h('input', {
		type: 'text',
		value: rule.name || '',
		placeholder: 'Evenings',
		'aria-label': 'Rule name'
	});
	const startTime = h('input', { type: 'time', value: rule.startTime, 'aria-label': 'Start time' });
	const endTime = h('input', { type: 'time', value: rule.endTime, 'aria-label': 'End time' });
	const startDate = h('input', {
		type: 'date',
		value: rule.startDate || '',
		'aria-label': 'First day (optional)'
	});
	const endDate = h('input', {
		type: 'date',
		value: rule.endDate || '',
		'aria-label': 'Last day (optional)'
	});
	const err = h('div', { style: { color: 'var(--err)', fontSize: '.8rem', minHeight: '18px' } });
	const preview = h('div', { class: 'sched__preview' });

	let days = [...rule.days];
	const dayRow = h('div', {
		class: 'sched__days',
		role: 'group',
		'aria-label': 'Days of the week'
	});
	for (let d = 0; d < 7; d++) {
		const btn = h(
			'button',
			{
				type: 'button',
				class: 'sched__day' + (days.includes(d) ? ' sched__day--on' : ''),
				'aria-pressed': String(days.includes(d)),
				onclick: () => {
					days = days.includes(d)
						? days.filter((x) => x !== d)
						: [...days, d].sort((a, b) => a - b);
					btn.classList.toggle('sched__day--on', days.includes(d));
					btn.setAttribute('aria-pressed', String(days.includes(d)));
					paintPreview();
				}
			},
			DAY_LABELS[d]
		);
		add(dayRow, btn);
	}

	let patch = { ...rule.patch };
	const patchRows = h('div', { class: 'sched__patch' });

	function paintPatch() {
		clear(patchRows);
		for (const [key, meta] of Object.entries(SETTING_CHOICES)) {
			const on = key in patch;
			const sel = ui.select({
				value: on ? String(patch[key]) : String(meta.options[0]),
				width: 170,
				label: meta.label,
				options: meta.options.map((o) => ({ value: o, label: o })),
				onChange: (v) => {
					patch[key] = key.startsWith('funny')
						? Number(v)
						: v === 'true'
							? true
							: v === 'false'
								? false
								: v;
					paintPreview();
				}
			});
			const toggle = ui.toggle({
				checked: on,
				label: 'Change ' + meta.label,
				onChange: (checked) => {
					if (checked)
						patch[key] = key.startsWith('funny') ? Number(meta.options[0]) : meta.options[0];
					else delete patch[key];
					paintPatch();
					paintPreview();
				}
			});
			add(
				patchRows,
				h(
					'div',
					{ class: 'sched__patchrow' },
					toggle.el,
					h('span', { class: 'sched__patchlabel' }, meta.label),
					on ? sel.el : h('span', { class: 'muted', style: { fontSize: '.76rem' } }, 'not changed')
				)
			);
		}
	}

	function collect() {
		return schedule.validateRule({
			id: rule.id,
			name: name.value.trim() || 'Untitled rule',
			startTime: startTime.value || '00:00',
			endTime: endTime.value || '00:00',
			startDate: startDate.value || null,
			endDate: endDate.value || null,
			days,
			patch,
			enabled: rule.enabled !== false
		});
	}

	function paintPreview() {
		clear(preview);
		try {
			const built = collect();
			add(
				preview,
				h('div', { class: 'sched__previewline' }, schedule.describe(built, doc.timeZone)),
				h(
					'div',
					{ class: 'muted', style: { fontSize: '.72rem', marginTop: '4px' } },
					'Precedence weight ' +
						schedule.specificity(built) +
						'. A more specific rule wins; among equals, the one lower in the list wins.'
				)
			);
		} catch (e) {
			add(preview, h('div', { style: { color: 'var(--err)' } }, e.message));
		}
	}

	for (const input of [name, startTime, endTime, startDate, endDate]) {
		input.addEventListener('input', paintPreview);
	}
	paintPatch();
	paintPreview();

	const d = ui.dialog({
		title: existing ? 'Edit rule' : 'New rule',
		emoji: '🕗',
		wide: true,
		body: h(
			'div',
			{ class: 'stack', style: { gap: '14px' } },
			h('div', { class: 'field' }, name),
			h(
				'div',
				{ class: 'sched__times' },
				h('label', {}, h('span', {}, 'From'), startTime),
				h('label', {}, h('span', {}, 'To'), endTime)
			),
			h(
				'p',
				{ class: 'muted', style: { fontSize: '.76rem', lineHeight: '1.6' } },
				'An end time earlier than the start means the window crosses midnight, and it belongs to the day it began on. Setting both to the same time means all day.'
			),
			dayRow,
			h(
				'div',
				{ class: 'sched__times' },
				h('label', {}, h('span', {}, 'First day'), startDate),
				h('label', {}, h('span', {}, 'Last day'), endDate)
			),
			h('hr'),
			h('div', { class: 'sched__grouplabel' }, 'While this rule is in force'),
			patchRows,
			preview,
			err
		),
		actions: [
			{ label: 'Cancel' },
			existing
				? {
						label: 'Delete',
						danger: true,
						run: () => {
							const next = { ...doc, rules: doc.rules.filter((r) => r.id !== rule.id) };
							save(next);
							onDone();
						}
					}
				: null,
			{
				label: existing ? 'Save' : 'Add',
				primary: true,
				run: () => {
					let built;
					try {
						built = collect();
					} catch (e) {
						err.textContent = e.message;
						return true;
					}
					const rules = existing
						? doc.rules.map((r) => (r.id === rule.id ? built : r))
						: [...doc.rules, built];
					try {
						save({ ...doc, rules });
					} catch (e) {
						err.textContent = e.message;
						return true;
					}
					onDone();
				}
			}
		].filter(Boolean)
	});
	return d;
}

// ---------------------------------------------------------------- the section

export function render(box, onChanged) {
	clear(box);
	const doc = current();
	const now = new Date();

	let resolved = null;
	try {
		resolved = schedule.resolve(doc, now, doc.timeZone);
	} catch (e) {
		resolved = null;
	}

	const list = h('div', { class: 'sched__list' });

	function repaint() {
		render(box, onChanged);
		if (onChanged) onChanged();
	}

	for (const rule of doc.rules) {
		const inForce = resolved && resolved.applied.some((a) => a.id === rule.id);
		const winning = resolved
			? Object.entries(resolved.because)
					.filter(([, id]) => id === rule.id)
					.map(([k]) => k)
			: [];
		add(
			list,
			h(
				'div',
				{ class: 'sched__rule' + (inForce ? ' sched__rule--live' : '') },
				h(
					'div',
					{ class: 'sched__rulehead' },
					h('strong', {}, rule.name),
					inForce
						? h(
								'span',
								{ class: 'sched__badge' },
								winning.length ? 'in force' : 'in force, overridden'
							)
						: null,
					rule.enabled === false
						? h('span', { class: 'sched__badge sched__badge--off' }, 'off')
						: null,
					h('span', { style: { flex: '1' } }),
					h(
						'button',
						{
							class: 'btn btn--outlined btn--sm',
							onclick: () => ruleDialog(doc, rule, repaint)
						},
						'Edit'
					)
				),
				h('div', { class: 'sched__ruleline' }, schedule.describe(rule, doc.timeZone)),
				h(
					'div',
					{ class: 'sched__rulepatch' },
					...Object.entries(rule.patch).map(([k, v]) =>
						h(
							'span',
							{ class: 'sched__chip' + (winning.includes(k) ? ' sched__chip--winning' : '') },
							(SETTING_CHOICES[k] ? SETTING_CHOICES[k].label : k) + ' → ' + String(v)
						)
					)
				)
			)
		);
	}

	if (!doc.rules.length) {
		add(
			list,
			h(
				'div',
				{ class: 'muted', style: { fontSize: '.82rem', padding: '10px 0' } },
				'No rules yet. Nothing changes on a schedule until one is added.'
			)
		);
	}

	const zoneRow = h(
		'div',
		{ class: 'sched__zone' },
		icon('clock', 'icon icon--sm'),
		h(
			'div',
			{},
			h('div', {}, 'Times are read in ' + doc.timeZone + '.'),
			resolved
				? h(
						'div',
						{ class: 'muted', style: { fontSize: '.75rem' } },
						'It is ' +
							String(resolved.at.hour).padStart(2, '0') +
							':' +
							String(resolved.at.minute).padStart(2, '0') +
							' there now, and ' +
							resolved.applied.length +
							' of ' +
							doc.rules.length +
							' rules are in force.'
					)
				: null
		)
	);

	add(
		box,
		h('h2', { class: 'card__title' }, 'Scheduled settings'),
		h(
			'p',
			{ class: 'card__sub' },
			'Rules change settings by time of day, day of week and date. Everything below is evaluated on this machine; nothing is sent anywhere.'
		),
		doc.broken
			? h(
					'div',
					{ class: 'state state--bad' },
					icon('warn'),
					h(
						'div',
						{ class: 'state__body' },
						h('div', { class: 'state__title' }, 'The stored schedule was not run'),
						h(
							'div',
							{ class: 'state__text' },
							doc.broken +
								' Your rules have not been deleted — they are simply not being applied until this is resolved.'
						)
					)
				)
			: null,
		zoneRow,
		list,
		h(
			'div',
			{ class: 'sched__actions' },
			h(
				'button',
				{ class: 'btn btn--filled', onclick: () => ruleDialog(doc, null, repaint) },
				icon('plus', 'icon icon--sm'),
				'Add a rule'
			),
			doc.rules.length
				? h(
						'button',
						{
							class: 'btn btn--outlined',
							onclick: () =>
								ui.downloadFile('schedule.json', JSON.stringify(doc, null, 2), 'application/json')
						},
						'Export the schedule'
					)
				: null
		),
		h(
			'details',
			{ class: 'sched__dst' },
			h('summary', {}, 'What happens when the clocks change'),
			h('p', { class: 'sched__dstline' }, schedule.DST_NOTE.en),
			h('p', { class: 'sched__dstline cjk' }, schedule.DST_NOTE.zh)
		)
	);
}

/**
 * The settings the schedule wants in force right now.
 *
 * Returned rather than applied, so the caller decides what to do with it. A
 * scheduler that writes directly into settings makes it impossible to tell a
 * scheduled value from one somebody chose.
 */
export function inForce(at = new Date()) {
	const doc = current();
	if (doc.broken || !doc.rules.length) return { settings: {}, because: {}, applied: [] };
	try {
		return schedule.resolve(doc, at, doc.timeZone);
	} catch {
		return { settings: {}, because: {}, applied: [] };
	}
}
