// The colour control.
//
// The contract is specific about what this may not be: a swatch-only chooser.
// A palette of twelve squares is not a colour picker, it is a menu of twelve
// colours. So the primary control here is a continuous field plus numeric entry
// in every notation the translator speaks, and swatches are a convenience laid
// on top rather than a replacement for it.
//
// Two consequences that are easy to skip and are not skipped:
//
//   - The field is operable from the keyboard. A drag-only spectrum is a
//     spectrum only a mouse can reach.
//   - An out-of-gamut value warns BEFORE it is applied. Silently clamping is
//     how a picker ends up showing a colour nobody asked for and reporting the
//     one they typed.

import { h, add, clear } from '../../docs/assets/js/dom.js';
import * as colour from '../../docs/assets/js/colour.js';
import * as ui from '../../docs/assets/js/ui.js';

const NOTATIONS = [
	'hex',
	'hex8',
	'rgb',
	'hsl',
	'hsv',
	'hwb',
	'lab',
	'lch',
	'oklab',
	'oklch',
	'cmyk'
];

/**
 * @param value       any notation the translator reads
 * @param onChange    called with { css, rgb, alpha } on every committed change
 * @param background  what the colour is judged against for contrast
 * @param withAlpha   false hides the alpha track for properties that cannot use it
 */
export function colourPicker({
	value = '#6750A4',
	onChange,
	background = [1, 1, 1],
	withAlpha = true
} = {}) {
	let hsv;
	let alpha;
	let notation = 'hex';

	try {
		const start = colour.parse(value);
		hsv = colour.rgbToHsv(colour.clip(start.rgb));
		alpha = start.alpha;
		notation = start.space === 'named' ? 'hex' : start.space;
	} catch {
		hsv = colour.rgbToHsv([0.404, 0.314, 0.643]);
		alpha = 1;
	}
	if (!NOTATIONS.includes(notation)) notation = 'hex';

	const rgb = () => colour.hsvToRgb(hsv);

	// ---------- the two-dimensional field ----------

	const cursor = h('div', { class: 'cp__cursor' });
	const field = h(
		'div',
		{
			class: 'cp__field',
			tabindex: '0',
			role: 'application',
			'aria-label': 'Saturation and brightness. Arrow keys adjust; hold Shift for larger steps.'
		},
		cursor
	);

	function setFromField(clientX, clientY) {
		const box = field.getBoundingClientRect();
		hsv[1] = Math.max(0, Math.min(100, ((clientX - box.left) / box.width) * 100));
		hsv[2] = Math.max(0, Math.min(100, 100 - ((clientY - box.top) / box.height) * 100));
		paint();
	}

	let dragging = false;
	field.addEventListener('pointerdown', (e) => {
		dragging = true;
		field.setPointerCapture(e.pointerId);
		field.focus();
		setFromField(e.clientX, e.clientY);
	});
	field.addEventListener('pointermove', (e) => {
		if (dragging) setFromField(e.clientX, e.clientY);
	});
	field.addEventListener('pointerup', (e) => {
		dragging = false;
		if (field.hasPointerCapture(e.pointerId)) field.releasePointerCapture(e.pointerId);
	});
	field.addEventListener('keydown', (e) => {
		const step = e.shiftKey ? 10 : 1;
		const moves = {
			ArrowLeft: () => (hsv[1] -= step),
			ArrowRight: () => (hsv[1] += step),
			ArrowUp: () => (hsv[2] += step),
			ArrowDown: () => (hsv[2] -= step),
			Home: () => (hsv[1] = 0),
			End: () => (hsv[1] = 100),
			PageUp: () => (hsv[2] = 100),
			PageDown: () => (hsv[2] = 0)
		};
		if (!moves[e.key]) return;
		e.preventDefault();
		moves[e.key]();
		hsv[1] = Math.max(0, Math.min(100, hsv[1]));
		hsv[2] = Math.max(0, Math.min(100, hsv[2]));
		paint();
	});

	// ---------- hue and alpha tracks ----------

	function track({ label, className, max, get, set, format }) {
		const thumb = h('div', { class: 'cp__thumb' });
		const el = h(
			'div',
			{
				class: 'cp__track ' + className,
				tabindex: '0',
				role: 'slider',
				'aria-label': label,
				'aria-valuemin': '0',
				'aria-valuemax': String(max)
			},
			thumb
		);

		function fromPointer(clientX) {
			const box = el.getBoundingClientRect();
			set(Math.max(0, Math.min(max, ((clientX - box.left) / box.width) * max)));
			paint();
		}
		let held = false;
		el.addEventListener('pointerdown', (e) => {
			held = true;
			el.setPointerCapture(e.pointerId);
			el.focus();
			fromPointer(e.clientX);
		});
		el.addEventListener('pointermove', (e) => {
			if (held) fromPointer(e.clientX);
		});
		el.addEventListener('pointerup', (e) => {
			held = false;
			if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
		});
		el.addEventListener('keydown', (e) => {
			const step = (e.shiftKey ? 10 : 1) * (max / 360 > 0.5 ? 1 : max / 100);
			const moves = {
				ArrowLeft: () => get() - step,
				ArrowDown: () => get() - step,
				ArrowRight: () => get() + step,
				ArrowUp: () => get() + step,
				Home: () => 0,
				End: () => max
			};
			if (!moves[e.key]) return;
			e.preventDefault();
			set(Math.max(0, Math.min(max, moves[e.key]())));
			paint();
		});

		return {
			el,
			update() {
				const v = get();
				thumb.style.left = (v / max) * 100 + '%';
				el.setAttribute('aria-valuenow', String(Math.round(v * 100) / 100));
				el.setAttribute('aria-valuetext', format(v));
			}
		};
	}

	const hueTrack = track({
		label: 'Hue',
		className: 'cp__track--hue',
		max: 360,
		get: () => hsv[0],
		set: (v) => (hsv[0] = v),
		format: (v) => Math.round(v) + ' degrees'
	});

	const alphaTrack = track({
		label: 'Opacity',
		className: 'cp__track--alpha',
		max: 1,
		get: () => alpha,
		set: (v) => (alpha = v),
		format: (v) => Math.round(v * 100) + '%'
	});

	// ---------- numeric entry ----------

	const entry = h('input', {
		type: 'text',
		class: 'mono',
		spellcheck: 'false',
		'aria-label': 'Colour value. Type any notation.'
	});
	const entryErr = h('div', { class: 'cp__err', role: 'status' });

	const notationSel = ui.select({
		value: notation,
		width: 128,
		label: 'Notation',
		options: NOTATIONS.map((n) => ({ value: n, label: n.toUpperCase() })),
		onChange: (v) => {
			notation = v;
			paint();
		}
	});

	function commitEntry() {
		const text = entry.value.trim();
		if (!text) return;
		let read;
		try {
			read = colour.parse(text);
		} catch (e) {
			entryErr.textContent = e.message;
			return;
		}
		entryErr.textContent = '';
		if (!colour.inGamut(read.rgb)) {
			// Stated before it lands, not after. The value is still accepted — it is
			// the user's colour — but they are told what the screen will actually do
			// with it rather than discovering the difference later.
			entryErr.textContent =
				'Outside what sRGB can show, by ' +
				Math.round(colour.overshoot(read.rgb) * 100) +
				'%. It will be applied as the nearest colour this display can produce.';
		}
		hsv = colour.rgbToHsv(colour.clip(read.rgb));
		alpha = read.alpha;
		if (NOTATIONS.includes(read.space)) {
			notation = read.space;
			notationSel.set(notation);
		}
		paint();
	}
	entry.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			commitEntry();
		}
	});
	entry.addEventListener('blur', commitEntry);

	// ---------- readouts ----------

	const swatch = h('div', { class: 'cp__swatch' });
	const allFormats = h('div', { class: 'cp__all' });
	const contrastRow = h('div', { class: 'cp__meta' });

	function paintFormats(f) {
		clear(allFormats);
		for (const key of NOTATIONS) {
			const text = f[key];
			add(
				allFormats,
				h(
					'button',
					{
						type: 'button',
						class: 'cp__fmt',
						title: 'Copy ' + key.toUpperCase(),
						onclick: () => ui.copyToClipboard(text, key.toUpperCase() + ' copied.')
					},
					h('span', { class: 'cp__fmt-key' }, key),
					h('span', { class: 'cp__fmt-val mono' }, text)
				)
			);
		}
		if (f.named) {
			add(
				allFormats,
				h(
					'button',
					{
						type: 'button',
						class: 'cp__fmt',
						onclick: () => ui.copyToClipboard(f.named, 'Name copied.')
					},
					h('span', { class: 'cp__fmt-key' }, 'name'),
					h('span', { class: 'cp__fmt-val mono' }, f.named)
				)
			);
		}
	}

	let quiet = false;
	function paint() {
		const c = rgb();
		const f = colour.formats(c, alpha);

		field.style.background =
			'linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ' +
			colour.css(colour.hsvToRgb([hsv[0], 100, 100])) +
			')';
		cursor.style.left = hsv[1] + '%';
		cursor.style.bottom = hsv[2] + '%';
		cursor.style.background = f.hex;

		alphaTrack.el.style.background =
			'linear-gradient(to right, transparent, ' + f.hex + '), var(--checker)';

		hueTrack.update();
		alphaTrack.update();

		swatch.style.background = f.hex;
		swatch.style.opacity = String(alpha);
		if (!quiet && document.activeElement !== entry) entry.value = f[notation] || f.hex;
		paintFormats(f);

		const ratio = colour.contrast(c, background);
		clear(contrastRow);
		add(
			contrastRow,
			h('span', {}, 'Contrast ' + ratio.toFixed(2) + ':1'),
			h(
				'span',
				{ class: 'cp__grade cp__grade--' + (ratio >= 4.5 ? 'ok' : ratio >= 3 ? 'warn' : 'bad') },
				colour.grade(ratio)
			),
			h('span', { class: 'muted' }, 'against the background this element sits on')
		);

		if (onChange) onChange({ css: colour.css(c, alpha), rgb: c, alpha, formats: f });
	}

	const el = h(
		'div',
		{ class: 'cp' },
		field,
		h(
			'div',
			{ class: 'cp__rows' },
			h('div', { class: 'cp__row' }, swatch, hueTrack.el),
			withAlpha
				? h('div', { class: 'cp__row' }, h('div', { class: 'cp__spacer' }), alphaTrack.el)
				: null
		),
		h(
			'div',
			{ class: 'cp__entry' },
			notationSel.el,
			h('div', { class: 'field cp__entry-field' }, entry)
		),
		entryErr,
		contrastRow,
		h(
			'details',
			{ class: 'cp__details' },
			h('summary', {}, 'Every notation'),
			allFormats,
			h(
				'p',
				{ class: 'muted cp__note' },
				'CMYK here is the plain device conversion with no colour profile involved, so it is a reading rather than a print-accurate value. Lab and LCH are D50-referred, as CSS specifies.'
			)
		)
	);

	paint();

	return {
		el,
		get: () => ({ css: colour.css(rgb(), alpha), rgb: rgb(), alpha }),
		set(next) {
			const read = colour.parse(next);
			hsv = colour.rgbToHsv(colour.clip(read.rgb));
			alpha = read.alpha;
			paint();
		},
		setBackground(next) {
			background = next;
			quiet = true;
			paint();
			quiet = false;
		}
	};
}
