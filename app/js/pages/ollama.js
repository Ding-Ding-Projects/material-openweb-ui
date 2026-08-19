// The local Ollama suite manager.
//
// Every number on this page comes from the daemon or from measured hardware.
// Nothing is simulated, and where a fact is missing the surface says so instead
// of substituting a plausible one.

import { h, icon, clear, add } from '../../../docs/assets/js/dom.js';
import { searchField } from '../../../docs/assets/js/regex.js';
import * as ui from '../../../docs/assets/js/ui.js';
import * as ollama from '../core/ollama.js';
import * as state from '../state.js';
import * as desktop from '../desktop.js';

const gb = (n) => (n === null || n === undefined ? '—' : (n / 1024 ** 3).toFixed(2) + ' GB');

let hardware = null;
const pulls = new Map(); // name -> { controller, percent, status }

function host() {
	return state.get('settings').ollamaHost || ollama.DEFAULT_HOST;
}

// ---------------------------------------------------------------- daemon card

function daemonCard(onRefresh) {
	const card = h(
		'div',
		{ class: 'card', style: { marginBottom: '20px' } },
		h('div', { class: 'muted' }, 'Checking the daemon…')
	);

	(async () => {
		const info = await ollama.health(host());
		clear(card);

		if (info.status === 'ready') {
			card.append(
				h(
					'div',
					{ class: 'row', style: { gap: '12px', flexWrap: 'wrap' } },
					h(
						'span',
						{ class: 'chip chip--ok' },
						icon('check', 'icon icon--sm'),
						'Ollama is running'
					),
					h('span', { class: 'chip chip--tonal mono' }, 'v' + info.version),
					h('span', { class: 'chip chip--tonal mono' }, info.host),
					h('span', { class: 'chip chip--tonal mono' }, info.latencyMs + ' ms'),
					h('div', { style: { flex: '1' } }),
					h('button', { class: 'btn btn--outlined', onclick: onRefresh }, 'Refresh')
				)
			);
			return;
		}

		// A diagnosis, not a spinner. Each state names what to do next.
		const stopped = info.status === 'unreachable';
		card.append(
			h(
				'div',
				{ class: 'state state--bad' },
				icon('warn'),
				h(
					'div',
					{ class: 'state__body' },
					h(
						'div',
						{ class: 'state__title' },
						stopped ? 'Ollama is not answering' : 'Something is listening, but it is not Ollama'
					),
					h('div', { class: 'state__text' }, info.reason),
					h(
						'div',
						{ class: 'state__text', style: { marginTop: '10px' } },
						stopped
							? 'If it is installed, start it and press Refresh. If the daemon listens on a different address, change the host in Settings — this application never scans for it.'
							: 'Check that nothing else has taken the port, then press Refresh.'
					),
					h(
						'div',
						{ class: 'row', style: { gap: '10px', marginTop: '14px', flexWrap: 'wrap' } },
						h('button', { class: 'btn btn--outlined', onclick: onRefresh }, 'Refresh'),
						h(
							'button',
							{ class: 'btn btn--text', onclick: () => window.mowuiApp.open('settings') },
							'Change the host'
						)
					)
				)
			)
		);
	})();

	return card;
}

// ---------------------------------------------------------------- installed

function installedSection(reload) {
	const box = h(
		'div',
		{ class: 'stack', style: { gap: '10px' } },
		h('div', { class: 'muted' }, 'Reading installed models…')
	);

	(async () => {
		let models;
		try {
			models = await ollama.installed(host());
		} catch (e) {
			clear(box);
			box.append(
				h(
					'div',
					{ class: 'state state--bad' },
					icon('warn'),
					h(
						'div',
						{ class: 'state__body' },
						h('div', { class: 'state__title' }, 'Installed models could not be read'),
						h('div', { class: 'state__text' }, e.message)
					)
				)
			);
			return;
		}

		clear(box);
		if (!models.length) {
			box.append(
				h(
					'div',
					{ class: 'pending' },
					h('strong', {}, 'No models are installed'),
					h(
						'span',
						{ class: 'muted', style: { fontSize: '.85rem', maxWidth: '52ch' } },
						'The daemon answered and reported an empty list. Pull one from the catalogue below and it will appear here.'
					)
				)
			);
			return;
		}

		for (const m of models) {
			box.append(
				h(
					'div',
					{
						class: 'card',
						style: { display: 'flex', gap: '14px', alignItems: 'center', padding: '14px 18px' }
					},
					icon('server'),
					h(
						'div',
						{ class: 'stack', style: { gap: '3px', flex: '1', minWidth: '0' } },
						h('strong', { style: { fontSize: '.92rem' } }, m.name),
						h(
							'span',
							{ class: 'muted', style: { fontSize: '.76rem' } },
							[gb(m.sizeBytes), m.parameterSize, m.quantisation, m.family]
								.filter(Boolean)
								.join(' · ')
						)
					),
					h(
						'button',
						{
							class: 'btn btn--text',
							style: { color: 'var(--err)' },
							onclick: () =>
								ui.superConfirm({
									what: 'Delete ' + m.name,
									affects:
										'The model blob (' +
										gb(m.sizeBytes) +
										') is removed from the Ollama daemon on this machine. Downloading it again needs the network. Nothing else is touched.',
									onConfirm: async () => {
										try {
											await ollama.remove(m.name, { host: host() });
											state.log('Model deleted', m.name);
											ui.notify('Deleted ' + m.name + '.', { kind: 'ok' });
											reload();
										} catch (e) {
											ui.notify('The daemon refused the delete: ' + e.message, { kind: 'error' });
										}
									}
								})
						},
						icon('trash', 'icon icon--sm'),
						'Delete'
					)
				)
			);
		}
	})();

	return box;
}

// ---------------------------------------------------------------- catalogue

function catalogSection() {
	const wrap = h('div', { class: 'stack', style: { gap: '12px' } });
	const note = h(
		'div',
		{ class: 'state state--info' },
		icon('info'),
		h(
			'div',
			{ class: 'state__body' },
			h('div', { class: 'state__text' }, 'Fetching the published catalogue…')
		)
	);
	const list = h('div', { class: 'stack', style: { gap: '8px' } });
	const count = h('div', { class: 'muted', style: { fontSize: '.78rem' } });

	const field = searchField({
		placeholder: 'Search the catalogue…',
		label: 'Search the model catalogue'
	});

	let view = { source: 'none', catalog: { models: [] }, note: '' };

	/**
	 * Fit verdicts, keyed by model name, and what they were measured against.
	 *
	 * Recomputed rather than remembered: the contract asks for a verdict that
	 * follows the hardware, the storage and the settings, so changing the model
	 * destination has to produce different answers rather than the same ones with
	 * a newer timestamp.
	 */
	let fitVerdicts = new Map();
	let fitProbe = null;

	async function recomputeFit(models) {
		if (!desktop.isDesktop || !models.length) return;
		const installedNow = installed.map((i) => i.name);
		const result = await desktop
			.fitModels(
				models.slice(0, 300).map((x) => ({
					id: x.name,
					blobBytes: x.blobBytes,
					parameterCount: x.parameterCount,
					quantisation: x.quantisation,
					contextTokens: x.contextTokens
				})),
				state.get('settings').modelDestination || undefined
			)
			.catch(() => null);
		if (!result || !result.verdicts) return;
		fitProbe = result.hardware;
		fitVerdicts = new Map(result.verdicts.map((v) => [v.id, v]));
		void installedNow;
		render();
	}

	function verdictRow(name) {
		const v = fitVerdicts.get(name);
		if (!v) {
			// Absent is said out loud rather than left blank: a missing verdict and a
			// verdict of "Unknown" are different facts.
			return h(
				'div',
				{ class: 'fit fit--pending' },
				desktop.isDesktop
					? 'Fit not measured yet.'
					: 'Fit verdicts need the desktop shell, which can measure this machine. A browser cannot.'
			);
		}
		const tone =
			v.verdict === 'Runs well'
				? 'ok'
				: v.verdict === 'Runs with limits'
					? 'warn'
					: v.verdict === 'Unlikely'
						? 'bad'
						: 'unknown';
		return h(
			'details',
			{ class: 'fit fit--' + tone },
			h(
				'summary',
				{},
				h('span', { class: 'fit__verdict' }, v.verdict),
				h(
					'span',
					{ class: 'fit__when' },
					'measured ' + String(v.probedAt).replace('T', ' ').slice(0, 16)
				)
			),
			h('ul', { class: 'fit__evidence' }, ...(v.evidence || []).map((e) => h('li', {}, e))),
			(v.assumptions || []).length
				? h(
						'div',
						{ class: 'fit__assumptions' },
						h('strong', {}, 'Assumed: '),
						...(v.assumptions || []).map((a) => h('div', {}, a))
					)
				: null
		);
	}

	function render() {
		const m = field.matcher();
		clear(list);
		const all = view.catalog.models || [];
		const matched = all.filter((x) => m.test(x.name));
		count.textContent =
			matched.length +
			' of ' +
			all.length +
			' models shown' +
			(view.catalog.pages ? ' · ' + view.catalog.pages + ' page(s) fetched' : '');

		if (!all.length) return;
		if (!matched.length) {
			list.append(
				h(
					'div',
					{ class: 'pending' },
					h('strong', {}, 'No matches'),
					h(
						'span',
						{ class: 'muted', style: { fontSize: '.84rem' } },
						'Nothing in the catalogue matches that.'
					)
				)
			);
			return;
		}

		for (const model of matched.slice(0, 300)) {
			const bar = h(
				'div',
				{ class: 'bar', style: { display: 'none', marginTop: '8px' } },
				h('div', { class: 'bar__fill', style: { width: '0%' } })
			);
			const status = h('span', { class: 'muted mono', style: { fontSize: '.72rem' } });

			const pullBtn = h(
				'button',
				{ class: 'btn btn--outlined' },
				icon('download', 'icon icon--sm'),
				'Pull'
			);
			pullBtn.addEventListener('click', async () => {
				if (pulls.has(model.name)) {
					pulls.get(model.name).controller.abort();
					return;
				}
				const controller = new AbortController();
				pulls.set(model.name, { controller });
				pullBtn.replaceChildren(icon('x', 'icon icon--sm'), document.createTextNode('Cancel'));
				bar.style.display = '';
				state.log('Pull started', model.name);

				const result = await ollama.pull(model.name, {
					host: host(),
					signal: controller.signal,
					onProgress: (p) => {
						status.textContent =
							p.percent === null
								? p.status
								: p.status + ' · ' + p.percent.toFixed(1) + '% of ' + gb(p.total);
						if (p.percent !== null) bar.firstChild.style.width = p.percent + '%';
					}
				});

				pulls.delete(model.name);
				pullBtn.replaceChildren(icon('download', 'icon icon--sm'), document.createTextNode('Pull'));
				bar.style.display = 'none';

				if (result.cancelled) {
					status.textContent = 'cancelled';
					ui.notify(
						'Cancelled the pull of ' +
							model.name +
							". Whatever was already downloaded stays in the daemon's cache.",
						{ kind: 'info' }
					);
				} else if (!result.ok) {
					status.textContent = 'failed';
					ui.notify('The pull of ' + model.name + ' failed: ' + result.error, { kind: 'error' });
				} else {
					status.textContent = 'installed';
					state.log('Pull finished', model.name);
					ui.notify(model.name + ' is installed.', { kind: 'ok' });
				}
			});

			list.append(
				h(
					'div',
					{ class: 'card', style: { padding: '14px 18px' } },
					h(
						'div',
						{ class: 'row', style: { gap: '12px' } },
						icon('server'),
						h(
							'div',
							{ class: 'stack', style: { gap: '2px', flex: '1', minWidth: '0' } },
							h('strong', { style: { fontSize: '.9rem' } }, model.name),
							status
						),
						pullBtn
					),
					verdictRow(model.name),
					bar
				)
			);
		}
	}

	field.onChange(render);

	(async () => {
		const cached = ollama.cachedCatalog();

		// Said BEFORE the request, not after it. Every other thing this page does
		// reaches only the daemon on this machine; browsing the published
		// catalogue is the one exception, and someone deserves to know that at the
		// moment it happens rather than to find it in a network log later.
		clear(note);
		note.className = 'state state--info';
		note.append(
			icon('info'),
			h(
				'div',
				{ class: 'state__body' },
				h('div', { class: 'state__title' }, 'Fetching the published catalogue from ollama.com'),
				h(
					'div',
					{ class: 'state__text' },
					'The daemon on this machine has no endpoint that lists the registry, so this reads ollama.com’s library page. It is the only request this application makes to anywhere other than your own computer, and nothing about you is sent with it.'
				)
			)
		);

		const fresh = await ollama.fetchCatalog({});
		view = ollama.catalogView(fresh, cached);
		clear(note);
		note.className =
			'state ' +
			(view.source === 'live' && view.catalog.completeness === 'complete'
				? 'state--ok'
				: view.source === 'none'
					? 'state--bad'
					: 'state--info');
		note.append(
			// A verdict of "unverified" is not a success tick. It is information.
			icon(
				view.source === 'live' && view.catalog.completeness === 'complete'
					? 'check'
					: view.source === 'none'
						? 'warn'
						: 'info'
			),
			h(
				'div',
				{ class: 'state__body' },
				h(
					'div',
					{ class: 'state__title' },
					view.title ||
						(view.source === 'cached' ? 'Showing the last catalogue read' : 'No catalogue to show')
				),
				h('div', { class: 'state__text' }, view.note)
			)
		);
		render();
		recomputeFit(view.catalog.models || []);
	})();

	// Re-decide whenever the machine or its storage is re-measured.
	onHardwareChanged(() => recomputeFit(view.catalog.models || []));

	wrap.append(note, field.el, count, list);
	return wrap;
}

/**
 * Sections that want to know when the measured hardware changed.
 *
 * The hardware card and the catalogue are separate functions with no shared
 * closure, and the destination control lives in the first while the verdicts
 * live in the second. Passing a callback down through render() would work; this
 * is smaller and does not make every section's signature carry a concern only
 * two of them have.
 */
const hardwareListeners = new Set();
function onHardwareChanged(fn) {
	hardwareListeners.add(fn);
	return () => hardwareListeners.delete(fn);
}

// ---------------------------------------------------------------- hardware

function hardwareSection() {
	const card = h(
		'div',
		{ class: 'card', style: { marginBottom: '20px' } },
		h('div', { class: 'muted' }, 'Probing this machine…')
	);

	const paint = async () => {
		if (!desktop.isDesktop) {
			clear(card);
			card.append(
				h(
					'div',
					{ class: 'state state--info' },
					icon('info'),
					h(
						'div',
						{ class: 'state__body' },
						h('div', { class: 'state__title' }, 'Hardware cannot be measured in a browser'),
						h(
							'div',
							{ class: 'state__text' },
							'RAM, GPU and free disk are read through the desktop shell. Running these files in an ordinary browser leaves them unknown, and a fit verdict without them would be a guess.'
						)
					)
				)
			);
			return;
		}

		hardware = await desktop.probeHardware(state.get('settings').modelDestination || undefined);
		clear(card);
		if (!hardware) {
			card.append(h('div', { class: 'muted' }, 'The shell did not answer the hardware probe.'));
			return;
		}

		const fact = (f) => (f && f.known ? f.value : null);
		const row = (label, value, why) =>
			h(
				'div',
				{ class: 'stack', style: { gap: '2px' } },
				h(
					'span',
					{
						class: 'muted',
						style: { fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.06em' }
					},
					label
				),
				h('span', { style: { fontSize: '.88rem', fontWeight: '600' } }, value ?? 'Unknown'),
				why
					? h('span', { class: 'muted', style: { fontSize: '.7rem', lineHeight: '1.5' } }, why)
					: null
			);

		add(
			card,
			h(
				'div',
				{ class: 'row', style: { gap: '10px', marginBottom: '14px' } },
				icon('pulse'),
				h('strong', {}, 'This machine')
			),
			h(
				'div',
				{ class: 'grid grid--3' },
				row(
					'System memory',
					fact(hardware.totalRamBytes) ? gb(hardware.totalRamBytes.value) : null,
					hardware.totalRamBytes.known ? null : hardware.totalRamBytes.why
				),
				row('GPU', fact(hardware.gpuName), hardware.gpuName.known ? null : hardware.gpuName.why),
				row(
					'GPU memory',
					fact(hardware.vramBytes) ? gb(hardware.vramBytes.value) : null,
					hardware.vramBytes.known ? null : hardware.vramBytes.why
				)
			),
			// Where models are stored, because free space on THAT drive is half the
			// verdict. Changing it has to move the answers, not just the timestamp —
			// which is what the contract's own verification step checks.
			h(
				'div',
				{ class: 'dest' },
				h('label', { class: 'dest__label', for: 'model-destination' }, 'Model destination'),
				h(
					'div',
					{ class: 'row', style: { gap: '8px', alignItems: 'center' } },
					h('input', {
						id: 'model-destination',
						type: 'text',
						class: 'mono',
						value: state.get('settings').modelDestination || '',
						placeholder:
							hardware.modelPath && hardware.modelPath.known
								? hardware.modelPath.value
								: 'the daemon default',
						'aria-label': 'Where models are stored',
						onchange: async (e) => {
							const next = e.target.value.trim();
							state.patchSettings({ modelDestination: next });
							state.log('Model destination changed', next || 'the daemon default');
							// Re-probe and re-decide. Leaving verdicts that were measured
							// against a different drive would show a stale answer with a
							// current-looking timestamp, which is worse than showing none.
							await paint();
							for (const fn of hardwareListeners) await fn();
							ui.notify('Re-measured against that location, and every fit verdict recomputed.', {
								kind: 'ok'
							});
						}
					}),
					h(
						'span',
						{ class: 'muted', style: { fontSize: '.74rem' } },
						fact(hardware.freeDiskBytes)
							? gb(hardware.freeDiskBytes.value) + ' free'
							: hardware.freeDiskBytes.why || 'free space unknown'
					)
				)
			),
			hardware.notes.length
				? h(
						'div',
						{ class: 'muted', style: { fontSize: '.74rem', marginTop: '12px', lineHeight: '1.6' } },
						hardware.notes.join(' ')
					)
				: null
		);
	};

	paint();
	return card;
}

// ---------------------------------------------------------------- page

export function render(root) {
	const page = h('div', { class: 'page' });

	const rebuild = () => {
		clear(page);
		page.append(
			h(
				'div',
				{ class: 'page__head' },
				h(
					'div',
					{ style: { flex: '1' } },
					h('div', { class: 'page__title' }, 'Ollama'),
					h(
						'div',
						{ class: 'page__sub' },
						'The daemon, what is installed, and the published catalogue. Every figure here comes from the local API or from this machine — nothing on this page is a placeholder.'
					)
				)
			),
			daemonCard(rebuild),
			hardwareSection(),
			h('h3', { style: { margin: '26px 0 12px' } }, 'Installed'),
			installedSection(rebuild),
			h('h3', { style: { margin: '30px 0 12px' } }, 'Catalogue'),
			catalogSection()
		);
	};

	rebuild();
	root.append(page);
}

export const meta = { id: 'ollama', title: 'Ollama', zh: 'Ollama 管理', icon: 'server' };
