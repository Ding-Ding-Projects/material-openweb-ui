// Notifications, dialogs, menus, selects, and the destructive-action gate.
//
// Two contracts are enforced structurally here rather than left to callers:
//   * Every menu and every select opens with a filter field carrying its own
//     anchored regex builder. "It only has four items" is not an exemption,
//     because a four-item menu becomes fourteen without anyone revisiting it.
//   * Anything that only informs becomes a non-blocking notification. A modal
//     is reserved for a decision that must be made before continuing.

import { h, icon, popover, trapFocus, fmtTime } from './dom.js';
import { searchField } from './regex.js';
import * as i18n from './i18n.js';
import * as store from './store.js';

// ---------- notifications ----------

let toastHost = null;
const NOTE_CAP = 200;

function host() {
	if (!toastHost) {
		toastHost = h('div', {
			class: 'toasts',
			role: 'region',
			'aria-label': 'Notifications',
			'aria-live': 'polite'
		});
		document.body.appendChild(toastHost);
	}
	return toastHost;
}

/** Informational, success and progress messages. Errors persist until dismissed. */
export function notify(message, opts = {}) {
	const kind = opts.kind || 'info';
	const entry = {
		id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
		t: Date.now(),
		kind,
		title: opts.title || '',
		message,
		dismissed: false
	};
	const log = store.get('notifications') || [];
	log.unshift(entry);
	store.set('notifications', log.slice(0, NOTE_CAP), { record: false });

	const body = h(
		'div',
		{ class: 'toast__body' },
		opts.title ? h('div', { class: 'toast__title' }, opts.title) : null,
		h('div', {}, message)
	);

	const el = h(
		'div',
		{
			class: 'toast' + (kind === 'error' ? ' toast--err' : kind === 'ok' ? ' toast--ok' : ''),
			role: kind === 'error' ? 'alert' : 'status'
		},
		icon(kind === 'error' ? 'warn' : kind === 'ok' ? 'check' : 'info', 'icon icon--sm'),
		body,
		opts.action
			? h(
					'button',
					{
						type: 'button',
						class: 'toast__act',
						onclick: () => {
							opts.action.run();
							close();
						}
					},
					opts.action.label
				)
			: null,
		h(
			'button',
			{
				type: 'button',
				class: 'btn btn--icon btn--text',
				'aria-label': i18n.t('action.close'),
				style: { width: '28px', height: '28px', minWidth: '28px' },
				onclick: () => close()
			},
			icon('x', 'icon icon--sm')
		)
	);

	host().appendChild(el);

	let timer = null;
	const persist = kind === 'error' || kind === 'warn' || opts.persist;
	if (!persist) timer = setTimeout(close, opts.duration || 5200);

	function close() {
		if (timer) clearTimeout(timer);
		el.remove();
	}
	return { close, id: entry.id };
}

export function notifications() {
	return store.get('notifications') || [];
}

export function dismissNotifications(ids) {
	const set = new Set(ids);
	const next = (store.get('notifications') || []).filter((n) => !set.has(n.id));
	store.set('notifications', next, {
		action: 'deleted',
		label: ids.length + ' notification(s) dismissed'
	});
	return next;
}

// ---------- dialog ----------

export function dialog({ title, body, actions = [], emoji, onClose, wide }) {
	const showEmoji = store.get('settings').emojiDialogs && emoji;
	const scrim = h('div', { class: 'scrim', onclick: () => close() });
	const el = h(
		'div',
		{
			class: 'dialog',
			role: 'dialog',
			'aria-modal': 'true',
			'aria-label': title,
			style: wide ? { width: 'min(880px, calc(100vw - 32px))' } : {}
		},
		h('h2', { class: 'dialog__title' }, showEmoji ? showEmoji + ' ' + title : title),
		h('div', {}, body),
		h(
			'div',
			{ class: 'dialog__actions' },
			...actions.map((a) =>
				h(
					'button',
					{
						type: 'button',
						class:
							'btn ' + (a.primary ? 'btn--filled' : a.danger ? 'btn--danger' : 'btn--outlined'),
						onclick: () => {
							const keep = a.run && a.run();
							if (!keep) close();
						}
					},
					a.label
				)
			)
		)
	);

	const prevFocus = document.activeElement;
	document.body.appendChild(scrim);
	document.body.appendChild(el);
	const untrap = trapFocus(el);
	const onKey = (e) => {
		if (e.key === 'Escape') close();
	};
	document.addEventListener('keydown', onKey);
	setTimeout(() => (el.querySelector('input, button, [tabindex]') || el).focus(), 0);

	function close() {
		document.removeEventListener('keydown', onKey);
		untrap();
		el.remove();
		scrim.remove();
		if (prevFocus && prevFocus.focus) prevFocus.focus();
		if (onClose) onClose();
	}
	return { close, el };
}

// ---------- menu (with its own filter + regex builder) ----------

/**
 * @param anchor   element the menu attaches to
 * @param items    [{ label, hint, key, icon, danger, run, sub }]
 */
export function menu(anchor, items, opts = {}) {
	const list = h('div', {
		role: 'menu',
		style: { display: 'flex', flexDirection: 'column', gap: '2px' }
	});
	const count = h('div', { class: 'sr-only', 'aria-live': 'polite' });

	const field = searchField({
		placeholder: opts.filterPlaceholder || 'Filter these items…',
		label: 'Filter menu items',
		sampleFrom: () => items.map((i) => i.label)
	});

	function render() {
		const m = field.matcher();
		list.replaceChildren();
		const shown = items.filter((it) => it.separator || m.test(it.label + ' ' + (it.hint || '')));
		const real = shown.filter((s) => !s.separator);
		if (!real.length) {
			list.appendChild(
				h(
					'div',
					{ class: 'menu__empty' },
					m.ok ? i18n.t('empty.noMatch') : 'That pattern is not valid yet.'
				)
			);
		} else {
			for (const it of shown) {
				if (it.separator) {
					list.appendChild(h('hr', { style: { margin: '4px 0' } }));
					continue;
				}
				list.appendChild(
					h(
						'button',
						{
							type: 'button',
							class: 'menu__item',
							role: 'menuitem',
							dataset: it.danger ? { danger: 'true' } : {},
							onclick: () => {
								handle.close();
								it.run && it.run();
							}
						},
						it.icon ? icon(it.icon, 'icon icon--sm') : h('span', { style: { width: '17px' } }),
						h('span', { style: { flex: '1' } }, it.label),
						it.key ? h('span', { class: 'menu__key' }, it.key) : null
					)
				);
			}
		}
		count.textContent =
			real.length + ' of ' + items.filter((i) => !i.separator).length + ' items shown';
		handle && handle.reposition && handle.reposition();
	}

	field.onChange(render);

	const body = h(
		'div',
		{ class: 'menu', style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
		field.el,
		count,
		list
	);

	// Arrow keys walk what survived the filter; Enter activates; Escape clears
	// the filter first and closes only when it is already empty.
	body.addEventListener('keydown', (e) => {
		const btns = [...list.querySelectorAll('.menu__item')];
		if (!btns.length) return;
		const i = btns.indexOf(document.activeElement);
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			btns[(i + 1 + btns.length) % btns.length].focus();
		}
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			btns[(i - 1 + btns.length) % btns.length].focus();
		}
	});

	const handle = popover(anchor, body, {
		width: opts.width || 300,
		role: 'menu',
		label: opts.label || 'Menu'
	});
	render();
	setTimeout(() => field.focus(), 0);
	return handle;
}

// ---------- select ----------

/** A select whose popup carries a filter field and its regex builder. */
export function select({ value, options, onChange, label, width = 220 }) {
	const btn = h(
		'button',
		{
			type: 'button',
			class: 'btn btn--outlined',
			'aria-haspopup': 'listbox',
			'aria-label': label,
			style: { width: width + 'px', justifyContent: 'space-between' }
		},
		h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, labelFor(value)),
		icon('arrow', 'icon icon--sm')
	);

	function labelFor(v) {
		const o = options.find((x) => (x.value ?? x) === v);
		return o ? (o.label ?? o) : String(v);
	}

	btn.addEventListener('click', () => {
		menu(
			btn,
			options.map((o) => ({
				label: o.label ?? o,
				hint: (o.value ?? o) === value ? 'current' : '',
				icon: (o.value ?? o) === value ? 'check' : undefined,
				run: () => {
					const v = o.value ?? o;
					btn.firstChild.textContent = labelFor(v);
					onChange(v);
				}
			})),
			{ width, label, filterPlaceholder: 'Filter options…' }
		);
	});

	return {
		el: btn,
		set(v) {
			btn.firstChild.textContent = labelFor(v);
		}
	};
}

// ---------- switch ----------

export function toggle({ checked, onChange, label }) {
	const el = h('button', {
		type: 'button',
		class: 'switch',
		role: 'switch',
		'aria-checked': String(!!checked),
		'aria-label': label,
		onclick: () => {
			const next = el.getAttribute('aria-checked') !== 'true';
			el.setAttribute('aria-checked', String(next));
			onChange(next);
		}
	});
	return {
		el,
		set(v) {
			el.setAttribute('aria-checked', String(!!v));
		}
	};
}

// ---------- destructive-action super confirmation ----------

/**
 * Two independently operated keys, then a full-range slider. Nothing happens
 * until all three are satisfied, and an emergency exit is always available.
 */
export function superConfirm({ what, affects, onConfirm }) {
	let keyA = false;
	let keyB = false;

	const phrase = h('input', {
		type: 'text',
		placeholder: 'DELETE',
		'aria-label': i18n.t('confirm.type'),
		class: 'mono',
		style: { flex: '1', border: '0', background: 'transparent', outline: 'none' },
		oninput: (e) => {
			keyA = e.target.value.trim().toUpperCase() === 'DELETE';
			sync();
		}
	});

	const holdBtn = h(
		'button',
		{
			type: 'button',
			class: 'btn btn--outlined',
			'aria-pressed': 'false',
			onclick: () => {
				keyB = !keyB;
				holdBtn.setAttribute('aria-pressed', String(keyB));
				sync();
			}
		},
		icon('lock', 'icon icon--sm'),
		i18n.t('confirm.hold')
	);

	const slider = h('input', {
		type: 'range',
		min: '0',
		max: '100',
		value: '0',
		class: 'slider',
		disabled: true,
		'aria-label': i18n.t('confirm.slide'),
		oninput: () => {
			fill.style.width = slider.value + '%';
		},
		onchange: () => {
			if (Number(slider.value) >= 100 && keyA && keyB) {
				done.textContent = 'Confirmed.';
				setTimeout(() => {
					d.close();
					onConfirm();
				}, 260);
			} else if (Number(slider.value) < 100) {
				slider.value = '0';
				fill.style.width = '0%';
			}
		}
	});

	const fill = h('div', {
		style: {
			height: '6px',
			width: '0%',
			background: 'var(--err)',
			borderRadius: '3px',
			transition: 'width .08s linear'
		}
	});
	const track = h(
		'div',
		{
			style: {
				height: '6px',
				background: 'var(--schighest)',
				borderRadius: '3px',
				marginTop: '-13px',
				pointerEvents: 'none'
			}
		},
		fill
	);
	const done = h('div', {
		style: { fontSize: '.78rem', color: 'var(--ok)', minHeight: '18px', fontWeight: '600' }
	});
	const gate = h('div', { style: { fontSize: '.76rem', color: 'var(--onsv)' } });

	function sync() {
		const ready = keyA && keyB;
		slider.disabled = !ready;
		gate.textContent = ready
			? 'Both keys are set. Slide all the way right to confirm.'
			: 'Key 1: type DELETE — ' +
				(keyA ? 'set' : 'not set') +
				'. Key 2: hold — ' +
				(keyB ? 'set' : 'not set') +
				'.';
		if (!ready) {
			slider.value = '0';
			fill.style.width = '0%';
		}
	}

	const d = dialog({
		title: what,
		emoji: '🗑️',
		body: h(
			'div',
			{ class: 'stack', style: { gap: '16px' } },
			h(
				'div',
				{ class: 'notice' },
				icon('warn'),
				h(
					'div',
					{},
					h(
						'div',
						{ style: { fontWeight: '700', marginBottom: '4px' } },
						'This cannot be undone from here.'
					),
					h('div', { style: { fontSize: '.85rem', lineHeight: '1.55' } }, affects)
				)
			),
			h(
				'div',
				{ class: 'stack', style: { gap: '8px' } },
				h('div', { style: { fontSize: '.82rem', fontWeight: '600' } }, i18n.t('confirm.type')),
				h('div', { class: 'field' }, phrase)
			),
			holdBtn,
			h(
				'div',
				{ class: 'stack', style: { gap: '4px' } },
				h('div', { style: { fontSize: '.82rem', fontWeight: '600' } }, i18n.t('confirm.slide')),
				slider,
				track
			),
			gate,
			done
		),
		actions: [{ label: i18n.t('confirm.exit'), run: () => {} }]
	});

	sync();
	return d;
}

// ---------- small helpers ----------

export function copyToClipboard(text, what = 'Copied') {
	navigator.clipboard?.writeText(text).then(
		() => notify(what, { kind: 'ok' }),
		() => notify('This browser refused clipboard access, so nothing was copied.', { kind: 'error' })
	);
}

export function downloadFile(filename, text, mime = 'text/plain') {
	const blob = new Blob([text], { type: mime + ';charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const a = h('a', { href: url, download: filename });
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export { fmtTime };
