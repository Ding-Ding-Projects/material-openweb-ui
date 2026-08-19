// The changelog, in the application.
//
// It reads the same CHANGELOG the documentation site reads. Two copies of a
// changelog is two changelogs, and the second one is always the stale one — so
// there is one, and both surfaces render it.
//
// Every entry carries the commit it shipped in, and `scripts/test-changelog.mjs`
// resolves each of those against the repository. An entry naming a commit that
// does not exist fails the build rather than sitting here looking plausible.

import { h, add, clear, icon } from '../../../docs/assets/js/dom.js';
import { searchField } from '../../../docs/assets/js/regex.js';
import * as ui from '../../../docs/assets/js/ui.js';
import { CHANGELOG } from '../../../docs/assets/js/content.js';
import * as formats from '../../../docs/assets/js/formats.js';
import { bulkBar, rowCheckbox } from '../../../docs/assets/js/bulk.js';

export const meta = { title: 'Changelog', icon: 'clock', zh: '更新紀錄' };

const REPO = 'https://github.com/Ding-Ding-Projects/material-openweb-ui';

/** Every item flattened, with the release and section it belongs to. */
function allItems() {
	return CHANGELOG.flatMap((release) =>
		release.sections.flatMap((section) =>
			section.items.map((item, i) => ({
				id: release.version + '/' + section.title + '/' + i,
				version: release.version,
				date: release.date,
				codename: release.codename,
				section: section.title,
				text: item.text,
				sha: item.sha || ''
			}))
		)
	);
}

export function render(root) {
	const page = h('div', { class: 'page' });
	const list = h('div', { class: 'stack', style: { gap: '18px' } });
	const count = h('div', { class: 'muted', style: { fontSize: '.78rem' } });

	const field = searchField({
		placeholder: 'Search the changelog…',
		label: 'Search the changelog',
		sampleFrom: () => allItems().map((i) => i.text)
	});
	const from = h('input', { type: 'date', 'aria-label': 'From date', class: 'mono' });
	const to = h('input', { type: 'date', 'aria-label': 'To date', class: 'mono' });

	let section = '';

	function shown() {
		const m = field.matcher();
		const test = m.ok ? m.test : () => true;
		return allItems().filter((i) => {
			if (section && i.section !== section) return false;
			if (from.value && i.date < from.value) return false;
			if (to.value && i.date > to.value) return false;
			return test(i.text + ' ' + i.version + ' ' + i.section);
		});
	}

	const bar = bulkBar({
		getScopeIds: () => shown().map((i) => i.id),
		getAllIds: () => allItems().map((i) => i.id),
		noun: 'entry',
		exportRows: (ids) => {
			const want = new Set(ids);
			return allItems()
				.filter((i) => want.has(i.id))
				.map((i) => ({
					version: i.version,
					date: i.date,
					section: i.section,
					change: i.text,
					commit: i.sha
				}));
		}
	});

	function paint() {
		const rows = shown();
		const total = allItems().length;
		bar.refresh();
		count.textContent = rows.length + ' of ' + total + ' entries shown';
		clear(list);

		if (!rows.length) {
			add(
				list,
				h(
					'div',
					{ class: 'pending' },
					icon('clock', 'icon icon--lg'),
					h('strong', {}, total ? 'Nothing matches' : 'No version has been released'),
					h(
						'span',
						{ class: 'muted', style: { fontSize: '.85rem', maxWidth: '58ch' } },
						total
							? 'No entry matches the current search and date range.'
							: 'There is nothing to list, and inventing entries to fill the space would make this viewer document a history that never happened.'
					)
				)
			);
			return;
		}

		// Grouped back into releases, so the shape of the document survives filtering.
		const byVersion = new Map();
		for (const item of rows) {
			if (!byVersion.has(item.version)) byVersion.set(item.version, []);
			byVersion.get(item.version).push(item);
		}

		for (const [version, items] of byVersion) {
			const release = CHANGELOG.find((r) => r.version === version);
			const block = h(
				'div',
				{ class: 'card' },
				h(
					'div',
					{ class: 'chg__head' },
					h('span', { class: 'chg__version' }, version),
					release && release.codename
						? h('span', { class: 'chg__codename' }, release.codename)
						: null,
					h('span', { style: { flex: '1' } }),
					h('span', { class: 'mono muted', style: { fontSize: '.74rem' } }, items[0].date)
				)
			);

			const bySection = new Map();
			for (const item of items) {
				if (!bySection.has(item.section)) bySection.set(item.section, []);
				bySection.get(item.section).push(item);
			}

			for (const [title, sectionItems] of bySection) {
				add(block, h('h3', { class: 'chg__section' }, title));
				for (const item of sectionItems) {
					add(
						block,
						h(
							'div',
							{ class: 'chg__item' },
							rowCheckbox(bar, item.id, item.text.slice(0, 50)),
							h('div', { class: 'chg__text' }, item.text),
							item.sha
								? h(
										'a',
										{
											class: 'chg__sha mono',
											href: REPO + '/commit/' + item.sha,
											target: '_blank',
											rel: 'noreferrer noopener',
											title: 'The commit this shipped in'
										},
										item.sha.slice(0, 9)
									)
								: // A note rather than a change. Saying so beats an empty column,
									// which reads as a missing commit rather than an absent one.
									h('span', { class: 'chg__sha chg__sha--none' }, 'note')
						)
					);
				}
			}
			add(list, block);
		}
	}

	field.onChange(paint);
	from.addEventListener('change', paint);
	to.addEventListener('change', paint);

	const sections = [...new Set(allItems().map((i) => i.section))];
	const sectionSel = ui.select({
		value: '',
		width: 190,
		label: 'Kind of change',
		options: [
			{ value: '', label: 'Every kind (' + allItems().length + ')' },
			...sections.map((s) => ({
				value: s,
				label: s + ' (' + allItems().filter((i) => i.section === s).length + ')'
			}))
		],
		onChange: (v) => {
			section = v;
			paint();
		}
	});

	add(
		page,
		h(
			'div',
			{ class: 'page__head' },
			h(
				'div',
				{ style: { flex: '1' } },
				h('div', { class: 'page__title' }, 'Changelog'),
				h(
					'div',
					{ class: 'page__sub' },
					'Every released version. Each entry names the commit it shipped in, and the build fails if one of those commits does not resolve.'
				)
			),
			h(
				'button',
				{
					class: 'btn btn--outlined',
					onclick: () => {
						const rows = allItems().map((i) => ({
							version: i.version,
							date: i.date,
							section: i.section,
							change: i.text,
							commit: i.sha
						}));
						ui.downloadFile('changelog.md', formats.serialise(rows, 'markdown'), 'text/markdown');
					}
				},
				icon('download', 'icon icon--sm'),
				'Export as Markdown'
			)
		),
		h(
			'div',
			{ class: 'chg__filters' },
			field.el,
			sectionSel.el,
			h('label', { class: 'chg__date' }, h('span', {}, 'From'), from),
			h('label', { class: 'chg__date' }, h('span', {}, 'To'), to)
		),
		count,
		bar.el,
		list
	);

	root.append(page);
	paint();
}
