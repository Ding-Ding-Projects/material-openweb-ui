// The application's settings surface.
//
// Two rules shape every row here.
//
// Provenance: each row says whether the value is yours or names the real
// shipped default. "Default" on its own tells a reader nothing they can act on.
//
// School mode omits rather than disables. A greyed-out control still names the
// thing it is hiding, which defeats the point — so while the mode is on, the
// playful rows are not rendered at all.

import { h, icon, clear, add, bytes as fmtBytes } from '../../../docs/assets/js/dom.js';
import * as ui from '../../../docs/assets/js/ui.js';
import * as state from '../state.js';
import * as i18n from '../i18n.js';
import * as vocab from '../core/vocabulary.js';
import * as narrator from '../core/narrator.js';
import * as ollama from '../core/ollama.js';
import * as logoUi from '../logo-ui.js';
import * as scheduleUi from '../schedule-ui.js';

const DEFAULTS = {
	theme: 'system',
	language: 'English',
	funnyEn: 2,
	funnyZh: 2,
	emojiDialogs: false,
	ollamaHost: 'http://127.0.0.1:11434'
};

function provenance(key, format) {
	const written = state.get('settingsWritten') || [];
	if (written.includes(key)) return i18n.t('set.provUser');
	const d = DEFAULTS[key];
	const shown = format
		? format(d)
		: typeof d === 'boolean'
			? d
				? 'on'
				: 'off'
			: String(d === '' ? '(none)' : d);
	return i18n.t('set.provDefault') + shown;
}

function markWritten(key) {
	const written = new Set(state.get('settingsWritten') || []);
	written.add(key);
	state.set('settingsWritten', [...written]);
}

function row({ id, label, why, control, prov }) {
	return h(
		'div',
		{ class: 'setting', id: id },
		h(
			'div',
			{ class: 'setting__main' },
			h('div', { class: 'setting__label' }, label),
			i18n.isBilingual() && i18n.t2(id)
				? h('div', { class: 'cjk muted', style: { fontSize: '.78rem' } }, i18n.t2(id))
				: null,
			prov ? h('div', { class: 'setting__prov' }, prov) : null,
			h(
				'details',
				{ class: 'setting__why' },
				h('summary', {}, 'What does this do?'),
				h('p', {}, why)
			)
		),
		h('div', { class: 'setting__control' }, control)
	);
}

export function render(root) {
	const page = h('div', { class: 'page' });
	const school = state.get('settings').school || { on: false, name: 'School mode', pin: '' };
	const rows = h('div', { class: 'card' });

	const set = (patch, key, label) => {
		state.patchSettings(patch);
		if (key) markWritten(key);
		state.log('Setting changed', label);
		window.mowuiApp.refresh();
	};

	// ---------- general ----------

	if (!i18n.isPlayfulHidden('language')) {
		const sel = ui.select({
			value: state.get('settings').language,
			width: 200,
			label: i18n.t('set.language'),
			options: i18n.LANGUAGES.map((l) => ({ value: l, label: l })),
			onChange: (v) => set({ language: v }, 'language', 'Language mode → ' + v)
		});
		add(
			rows,
			row({
				id: 'set.language',
				label: i18n.t('set.language'),
				why: i18n.t('set.languageWhy'),
				control: sel.el,
				prov: provenance('language')
			})
		);
	}

	for (const [key, labelKey] of [
		['funnyEn', 'set.funnyEn'],
		['funnyZh', 'set.funnyZh']
	]) {
		if (i18n.isPlayfulHidden(key)) continue;
		const out = h(
			'span',
			{ class: 'mono muted', style: { fontSize: '.74rem', minWidth: '120px', textAlign: 'right' } },
			i18n.levelLabel(state.get('settings')[key])
		);
		const input = h('input', {
			type: 'range',
			class: 'slider',
			min: '1',
			max: '5',
			step: '1',
			value: String(state.get('settings')[key]),
			'aria-label': i18n.t(labelKey),
			style: { width: '140px' },
			oninput: (e) => {
				out.textContent = i18n.levelLabel(Number(e.target.value));
			},
			onchange: (e) =>
				set({ [key]: Number(e.target.value) }, key, i18n.t(labelKey) + ' → ' + e.target.value)
		});
		add(
			rows,
			row({
				id: labelKey,
				label: i18n.t(labelKey),
				why: i18n.t('set.funnyWhy'),
				control: h('div', { class: 'row', style: { gap: '10px' } }, input, out),
				prov: provenance(key, i18n.levelLabel)
			})
		);
	}

	if (!i18n.isPlayfulHidden('emojiDialogs')) {
		const tg = ui.toggle({
			checked: !!state.get('settings').emojiDialogs,
			label: i18n.t('set.emoji'),
			onChange: (v) =>
				set({ emojiDialogs: v }, 'emojiDialogs', 'Emoji in dialogs → ' + (v ? 'on' : 'off'))
		});
		add(
			rows,
			row({
				id: 'set.emoji',
				label: i18n.t('set.emoji'),
				why: i18n.t('set.emojiWhy'),
				control: tg.el,
				prov: provenance('emojiDialogs')
			})
		);
	}

	const themeSel = ui.select({
		value: state.get('settings').theme,
		width: 200,
		label: i18n.t('set.theme'),
		options: [
			{ value: 'system', label: 'Follow this device' },
			{ value: 'light', label: 'Light' },
			{ value: 'dark', label: 'Dark' }
		],
		onChange: (v) => set({ theme: v }, 'theme', 'Theme → ' + v)
	});
	add(
		rows,
		row({
			id: 'set.theme',
			label: i18n.t('set.theme'),
			why: i18n.t('set.themeWhy'),
			control: themeSel.el,
			prov: provenance('theme')
		})
	);

	const hostInput = h('input', {
		type: 'text',
		class: 'mono',
		value: state.get('settings').ollamaHost,
		'aria-label': i18n.t('set.host'),
		onchange: (e) => {
			const v = e.target.value.trim() || ollama.DEFAULT_HOST;
			set({ ollamaHost: v }, 'ollamaHost', 'Ollama host → ' + v);
			ui.notify('Ollama host set to ' + v + '. Open the Ollama page to re-check the daemon.', {
				kind: 'ok'
			});
		}
	});
	add(
		rows,
		row({
			id: 'set.host',
			label: i18n.t('set.host'),
			why: i18n.t('set.hostWhy'),
			control: h('div', { class: 'field', style: { width: '280px' } }, hostInput),
			prov: provenance('ollamaHost')
		})
	);

	// ---------- narrator ----------

	const narratorBox = h('div', { class: 'card', style: { marginTop: '20px' } });
	renderNarrator(narratorBox, set);

	// ---------- vocabulary ----------

	const vocabBox = i18n.isPlayfulHidden('vocab')
		? null
		: h('div', { class: 'card', style: { marginTop: '20px' } });
	if (vocabBox) renderVocabulary(vocabBox);

	// ---------- school mode ----------

	const schoolBox = h('div', { class: 'card', style: { marginTop: '20px' } });
	renderSchool(schoolBox, school);

	const logoBox = h('div', { class: 'card', style: { marginTop: '20px' } });
	logoUi.render(logoBox, () => window.mowuiApp.refresh());

	const scheduleBox = h('div', { class: 'card', style: { marginTop: '20px' } });
	scheduleUi.render(scheduleBox, () => window.mowuiApp.refresh());

	add(
		page,
		h(
			'div',
			{ class: 'page__head' },
			h(
				'div',
				{ style: { flex: '1' } },
				h('div', { class: 'page__title' }, i18n.t('set.title')),
				h('div', { class: 'page__sub' }, i18n.t('set.sub'))
			)
		),
		// The disclosure names the funny level, so under School mode it is omitted
		// along with the control. A banner explaining a hidden feature is the same
		// leak as a greyed-out control that names it.
		i18n.isPlayfulHidden('funnyEn')
			? null
			: h(
					'div',
					{ class: 'state state--info', style: { marginBottom: '18px' } },
					icon('info'),
					h(
						'div',
						{ class: 'state__body' },
						h('div', { class: 'state__title' }, 'About the funny level'),
						h('p', { class: 'state__text' }, i18n.FUNNY_DISCLOSURE.en),
						h(
							'p',
							{ class: 'state__text cjk', style: { marginTop: '6px', opacity: '.85' } },
							i18n.FUNNY_DISCLOSURE.zh
						)
					)
				),
		rows,
		narratorBox
	);
	add(page, vocabBox, logoBox, scheduleBox, schoolBox);
	root.append(page);
}

// ---------------------------------------------------------------- narrator

function renderNarrator(box, set) {
	clear(box);
	const n = state.get('settings').narrator || {
		on: false,
		voiceEn: '',
		voiceZh: '',
		rate: 1,
		pitch: 1
	};

	const status = h('div', {
		class: 'muted',
		style: { fontSize: '.78rem', lineHeight: '1.6', marginTop: '10px' }
	});

	const toggle = ui.toggle({
		checked: !!n.on,
		label: 'Spoken narrator',
		onChange: (v) => {
			state.patchSettings({ narrator: { ...n, on: v } });
			state.log('Setting changed', 'Narrator → ' + (v ? 'on' : 'off'));
			window.mowuiApp.refresh();
		}
	});

	const pickers = h('div', { class: 'stack', style: { gap: '10px' } });

	function paintPickers() {
		clear(pickers);
		const voices = narrator.voices();

		if (!narrator.supported()) {
			add(
				pickers,
				h(
					'div',
					{ class: 'muted', style: { fontSize: '.8rem' } },
					'This runtime provides no speech synthesis at all, so there is nothing to choose from and the narrator cannot speak here.'
				)
			);
			return;
		}

		// School mode covers every Cantonese capability, so the Cantonese picker is
		// omitted with the rest rather than left sitting there naming a language the
		// mode is supposed to have made absent.
		const langs = i18n.isPlayfulHidden('language')
			? [['voiceEn', 'Voice', 'en']]
			: [
					['voiceEn', 'English voice', 'en'],
					['voiceZh', 'Cantonese voice', 'zh']
				];

		for (const [key, langLabel, tag] of langs) {
			const forLang = narrator.voicesFor(tag);
			const current = (state.get('settings').narrator || {})[key] || '';
			// "Choose automatically" is the shipped default. Nothing ships naming a
			// voice, because the application cannot know what is installed until it
			// asks, and naming one is a preference for a voice most machines lack.
			const options = [
				{ value: '', label: 'Choose automatically' },
				...forLang.map((v) => ({ value: v.voiceURI, label: v.name + ' — ' + v.lang }))
			];

			const sel = ui.select({
				value: current,
				width: 280,
				label: langLabel,
				options,
				onChange: (v) => {
					const cur = state.get('settings').narrator || {};
					state.patchSettings({ narrator: { ...cur, [key]: v } });
					state.log('Setting changed', langLabel + ' → ' + (v || 'automatic'));
					renderNarrator(box, set);
				}
			});

			add(
				pickers,
				h(
					'div',
					{ class: 'row', style: { gap: '14px', flexWrap: 'wrap' } },
					h(
						'div',
						{ style: { minWidth: '150px', fontSize: '.85rem', fontWeight: '600' } },
						langLabel
					),
					sel.el,
					h(
						'button',
						{
							class: 'btn btn--outlined',
							onclick: () => narrator.test(tag)
						},
						'Test'
					)
				)
			);

			// Say what is actually in effect, which is the thing a select box
			// silently implies and gets wrong.
			const chosen = forLang.find((v) => v.voiceURI === current);
			if (current && !chosen) {
				add(
					pickers,
					h(
						'div',
						{ class: 'muted', style: { fontSize: '.75rem', color: 'var(--err)' } },
						'The chosen ' +
							langLabel.toLowerCase() +
							' is not installed on this computer. The choice is being kept rather than reset, and the narrator falls back to an automatic pick until it returns.'
					)
				);
			} else if (!forLang.length) {
				add(
					pickers,
					h(
						'div',
						{ class: 'muted', style: { fontSize: '.75rem' } },
						'No voice on this machine can read ' +
							(tag === 'zh' ? 'Cantonese' : 'English') +
							'. Installing one in the operating system makes it appear here.'
					)
				);
			}
		}

		status.textContent = voices.length
			? voices.length + ' voice(s) are installed on this machine.'
			: 'The platform reported no voices yet. Enumeration commonly returns nothing on the first call and fills in a moment later, so this list is re-read rather than trusted once.';
	}

	const rate = h('input', {
		type: 'range',
		class: 'slider',
		min: '0.5',
		max: '2',
		step: '0.1',
		value: String(n.rate ?? 1),
		'aria-label': 'Speech rate',
		style: { width: '140px' },
		onchange: (e) => {
			const cur = state.get('settings').narrator || {};
			state.patchSettings({ narrator: { ...cur, rate: Number(e.target.value) } });
			state.log('Setting changed', 'Narrator rate → ' + e.target.value);
		}
	});
	const pitch = h('input', {
		type: 'range',
		class: 'slider',
		min: '0',
		max: '2',
		step: '0.1',
		value: String(n.pitch ?? 1),
		'aria-label': 'Speech pitch',
		style: { width: '140px' },
		onchange: (e) => {
			const cur = state.get('settings').narrator || {};
			state.patchSettings({ narrator: { ...cur, pitch: Number(e.target.value) } });
			state.log('Setting changed', 'Narrator pitch → ' + e.target.value);
		}
	});

	add(
		box,
		h(
			'div',
			{ class: 'row', style: { gap: '12px', marginBottom: '6px' } },
			icon('bell'),
			h('strong', { style: { flex: '1' } }, 'Spoken narrator'),
			toggle.el
		),
		h(
			'p',
			{ class: 'muted', style: { fontSize: '.84rem', lineHeight: '1.6' } },
			i18n.isPlayfulHidden('language')
				? 'Off by default. It reads application events aloud, in the voice chosen below.'
				: 'Off by default. It reads application events aloud. Each language gets its own voice, because choosing an English voice says nothing about which Cantonese voice should read the other half of a bilingual line.'
		),
		n.on ? pickers : null,
		n.on
			? h(
					'div',
					{ class: 'row', style: { gap: '20px', flexWrap: 'wrap', marginTop: '6px' } },
					h(
						'div',
						{ class: 'row', style: { gap: '10px' } },
						h('span', { style: { fontSize: '.82rem' } }, 'Rate'),
						rate
					),
					h(
						'div',
						{ class: 'row', style: { gap: '10px' } },
						h('span', { style: { fontSize: '.82rem' } }, 'Pitch'),
						pitch
					)
				)
			: null,
		status
	);

	if (n.on) {
		paintPickers();
		// The list arrives late on most platforms. Subscribing and re-reading is
		// the difference between a working picker and one that reports "no voices
		// installed" on a machine with forty.
		narrator.onVoicesChanged(paintPickers);
	} else {
		status.textContent =
			'The narrator is off, so nothing is spoken. Turning it on reveals a voice picker for each language.';
	}
}

// ---------------------------------------------------------------- vocabulary

function renderVocabulary(box) {
	clear(box);
	const loaded = state.get('vocabulary');

	const input = h('input', {
		type: 'file',
		accept: 'application/json,.json',
		style: { display: 'none' },
		onchange: async (e) => {
			const file = e.target.files?.[0];
			if (!file) return;
			const result = await vocab.load(file);
			if (!result.ok) {
				ui.notify('That file was rejected and nothing changed: ' + result.error, {
					kind: 'error',
					persist: true
				});
			} else {
				state.set('vocabulary', result.value);
				state.log('Vocabulary loaded', result.value.terms.length + ' term(s)');
				ui.notify(
					'Loaded ' +
						result.value.terms.length +
						' term(s). Nothing about the file left this machine.',
					{ kind: 'ok' }
				);
			}
			renderVocabulary(box);
			e.target.value = '';
		}
	});

	add(
		box,
		h(
			'div',
			{ class: 'row', style: { gap: '12px', marginBottom: '6px' } },
			icon('file'),
			h('strong', { style: { flex: '1' } }, 'Personal vocabulary'),
			h(
				'button',
				{ class: 'btn btn--outlined', onclick: () => input.click() },
				loaded ? 'Replace' : 'Choose a file'
			),
			loaded
				? h(
						'button',
						{
							class: 'btn btn--text',
							style: { color: 'var(--err)' },
							onclick: () => {
								state.set('vocabulary', null);
								state.log('Vocabulary cleared', '');
								ui.notify('Cleared. The original wording is back immediately.', { kind: 'ok' });
								renderVocabulary(box);
							}
						},
						'Clear'
					)
				: null
		),
		input,
		h(
			'p',
			{ class: 'muted', style: { fontSize: '.84rem', lineHeight: '1.6' } },
			"A local JSON file of word replacements applied to this application's own copy. The whole payload is validated before anything is displayed or cached, it never reaches the network, and it is excluded from every export."
		),
		loaded
			? h(
					'div',
					{ class: 'state state--ok', style: { marginTop: '10px' } },
					icon('check'),
					h(
						'div',
						{ class: 'state__body' },
						h('div', { class: 'state__title' }, loaded.terms.length + ' term(s) loaded'),
						h(
							'div',
							{ class: 'state__text' },
							'Schema version ' +
								loaded.version +
								'. Replacements apply to rendered copy only — commands, addresses, identifiers and file paths are never rewritten.'
						)
					)
				)
			: h(
					'div',
					{ class: 'state state--info', style: { marginTop: '10px' } },
					icon('info'),
					h(
						'div',
						{ class: 'state__body' },
						h('div', { class: 'state__title' }, 'No file loaded'),
						h(
							'div',
							{ class: 'state__text' },
							'Every surface renders its original shipped wording. This control is present before a file exists on purpose — it is not permission to ship built-in mappings, samples or guesses.'
						)
					)
				),
		h(
			'details',
			{ style: { marginTop: '12px' } },
			h(
				'summary',
				{ style: { cursor: 'pointer', fontSize: '.8rem', color: 'var(--p)' } },
				'What the file has to look like'
			),
			h('pre', { style: { marginTop: '10px' } }, vocab.EXAMPLE),
			h(
				'p',
				{ class: 'muted', style: { fontSize: '.78rem', marginTop: '8px', lineHeight: '1.6' } },
				vocab.LIMITS_TEXT
			)
		)
	);
}

// ---------------------------------------------------------------- school mode

function renderSchool(box, school) {
	clear(box);

	const nameInput = h('input', {
		type: 'text',
		value: school.name || 'School mode',
		'aria-label': 'What this mode is called',
		onchange: (e) => {
			const name = e.target.value.trim() || 'School mode';
			state.patchSettings({ school: { ...school, name } });
			state.log('Setting changed', 'Mode renamed → ' + name);
			window.mowuiApp.refresh();
		}
	});

	function turnOn() {
		const pin = h('input', {
			type: 'password',
			inputmode: 'numeric',
			placeholder: '4 or more digits',
			'aria-label': 'PIN'
		});
		const err = h('div', { style: { color: 'var(--err)', fontSize: '.8rem', minHeight: '18px' } });
		ui.dialog({
			title: 'Turn on ' + (school.name || 'School mode'),
			emoji: '🎒',
			body: h(
				'div',
				{ class: 'stack', style: { gap: '12px' } },
				h(
					'p',
					{ class: 'muted', style: { fontSize: '.86rem', lineHeight: '1.6' } },
					'While this is on, the playful capabilities behave as though they are not installed: their controls, copy and results are omitted rather than disabled, and the application presents in English.'
				),
				h('div', { class: 'field' }, pin),
				err,
				h(
					'div',
					{ class: 'state state--info' },
					icon('info'),
					h(
						'div',
						{ class: 'state__body' },
						h('div', { class: 'state__title' }, 'This is not a security boundary'),
						h(
							'div',
							{ class: 'state__text' },
							"It is a self-imposed speed bump. The PIN is stored on this machine and clearing the application's data removes the whole thing — saying so plainly is part of the feature rather than a disclaimer bolted onto it."
						)
					)
				)
			),
			actions: [
				{ label: i18n.t('action.cancel') },
				{
					label: 'Turn it on',
					primary: true,
					run: () => {
						const v = pin.value.trim();
						if (!/^\d{4,}$/.test(v)) {
							err.textContent = 'The PIN must be at least four digits.';
							return true;
						}
						state.patchSettings({ school: { ...school, on: true, pin: v } });
						state.log('School mode', 'on');
						ui.notify(
							(school.name || 'School mode') +
								' is on. The playful surfaces are gone until it is turned off.',
							{ kind: 'ok' }
						);
						window.mowuiApp.refresh();
					}
				}
			]
		});
	}

	function turnOff() {
		const pin = h('input', {
			type: 'password',
			inputmode: 'numeric',
			placeholder: 'PIN',
			'aria-label': 'PIN'
		});
		const err = h('div', { style: { color: 'var(--err)', fontSize: '.8rem', minHeight: '18px' } });
		ui.dialog({
			title: 'Turn off ' + (school.name || 'School mode'),
			emoji: '🔓',
			body: h(
				'div',
				{ class: 'stack', style: { gap: '12px' } },
				h(
					'p',
					{ class: 'muted', style: { fontSize: '.86rem' } },
					'Enter the PIN that was set when it was turned on. Your earlier choices were kept and come back with it.'
				),
				h('div', { class: 'field' }, pin),
				err,
				h(
					'p',
					{ class: 'muted', style: { fontSize: '.78rem', lineHeight: '1.6' } },
					"Forgotten it? Clearing this application's stored data removes the mode along with everything else. That is the documented way out, and there is no other — no reset ticket and no support channel, because this was never a security boundary."
				)
			),
			actions: [
				{ label: i18n.t('action.cancel') },
				{
					label: 'Turn it off',
					primary: true,
					run: () => {
						if (pin.value.trim() !== school.pin) {
							err.textContent = 'That PIN does not match.';
							return true;
						}
						state.patchSettings({ school: { ...school, on: false } });
						state.log('School mode', 'off');
						ui.notify((school.name || 'School mode') + ' is off. Your earlier choices are back.', {
							kind: 'ok'
						});
						window.mowuiApp.refresh();
					}
				}
			]
		});
	}

	add(
		box,
		h(
			'div',
			{ class: 'row', style: { gap: '12px', marginBottom: '6px' } },
			icon('shield'),
			h('strong', { style: { flex: '1' } }, school.name || 'School mode'),
			h(
				'button',
				{
					class: 'btn ' + (school.on ? 'btn--outlined' : 'btn--filled'),
					onclick: () => (school.on ? turnOff() : turnOn())
				},
				school.on ? 'Turn it off' : 'Turn it on'
			)
		),
		h(
			'p',
			{ class: 'muted', style: { fontSize: '.84rem', lineHeight: '1.6' } },
			'While on, the playful capabilities are omitted rather than disabled — a greyed-out control still names the thing it is hiding, which defeats the point.'
		),
		school.on
			? null
			: h(
					'div',
					{ class: 'row', style: { gap: '12px', marginTop: '10px', flexWrap: 'wrap' } },
					h('span', { style: { fontSize: '.84rem' } }, 'Call it something else'),
					h('div', { class: 'field', style: { width: '240px' } }, nameInput)
				),
		// While the mode is on this copy must not enumerate what it hides —
		// naming the hidden features is the same leak as showing them greyed out,
		// so the on-state says what happened without listing what went.
		school.on
			? h(
					'div',
					{ class: 'state state--info', style: { marginTop: '10px' } },
					icon('info'),
					h(
						'div',
						{ class: 'state__body' },
						h('div', { class: 'state__title' }, 'It is on'),
						h(
							'div',
							{ class: 'state__text' },
							'Some capabilities are absent from every surface while this is on — not disabled, absent. Your earlier choices are stored and come back when it is turned off.'
						)
					)
				)
			: null
	);
}
