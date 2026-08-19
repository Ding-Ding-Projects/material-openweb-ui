// The file converter.
//
// Type comes from the bytes. Unavailable adapters stay on screen with the exact
// dependency they need, because hiding them makes a capability gap look like a
// complete catalogue.

import { h, icon, clear, bytes as fmtBytes, add } from '../../../docs/assets/js/dom.js';
import { searchField } from '../../../docs/assets/js/regex.js';
import * as ui from '../../../docs/assets/js/ui.js';
import * as convert from '../core/convert.js';
import * as state from '../state.js';

let current = null; // { file, u8, sniffed }

async function decodeImage(file) {
  return createImageBitmap(file);
}

export function render(root) {
  const page = h('div', { class: 'page' });
  const detail = h('div', { class: 'stack', style: { gap: '16px' } });
  const results = h('div', { class: 'stack', style: { gap: '8px' } });

  const input = h('input', { type: 'file', style: { display: 'none' }, onchange: (e) => e.target.files[0] && load(e.target.files[0]) });

  const drop = h('div', {
    class: 'dropzone', tabindex: '0', role: 'button',
    'aria-label': 'Choose a file to inspect and convert',
    onclick: () => input.click(),
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } },
    ondragover: (e) => { e.preventDefault(); drop.dataset.over = '1'; },
    ondragleave: () => { delete drop.dataset.over; },
    ondrop: (e) => {
      e.preventDefault();
      delete drop.dataset.over;
      const f = e.dataTransfer?.files?.[0];
      if (f) load(f);
    }
  },
    icon('swap', 'icon icon--lg'),
    h('strong', {}, 'Drop a file here, or choose one'),
    h('span', { class: 'muted', style: { fontSize: '.85rem', maxWidth: '54ch' } },
      'Its type is read from the actual bytes, so a file with the wrong extension is still identified correctly.')
  );

  async function load(file) {
    const u8 = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
    const sniffed = convert.sniff(u8);
    current = { file, sniffed };
    state.log('File inspected', file.name + ' → ' + sniffed.type);
    renderDetail();
  }

  function renderDetail() {
    clear(detail);
    if (!current) {
      detail.append(h('div', { class: 'muted', style: { fontSize: '.85rem' } },
        'Nothing is loaded yet. The catalogue below lists every adapter this build has, including the ones that cannot run.'));
      renderCatalogue(null);
      return;
    }

    const { file, sniffed } = current;
    const ext = (file.name.match(/\.([^.]+)$/) || [, ''])[1].toLowerCase();
    const extLies = ext && !sniffed.mime.includes(ext) && !(ext === 'jpg' && sniffed.mime === 'image/jpeg') && !(ext === 'txt' && sniffed.mime === 'text/plain');

    add(detail, 
      h('div', { class: 'card' },
        h('div', { class: 'row', style: { gap: '12px', marginBottom: '12px' } },
          icon('file'),
          h('div', { class: 'stack', style: { gap: '2px', flex: '1', minWidth: '0' } },
            h('strong', {}, file.name),
            h('span', { class: 'muted', style: { fontSize: '.78rem' } }, fmtBytes(file.size))),
          h('button', { class: 'btn btn--text', onclick: () => { current = null; renderDetail(); } }, 'Clear')),
        h('dl', { class: 'kv' },
          h('dt', {}, 'Detected'), h('dd', {}, h('strong', {}, sniffed.type)),
          h('dt', {}, 'Category'), h('dd', {}, sniffed.cat),
          h('dt', {}, 'Media type'), h('dd', { class: 'mono' }, sniffed.mime),
          h('dt', {}, 'Evidence'), h('dd', { class: 'mono', style: { fontSize: '.74rem' } }, sniffed.evidence)),
        extLies
          ? h('div', { class: 'state state--info', style: { marginTop: '14px' } }, icon('info'),
              h('div', { class: 'state__body' },
                h('div', { class: 'state__title' }, 'The extension disagrees with the bytes'),
                h('div', { class: 'state__text' },
                  'This file is named .' + ext + ' but its contents are ' + sniffed.type + '. The bytes win: every adapter below is chosen from what the file actually is.')))
          : null
      )
    );

    renderCatalogue(sniffed.mime);
  }

  const catBox = h('div', { class: 'stack', style: { gap: '18px' } });

  function renderCatalogue(mime) {
    clear(catBox);
    const field = searchField({ placeholder: 'Search adapters…', label: 'Search conversion adapters' });
    const listing = h('div', { class: 'stack', style: { gap: '18px' } });

    function paint() {
      const m = field.matcher();
      clear(listing);
      for (const cat of convert.CATEGORIES) {
        const items = convert.ADAPTERS
          .filter((a) => a.cat === cat)
          .filter((a) => m.test(a.to + ' ' + a.cat + ' ' + (a.reason || '') + ' ' + (a.discloses || '')));
        if (!items.length) continue;

        add(listing, h('div', { class: 'stack', style: { gap: '8px' } },
          h('div', { class: 'muted', style: { fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: '700' } }, cat),
          ...items.map((a) => {
            const applies = mime && (a.from.includes('*') || a.from.includes(mime));
            const runnable = a.available && applies;

            const btn = h('button', {
              class: 'btn ' + (runnable ? 'btn--filled' : 'btn--outlined'),
              'aria-disabled': runnable ? null : 'true',
              disabled: runnable ? null : true,
              title: !a.available ? a.reason : !mime ? 'Load a file first.' : !applies ? 'This adapter does not accept ' + mime + '.' : 'Convert'
            }, runnable ? 'Convert' : a.available ? 'N/A' : 'Unavailable');

            if (runnable) {
              btn.addEventListener('click', () => runOne(a));
            }

            return h('div', { class: 'card', style: { padding: '14px 18px', opacity: a.available ? '1' : '.72' } },
              h('div', { class: 'row', style: { gap: '12px' } },
                h('div', { class: 'stack', style: { gap: '3px', flex: '1', minWidth: '0' } },
                  h('div', { class: 'row', style: { gap: '8px' } },
                    h('strong', { style: { fontSize: '.88rem' } }, a.to),
                    convert.isLossy(a) ? h('span', { class: 'chip chip--warn', style: { height: '20px', fontSize: '.62rem', padding: '0 8px' } }, 'lossy') : null,
                    !a.available ? h('span', { class: 'chip chip--tonal', style: { height: '20px', fontSize: '.62rem', padding: '0 8px' } }, 'not bundled') : null),
                  h('span', { class: 'muted', style: { fontSize: '.76rem', lineHeight: '1.55' } }, a.available ? a.discloses : a.reason)),
                btn));
          })));
      }
    }

    field.onChange(paint);
    catBox.append(field.el, listing);
    paint();
  }

  async function runOne(adapter) {
    if (!current) return;
    const go = async () => {
      try {
        const blob = await convert.run(adapter, current.file, { decodeImage });
        const name = convert.outputName(current.file.name, adapter);
        const url = URL.createObjectURL(blob);
        const entry = { name, size: blob.size, adapter: adapter.to, at: Date.now(), url };
        state.set('convResults', [entry, ...(state.get('convResults') || [])].slice(0, 40));
        state.log('File converted', current.file.name + ' → ' + name);
        paintResults();
        ui.notify('Converted to ' + name + ' (' + fmtBytes(blob.size) + '). The source file is untouched.', { kind: 'ok' });
      } catch (e) {
        ui.notify('Nothing was written: ' + e.message, { kind: 'error' });
      }
    };

    // A lossy conversion discloses exactly what changes before it runs, and
    // needs an explicit action rather than happening on the first click.
    if (convert.isLossy(adapter)) {
      ui.dialog({
        title: 'Convert to ' + adapter.to + '?',
        emoji: '⚠️',
        body: h('div', { class: 'stack', style: { gap: '12px' } },
          h('div', { class: 'state state--warn' }, icon('warn'),
            h('div', { class: 'state__body' },
              h('div', { class: 'state__title' }, 'This conversion destroys something'),
              h('ul', { class: 'destroys' }, ...adapter.destroys.map((d) => h('li', {}, d))),
              adapter.discloses ? h('div', { class: 'state__text' }, adapter.discloses) : null)),
          h('p', { class: 'muted', style: { fontSize: '.85rem' } },
            'The source file is never modified. The result is written as a new file you can save.')),
        actions: [
          { label: 'Cancel' },
          // Not `run: go`. `go` is async, so it returns a Promise, and a
          // dialog action's truthy return means "keep the dialog open" — so
          // confirming a lossy conversion started it and then left the modal
          // sitting there forever. The conversion worked; the dialog was the
          // part that did not.
          { label: 'Convert', primary: true, run: () => { go(); } }
        ]
      });
    } else {
      go();
    }
  }

  function paintResults() {
    clear(results);
    const list = state.get('convResults') || [];
    if (!list.length) {
      results.append(h('div', { class: 'muted', style: { fontSize: '.84rem' } }, 'Nothing has been converted in this session yet.'));
      return;
    }
    for (const r of list) {
      results.append(h('div', { class: 'card', style: { display: 'flex', gap: '12px', alignItems: 'center', padding: '12px 16px' } },
        icon('file', 'icon icon--sm'),
        h('div', { class: 'stack', style: { gap: '1px', flex: '1', minWidth: '0' } },
          h('strong', { style: { fontSize: '.85rem' } }, r.name),
          h('span', { class: 'muted', style: { fontSize: '.72rem' } }, r.adapter + ' · ' + fmtBytes(r.size))),
        r.url
          ? h('a', { class: 'btn btn--outlined', href: r.url, download: r.name }, icon('download', 'icon icon--sm'), 'Save')
          : h('span', { class: 'muted', style: { fontSize: '.72rem' } }, 'expired with the session')));
    }
  }

  page.append(
    h('div', { class: 'page__head' },
      h('div', { style: { flex: '1' } },
        h('div', { class: 'page__title' }, 'File converter'),
        h('div', { class: 'page__sub' },
          'Type is detected from the bytes, not the name. Adapters that are not bundled stay listed with the exact dependency they need, because a catalogue that hides its gaps is not a catalogue.'))),
    input,
    drop,
    h('div', { style: { height: '18px' } }),
    detail,
    h('h3', { style: { margin: '26px 0 12px' } }, 'Adapters'),
    catBox,
    h('h3', { style: { margin: '30px 0 12px' } }, 'Results'),
    results
  );

  root.append(page);
  renderDetail();
  paintResults();
}

export const meta = { id: 'converter', title: 'File converter', zh: '檔案轉換', icon: 'swap' };
