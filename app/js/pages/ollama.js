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
  const card = h('div', { class: 'card', style: { marginBottom: '20px' } }, h('div', { class: 'muted' }, 'Checking the daemon…'));

  (async () => {
    const info = await ollama.health(host());
    clear(card);

    if (info.status === 'ready') {
      card.append(
        h('div', { class: 'row', style: { gap: '12px', flexWrap: 'wrap' } },
          h('span', { class: 'chip chip--ok' }, icon('check', 'icon icon--sm'), 'Ollama is running'),
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
      h('div', { class: 'state state--bad' },
        icon('warn'),
        h('div', { class: 'state__body' },
          h('div', { class: 'state__title' }, stopped ? 'Ollama is not answering' : 'Something is listening, but it is not Ollama'),
          h('div', { class: 'state__text' }, info.reason),
          h('div', { class: 'state__text', style: { marginTop: '10px' } },
            stopped
              ? 'If it is installed, start it and press Refresh. If the daemon listens on a different address, change the host in Settings — this application never scans for it.'
              : 'Check that nothing else has taken the port, then press Refresh.'),
          h('div', { class: 'row', style: { gap: '10px', marginTop: '14px', flexWrap: 'wrap' } },
            h('button', { class: 'btn btn--outlined', onclick: onRefresh }, 'Refresh'),
            h('button', { class: 'btn btn--text', onclick: () => window.mowuiApp.open('settings') }, 'Change the host')
          )
        )
      )
    );
  })();

  return card;
}

// ---------------------------------------------------------------- installed

function installedSection(reload) {
  const box = h('div', { class: 'stack', style: { gap: '10px' } }, h('div', { class: 'muted' }, 'Reading installed models…'));

  (async () => {
    let models;
    try {
      models = await ollama.installed(host());
    } catch (e) {
      clear(box);
      box.append(h('div', { class: 'state state--bad' }, icon('warn'),
        h('div', { class: 'state__body' },
          h('div', { class: 'state__title' }, 'Installed models could not be read'),
          h('div', { class: 'state__text' }, e.message))));
      return;
    }

    clear(box);
    if (!models.length) {
      box.append(h('div', { class: 'pending' },
        h('strong', {}, 'No models are installed'),
        h('span', { class: 'muted', style: { fontSize: '.85rem', maxWidth: '52ch' } },
          'The daemon answered and reported an empty list. Pull one from the catalogue below and it will appear here.')));
      return;
    }

    for (const m of models) {
      box.append(h('div', { class: 'card', style: { display: 'flex', gap: '14px', alignItems: 'center', padding: '14px 18px' } },
        icon('server'),
        h('div', { class: 'stack', style: { gap: '3px', flex: '1', minWidth: '0' } },
          h('strong', { style: { fontSize: '.92rem' } }, m.name),
          h('span', { class: 'muted', style: { fontSize: '.76rem' } },
            [gb(m.sizeBytes), m.parameterSize, m.quantisation, m.family].filter(Boolean).join(' · '))
        ),
        h('button', {
          class: 'btn btn--text', style: { color: 'var(--err)' },
          onclick: () => ui.superConfirm({
            what: 'Delete ' + m.name,
            affects: 'The model blob (' + gb(m.sizeBytes) + ') is removed from the Ollama daemon on this machine. Downloading it again needs the network. Nothing else is touched.',
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
        }, icon('trash', 'icon icon--sm'), 'Delete')
      ));
    }
  })();

  return box;
}

// ---------------------------------------------------------------- catalogue

function catalogSection() {
  const wrap = h('div', { class: 'stack', style: { gap: '12px' } });
  const note = h('div', { class: 'state state--info' }, icon('info'), h('div', { class: 'state__body' }, h('div', { class: 'state__text' }, 'Fetching the published catalogue…')));
  const list = h('div', { class: 'stack', style: { gap: '8px' } });
  const count = h('div', { class: 'muted', style: { fontSize: '.78rem' } });

  const field = searchField({ placeholder: 'Search the catalogue…', label: 'Search the model catalogue' });

  let view = { source: 'none', catalog: { models: [] }, note: '' };

  function render() {
    const m = field.matcher();
    clear(list);
    const all = view.catalog.models || [];
    const matched = all.filter((x) => m.test(x.name));
    count.textContent = matched.length + ' of ' + all.length + ' models shown'
      + (view.catalog.pages ? ' · ' + view.catalog.pages + ' page(s) fetched' : '');

    if (!all.length) return;
    if (!matched.length) {
      list.append(h('div', { class: 'pending' }, h('strong', {}, 'No matches'), h('span', { class: 'muted', style: { fontSize: '.84rem' } }, 'Nothing in the catalogue matches that.')));
      return;
    }

    for (const model of matched.slice(0, 300)) {
      const bar = h('div', { class: 'bar', style: { display: 'none', marginTop: '8px' } }, h('div', { class: 'bar__fill', style: { width: '0%' } }));
      const status = h('span', { class: 'muted mono', style: { fontSize: '.72rem' } });

      const pullBtn = h('button', { class: 'btn btn--outlined' }, icon('download', 'icon icon--sm'), 'Pull');
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
            status.textContent = p.percent === null
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
          ui.notify('Cancelled the pull of ' + model.name + '. Whatever was already downloaded stays in the daemon\'s cache.', { kind: 'info' });
        } else if (!result.ok) {
          status.textContent = 'failed';
          ui.notify('The pull of ' + model.name + ' failed: ' + result.error, { kind: 'error' });
        } else {
          status.textContent = 'installed';
          state.log('Pull finished', model.name);
          ui.notify(model.name + ' is installed.', { kind: 'ok' });
        }
      });

      list.append(h('div', { class: 'card', style: { padding: '14px 18px' } },
        h('div', { class: 'row', style: { gap: '12px' } },
          icon('server'),
          h('div', { class: 'stack', style: { gap: '2px', flex: '1', minWidth: '0' } },
            h('strong', { style: { fontSize: '.9rem' } }, model.name),
            status
          ),
          pullBtn
        ),
        bar
      ));
    }
  }

  field.onChange(render);

  (async () => {
    const cached = ollama.cachedCatalog();
    const fresh = await ollama.fetchCatalog({});
    view = ollama.catalogView(fresh, cached);
    clear(note);
    note.className = 'state ' + (view.source === 'live' ? 'state--ok' : view.source === 'cached' ? 'state--info' : 'state--bad');
    note.append(
      icon(view.source === 'live' ? 'check' : view.source === 'cached' ? 'info' : 'warn'),
      h('div', { class: 'state__body' },
        h('div', { class: 'state__title' },
          view.source === 'live' ? 'Catalogue verified complete' : view.source === 'cached' ? 'Showing the last verified catalogue' : 'No catalogue to show'),
        h('div', { class: 'state__text' }, view.note))
    );
    render();
  })();

  wrap.append(note, field.el, count, list);
  return wrap;
}

// ---------------------------------------------------------------- hardware

function hardwareSection() {
  const card = h('div', { class: 'card', style: { marginBottom: '20px' } }, h('div', { class: 'muted' }, 'Probing this machine…'));

  (async () => {
    if (!desktop.isDesktop) {
      clear(card);
      card.append(h('div', { class: 'state state--info' }, icon('info'),
        h('div', { class: 'state__body' },
          h('div', { class: 'state__title' }, 'Hardware cannot be measured in a browser'),
          h('div', { class: 'state__text' },
            'RAM, GPU and free disk are read through the desktop shell. Running these files in an ordinary browser leaves them unknown, and a fit verdict without them would be a guess.'))));
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
      h('div', { class: 'stack', style: { gap: '2px' } },
        h('span', { class: 'muted', style: { fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.06em' } }, label),
        h('span', { style: { fontSize: '.88rem', fontWeight: '600' } }, value ?? 'Unknown'),
        why ? h('span', { class: 'muted', style: { fontSize: '.7rem', lineHeight: '1.5' } }, why) : null);

    add(card, 
      h('div', { class: 'row', style: { gap: '10px', marginBottom: '14px' } }, icon('pulse'), h('strong', {}, 'This machine')),
      h('div', { class: 'grid grid--3' },
        row('System memory', fact(hardware.totalRamBytes) ? gb(hardware.totalRamBytes.value) : null, hardware.totalRamBytes.known ? null : hardware.totalRamBytes.why),
        row('GPU', fact(hardware.gpuName), hardware.gpuName.known ? null : hardware.gpuName.why),
        row('GPU memory', fact(hardware.vramBytes) ? gb(hardware.vramBytes.value) : null, hardware.vramBytes.known ? null : hardware.vramBytes.why)
      ),
      hardware.notes.length
        ? h('div', { class: 'muted', style: { fontSize: '.74rem', marginTop: '12px', lineHeight: '1.6' } }, hardware.notes.join(' '))
        : null
    );
  })();

  return card;
}

// ---------------------------------------------------------------- page

export function render(root) {
  const page = h('div', { class: 'page' });

  const rebuild = () => {
    clear(page);
    page.append(
      h('div', { class: 'page__head' },
        h('div', { style: { flex: '1' } },
          h('div', { class: 'page__title' }, 'Ollama'),
          h('div', { class: 'page__sub' },
            'The daemon, what is installed, and the published catalogue. Every figure here comes from the local API or from this machine — nothing on this page is a placeholder.')
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
