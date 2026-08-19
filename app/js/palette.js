// The application's palette: what it can reach.
//
// The palette itself comes from the same module the documentation site uses, so
// the two behave identically — same keyboard traversal, same anchored regex
// builder, same card/full-window choice. Only the entries differ.

import { createPalette } from '../../docs/assets/js/palette-core.js';
import * as state from './state.js';
import * as tabsCore from '../../docs/assets/js/tabs.js';
import { isPlayfulHidden } from './i18n.js';

let getPages = () => ({});
let getOrder = () => [];
let openPage = () => {};

/** Called once by the shell, which owns the page registry. */
export function wire({ pages, order, open }) {
	getPages = () => pages;
	getOrder = () => order;
	openPage = open;
}

function entries() {
	const pages = getPages();
	const out = [];

	for (const id of getOrder()) {
		const p = pages[id];
		if (!p) continue;
		out.push({
			kind: 'page',
			id: 'page-' + id,
			icon: p.icon,
			label: p.title,
			hint: 'destination',
			run: () => openPage(id)
		});
	}

	const s = state.get('settings');

	out.push(
		{
			kind: 'action',
			id: 'act-theme',
			icon: 'sun',
			label: 'Toggle light and dark',
			hint: 'action · appearance',
			run: () => window.mowuiApp.toggleTheme()
		},
		{
			kind: 'action',
			id: 'act-export',
			icon: 'download',
			label: 'Export everything this application has stored',
			hint: 'action · data',
			run: () => window.mowuiApp.exportAll()
		},
		{
			kind: 'action',
			id: 'act-host',
			icon: 'server',
			label: 'Ollama host — ' + s.ollamaHost,
			hint: 'setting',
			run: () => openPage('settings')
		},
		// Omitted rather than disabled under School mode. A palette result naming
		// a hidden setting is the leak the mode exists to prevent, and the settings
		// page already omits this row — the palette was the surface that forgot.
		...(isPlayfulHidden('language')
			? []
			: [
					{
						kind: 'action',
						id: 'act-lang',
						icon: 'language',
						label: 'Language mode — ' + s.language,
						hint: 'setting',
						run: () => openPage('settings')
					}
				]),
		{
			kind: 'action',
			id: 'act-log',
			icon: 'pulse',
			label: 'Event log',
			hint: 'action · ' + (state.get('statusLog') || []).length + ' entries',
			run: () => openPage('status')
		}
	);

	// Every open tab is reachable by name, which is what makes a tab strip
	// navigable once it holds more tabs than fit on screen.
	const model = tabsCore.normalise(state.get('tabModel'), Object.keys(pages), 'ollama');
	for (const t of model.tabs) {
		const p = pages[t.page];
		if (!p) continue;
		const group = model.groups.find((g) => g.id === t.group);
		out.push({
			kind: 'tab',
			id: 'tab-' + t.id,
			icon: p.icon,
			// The group is named in the hint because a palette result that teleports
			// into a collapsed group without saying so is a jump with no explanation.
			label: p.title + ' — open tab',
			hint: t.pinned ? 'tab · pinned' : group ? 'tab · ' + group.name : 'tab',
			run: () => {
				state.set('tabModel', { ...model, activeTab: t.id });
				window.mowuiApp.refresh();
			}
		});
	}

	return out;
}

export const palette = createPalette({
	entries,
	getSize: () => state.get('settings').paletteSize || 'card',
	setSize: (v) => state.patchSettings({ paletteSize: v }),
	placeholder: 'Search every destination, setting and action…'
});
