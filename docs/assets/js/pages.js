// The site's pages. Each one is a tab, and the palette indexes all of them.

import { h, icon, clear, fmtTime, add } from './dom.js';
import { searchField } from './regex.js';
import * as ui from './ui.js';
import * as store from './store.js';
import * as i18n from './i18n.js';
import * as settings from './settings.js';
import { FEATURES, FEATURE_GROUPS, DOCS, CHANGELOG, STATUS, suggestedFor } from './content.js';

const REPO = 'https://github.com/Ding-Ding-Projects/material-openweb-ui';
const UPSTREAM = 'https://github.com/open-webui/open-webui';

function statusChip(state) {
  const s = STATUS[state] || STATUS.planned;
  const cls = s.tone === 'ok' ? 'chip chip--ok' : s.tone === 'warn' ? 'chip chip--warn' : 'chip chip--tonal';
  return h('span', { class: cls, style: { height: '24px', fontSize: '.68rem', padding: '0 10px' } }, s.label);
}

function sectionHead(title, body, extra) {
  return h('div', { class: 'row', style: { gap: '20px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '24px' } },
    h('div', { class: 'stack', style: { gap: '10px', flex: '1', minWidth: '260px' } },
      h('h2', {}, title),
      body ? h('p', { class: 'muted', style: { maxWidth: '68ch' } }, body) : null
    ),
    extra || null
  );
}

// ---------------------------------------------------------------- home

function home(root) {
  const bi = i18n.isBilingual();

  const hero = h('div', { class: 'row', style: { gap: '48px', alignItems: 'flex-start', flexWrap: 'wrap', padding: '64px 0 48px' } },
    h('div', { class: 'stack', style: { gap: '22px', flex: '1 1 460px', minWidth: '0', maxWidth: '620px' } },
      h('span', { class: 'chip' },
        h('span', { style: { width: '6px', height: '6px', borderRadius: '3px', background: 'var(--ter)' } }),
        i18n.t('home.eyebrow')
      ),
      h('h1', {}, i18n.t('home.h1')),
      bi ? h('div', { class: 'cjk muted', style: { fontSize: '1.45rem', fontWeight: '600', lineHeight: '1.35' } }, i18n.t2('home.h1')) : null,
      h('p', { class: 'muted', style: { fontSize: '1.05rem' } }, i18n.t('home.sub')),
      bi ? h('p', { class: 'cjk muted', style: { fontSize: '.92rem', borderLeft: '2px solid var(--outv)', paddingLeft: '14px', lineHeight: '1.85' } }, i18n.t2('home.sub')) : null,
      h('div', { class: 'row', style: { gap: '12px', flexWrap: 'wrap', marginTop: '4px' } },
        h('button', { class: 'btn btn--filled btn--lg', onclick: () => window.mowui.open('docs') },
          i18n.t('home.cta.docs'), icon('arrow', 'icon icon--sm')),
        h('a', { class: 'btn btn--outlined btn--lg', href: REPO, rel: 'noopener' },
          icon('github', 'icon icon--sm'), i18n.t('home.cta.src'))
      ),
      // The download control is off and says why. It never points at a guessed URL.
      h('div', { class: 'notice', style: { flexDirection: 'column', gap: '14px' } },
        h('div', { class: 'row', style: { gap: '12px', alignItems: 'flex-start' } },
          icon('warn'),
          h('div', { class: 'stack', style: { gap: '4px' } },
            h('strong', {}, i18n.t('home.norelease.title')),
            h('span', { style: { fontSize: '.86rem', lineHeight: '1.55' } }, i18n.t('home.norelease.body'))
          )
        ),
        h('button', {
          class: 'btn', 'aria-disabled': 'true', disabled: true,
          style: { width: '100%', color: 'inherit', borderColor: 'currentColor' }
        }, icon('download', 'icon icon--sm'), i18n.t('home.download.off'))
      )
    ),
    h('div', { class: 'stack', style: { gap: '12px', flex: '1 1 420px', minWidth: '0' } },
      h('div', { class: 'pending', style: { minHeight: '300px' } },
        icon('image', 'icon icon--lg'),
        h('strong', {}, i18n.t('home.capture.title')),
        h('span', { style: { fontSize: '.86rem', maxWidth: '42ch' } }, i18n.t('home.capture.body'))
      ),
      h('div', { class: 'grid grid--3' },
        ...['Ollama manager', 'File converter', 'Light theme'].map((label) =>
          h('div', { class: 'pending', style: { minHeight: '84px', padding: '12px', fontSize: '.72rem' } }, label + ' — pending'))
      )
    )
  );

  const dest = h('section', { class: 'section section--tint' },
    h('div', { class: 'wrap' },
      sectionHead(i18n.t('home.dest.title'), i18n.t('home.dest.body'),
        h('span', { class: 'chip chip--tonal mono' }, i18n.t('palette.hint'))),
      h('div', { class: 'grid grid--3' },
        ...FEATURES.filter((f) => ['chat', 'grid', 'shield', 'server', 'swap', 'phonelock', 'gear', 'pulse', 'clock'].includes(f.icon))
          .slice(0, 9)
          .map((f) => h('button', {
            class: 'card', style: { textAlign: 'left', cursor: 'pointer', border: 0, font: 'inherit', color: 'inherit' },
            onclick: () => window.mowui.open('docs', f.id)
          },
            h('div', { class: 'row', style: { gap: '12px', marginBottom: '12px' } },
              h('span', { style: { width: '40px', height: '40px', borderRadius: '14px', background: 'var(--secc)', color: 'var(--onsecc)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' } }, icon(f.icon)),
              h('span', { style: { fontWeight: '600', flex: '1' } }, f.name),
              statusChip(f.app)
            ),
            h('span', { class: 'muted', style: { fontSize: '.85rem', lineHeight: '1.6' } }, f.blurb)
          ))
      )
    )
  );

  const why = h('section', { class: 'section' },
    h('div', { class: 'wrap' },
      sectionHead(i18n.t('home.why.title')),
      h('div', { class: 'grid grid--2' },
        ...[
          ['desktop', 'It runs where you are sitting', 'Chats, settings, one-time codes and converted files stay in the application on the machine you used. There is no account to make, and nothing you have to switch off to keep it that way.'],
          ['language', 'English and Cantonese, side by side', 'Three language modes, and a funny-level slider for each language from fully serious to maximum playfulness. The voice changes; the facts never do.'],
          ['lock', 'Locks you set for yourself', 'Any tab or element takes its own password or one-time-code lock with its own credential. The product calls that a speed bump rather than protection, because that is what it is.'],
          ['check', 'Nothing on screen is decoration', 'If it looks like a control, it works. A button that cannot do its job names the condition that is unmet, and an empty state stays honestly empty rather than being filled with sample data.']
        ].map(([ic, name, body]) => h('div', { class: 'card card--outlined', style: { display: 'flex', gap: '16px' } },
          h('span', { style: { width: '44px', height: '44px', borderRadius: '15px', background: 'var(--pc)', color: 'var(--onpc)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' } }, icon(ic)),
          h('div', { class: 'stack', style: { gap: '7px' } },
            h('strong', { style: { fontSize: '1.02rem' } }, name),
            h('span', { class: 'muted', style: { fontSize: '.9rem', lineHeight: '1.65' } }, body)
          )
        ))
      )
    )
  );

  root.append(h('div', { class: 'wrap' }, hero), dest, why);
}

// ---------------------------------------------------------------- features

function features(root) {
  const wrap = h('div', { class: 'wrap section' });
  const list = h('div', { class: 'stack', style: { gap: '28px' } });
  const countEl = h('div', { class: 'muted', style: { fontSize: '.8rem' } });

  const field = searchField({
    placeholder: 'Search every feature…',
    label: 'Search features',
    sampleFrom: () => FEATURES.map((f) => f.name)
  });

  let group = 'All';
  const groupBtn = h('button', { class: 'btn btn--outlined', 'aria-haspopup': 'listbox' }, 'All groups', icon('arrow', 'icon icon--sm'));
  groupBtn.addEventListener('click', () => {
    ui.menu(groupBtn, ['All', ...FEATURE_GROUPS].map((g) => ({
      label: g, icon: g === group ? 'check' : undefined,
      run: () => { group = g; groupBtn.firstChild.textContent = g === 'All' ? 'All groups' : g; render(); }
    })), { label: 'Filter by group', filterPlaceholder: 'Filter groups…' });
  });

  function render() {
    const m = field.matcher();
    clear(list);
    const matched = FEATURES.filter((f) =>
      (group === 'All' || f.group === group) &&
      m.test(f.name + ' ' + f.blurb + ' ' + f.group)
    );
    countEl.textContent = matched.length + ' of ' + FEATURES.length + ' features shown'
      + (m.ok ? '' : ' — that pattern is not valid yet');

    if (!matched.length) {
      list.appendChild(h('div', { class: 'pending' }, h('strong', {}, i18n.t('empty.noMatch')), h('span', { class: 'muted', style: { fontSize: '.85rem' } }, i18n.t('empty.noMatchHint'))));
      return;
    }
    for (const g of FEATURE_GROUPS) {
      const items = matched.filter((f) => f.group === g);
      if (!items.length) continue;
      list.appendChild(h('div', { class: 'stack', style: { gap: '12px' } },
        h('h3', { class: 'muted', style: { textTransform: 'uppercase', letterSpacing: '.08em', fontSize: '.72rem' } }, g),
        h('div', { class: 'grid grid--2' },
          ...items.map((f) => h('button', {
            class: 'card card--outlined', id: 'feature-' + f.id,
            style: { textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit', display: 'flex', flexDirection: 'column', gap: '10px' },
            onclick: () => window.mowui.open('docs', f.id)
          },
            h('div', { class: 'row', style: { gap: '10px' } },
              icon(f.icon),
              h('strong', { style: { flex: '1' } }, f.name)
            ),
            h('span', { class: 'muted', style: { fontSize: '.86rem', lineHeight: '1.6' } }, f.blurb),
            h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } },
              h('span', { class: 'muted', style: { fontSize: '.7rem' } }, 'site:'), statusChip(f.site),
              h('span', { class: 'muted', style: { fontSize: '.7rem', marginLeft: '6px' } }, 'app:'), statusChip(f.app)
            )
          ))
        )
      ));
    }
  }

  field.onChange(render);

  wrap.append(
    sectionHead('Every feature', 'The whole list, not a highlight reel — including the ones that are not built yet, marked as such. Status is stated per surface, because this site and the desktop application are at different stages.',
      h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap' } }, groupBtn)),
    h('div', { class: 'stack', style: { gap: '10px', marginBottom: '24px' } }, field.el, countEl),
    list
  );
  root.appendChild(wrap);
  render();
}

// ---------------------------------------------------------------- docs

function docs(root, articleId) {
  const wrap = h('div', { class: 'wrap section' });

  if (articleId) {
    const a = DOCS.find((d) => d.id === articleId);
    if (a) {
      wrap.append(
        h('button', { class: 'btn btn--text', style: { marginBottom: '18px' }, onclick: () => window.mowui.open('docs') },
          icon('arrow', 'icon icon--sm'), 'All articles'),
        h('div', { class: 'stack', style: { gap: '18px', maxWidth: '78ch' } },
          h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap' } },
            h('span', { class: 'chip chip--tonal' }, a.group),
            h('span', { class: 'muted', style: { fontSize: '.72rem' } }, 'site:'), statusChip(a.site),
            h('span', { class: 'muted', style: { fontSize: '.72rem' } }, 'app:'), statusChip(a.app)
          ),
          h('h1', { style: { fontSize: '2.1rem' } }, a.title),
          h('p', { style: { fontSize: '1.05rem' } }, a.blurb),
          h('h3', {}, 'Behaviour'),
          h('p', { class: 'muted' }, a.detail),
          h('h3', {}, 'How to verify it'),
          h('div', { class: 'notice notice--info' }, icon('check'), h('p', {}, a.verify)),
          h('h3', {}, 'Suggested articles'),
          h('div', { class: 'grid grid--2' },
            ...suggestedFor(a.id).map((s) => h('button', {
              class: 'card card--outlined', style: { textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' },
              onclick: () => window.mowui.open('docs', s.id)
            },
              h('strong', {}, s.title),
              h('div', { class: 'muted', style: { fontSize: '.82rem', marginTop: '6px' } }, s.group)
            ))
          )
        )
      );
      root.appendChild(wrap);
      return;
    }
  }

  const list = h('div', { class: 'stack', style: { gap: '10px' } });
  const countEl = h('div', { class: 'muted', style: { fontSize: '.8rem' } });
  const field = searchField({ placeholder: 'Search the documentation…', label: 'Search documentation', sampleFrom: () => DOCS.map((d) => d.title) });

  function render() {
    const m = field.matcher();
    clear(list);
    const matched = DOCS.filter((d) => m.test(d.title + ' ' + d.blurb + ' ' + d.detail + ' ' + d.group));
    countEl.textContent = matched.length + ' of ' + DOCS.length + ' articles shown';
    if (!matched.length) {
      list.appendChild(h('div', { class: 'pending' }, h('strong', {}, i18n.t('empty.noMatch')), h('span', { class: 'muted', style: { fontSize: '.85rem' } }, i18n.t('empty.noMatchHint'))));
      return;
    }
    for (const d of matched) {
      list.appendChild(h('button', {
        class: 'card', style: { textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit', display: 'flex', gap: '14px', alignItems: 'flex-start' },
        onclick: () => window.mowui.open('docs', d.id)
      },
        icon('book'),
        h('div', { class: 'stack', style: { gap: '5px', flex: '1' } },
          h('strong', {}, d.title),
          h('span', { class: 'muted', style: { fontSize: '.85rem', lineHeight: '1.6' } }, d.blurb)
        ),
        h('span', { class: 'chip chip--tonal', style: { height: '24px', fontSize: '.68rem' } }, d.group)
      ));
    }
  }
  field.onChange(render);

  wrap.append(
    sectionHead('Documentation', 'One article per feature: what it does, how it behaves, how it fails, and how to check it for yourself. Every article ends with somewhere sensible to go next.'),
    h('div', { class: 'stack', style: { gap: '10px', marginBottom: '22px' } }, field.el, countEl),
    list
  );
  root.appendChild(wrap);
  render();
}

// ---------------------------------------------------------------- changelog

function changelog(root) {
  const wrap = h('div', { class: 'wrap section' });
  const list = h('div', { class: 'stack', style: { gap: '20px' } });
  const countEl = h('div', { class: 'muted', style: { fontSize: '.8rem' } });
  const field = searchField({ placeholder: 'Search the changelog…', label: 'Search changelog', sampleFrom: () => CHANGELOG.flatMap((v) => v.sections.flatMap((s) => s.items.map((i) => i.text))) });

  const from = h('input', { type: 'date', 'aria-label': 'From date', class: 'mono', style: { border: 0, background: 'transparent', outline: 'none', color: 'var(--ons)' }, onchange: render });
  const to = h('input', { type: 'date', 'aria-label': 'To date', class: 'mono', style: { border: 0, background: 'transparent', outline: 'none', color: 'var(--ons)' }, onchange: render });

  function inRange(dateStr) {
    if (from.value && dateStr < from.value) return false;
    if (to.value && dateStr > to.value) return false;
    return true;
  }

  function currentView() {
    const m = field.matcher();
    return CHANGELOG
      .filter((v) => inRange(v.date))
      .map((v) => ({
        ...v,
        sections: v.sections
          .map((s) => ({ ...s, items: s.items.filter((it) => m.test(it.text)) }))
          .filter((s) => s.items.length)
      }))
      .filter((v) => v.sections.length);
  }

  function render() {
    const view = currentView();
    clear(list);
    const total = CHANGELOG.reduce((n, v) => n + v.sections.reduce((k, s) => k + s.items.length, 0), 0);
    const shown = view.reduce((n, v) => n + v.sections.reduce((k, s) => k + s.items.length, 0), 0);
    countEl.textContent = shown + ' of ' + total + ' entries shown across ' + view.length + ' version(s)';

    if (!view.length) {
      list.appendChild(h('div', { class: 'pending' }, h('strong', {}, i18n.t('empty.noMatch')), h('span', { class: 'muted', style: { fontSize: '.85rem' } }, 'No entry matches that search and date range together.')));
      return;
    }

    for (const v of view) {
      list.appendChild(h('div', { class: 'card', style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
        h('div', { class: 'row', style: { gap: '12px', flexWrap: 'wrap' } },
          h('strong', { style: { fontSize: '1.15rem' } }, 'v' + v.version),
          h('span', { class: 'chip chip--tonal mono' }, v.date),
          v.codename ? h('span', { class: 'chip' }, v.codename) : h('span', { class: 'muted', style: { fontSize: '.74rem' } }, 'no dim sum code name assigned yet')
        ),
        ...v.sections.map((s) => h('div', { class: 'stack', style: { gap: '8px' } },
          h('div', { class: 'muted', style: { fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: '700' } }, s.title),
          ...s.items.map((it) => h('div', { style: { display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '.88rem', lineHeight: '1.6' } },
            h('span', { style: { color: 'var(--p)' } }, '·'),
            h('span', { style: { flex: '1' } }, it.text),
            it.sha
              ? h('a', { class: 'mono', href: REPO + '/commit/' + it.sha, rel: 'noopener', style: { fontSize: '.72rem', flex: 'none' }, title: it.sha }, it.sha.slice(0, 9))
              : null
          ))
        ))
      ));
    }
  }

  field.onChange(render);

  const exportBtn = h('button', { class: 'btn btn--outlined' }, icon('download', 'icon icon--sm'), i18n.t('action.export'));
  exportBtn.addEventListener('click', () => {
    ui.menu(exportBtn, [
      { label: 'Markdown (.md)', run: () => exportAs('md') },
      { label: 'Plain text (.txt)', run: () => exportAs('txt') },
      { label: 'JSON (.json)', run: () => exportAs('json') }
    ], { label: 'Export changelog', filterPlaceholder: 'Filter formats…' });
  });

  function exportAs(fmt) {
    const view = currentView();
    const range = (from.value || 'the first release') + ' to ' + (to.value || 'the latest release');
    if (fmt === 'json') {
      ui.downloadFile('changelog.json', JSON.stringify({ schema: 'material-open-webui.changelog', version: 1, range, versions: view }, null, 2), 'application/json');
    } else {
      const lines = ['# Changelog', '', 'Exported range: ' + range + '. Filter and search applied at export time.', ''];
      for (const v of view) {
        lines.push('## v' + v.version + ' — ' + v.date, '');
        for (const s of v.sections) {
          lines.push('### ' + s.title, '');
          for (const it of s.items) lines.push('- ' + it.text + (it.sha ? ' (' + it.sha + ')' : ''));
          lines.push('');
        }
      }
      ui.downloadFile('changelog.' + fmt, lines.join('\n'), 'text/' + (fmt === 'md' ? 'markdown' : 'plain'));
    }
    ui.notify('Changelog exported for ' + range + '.', { kind: 'ok' });
  }

  wrap.append(
    sectionHead('Changelog', 'Every released version, filterable by date and searchable by pattern. Each entry links to the commit that made the change, because an entry that says what changed but not where is unverifiable.',
      h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap' } }, exportBtn)),
    h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap', marginBottom: '14px' } },
      h('div', { class: 'field', style: { width: 'auto' } }, h('span', { class: 'muted', style: { fontSize: '.78rem' } }, 'From'), from),
      h('div', { class: 'field', style: { width: 'auto' } }, h('span', { class: 'muted', style: { fontSize: '.78rem' } }, 'To'), to),
      h('button', { class: 'btn btn--text', onclick: () => { from.value = ''; to.value = ''; render(); } }, 'Clear dates')
    ),
    h('div', { class: 'stack', style: { gap: '10px', marginBottom: '22px' } }, field.el, countEl),
    list
  );
  root.appendChild(wrap);
  render();
}

// ---------------------------------------------------------------- settings

function settingsPage(root) {
  const wrap = h('div', { class: 'wrap section' });
  const list = h('div', { class: 'stack' });
  const countEl = h('div', { class: 'muted', style: { fontSize: '.8rem' } });
  const field = searchField({ placeholder: 'Search these settings…', label: 'Search settings', sampleFrom: () => settings.visibleRows().map((r) => r.label()) });

  function render() {
    const m = field.matcher();
    clear(list);
    const rows = settings.visibleRows().filter((r) => m.test(r.label() + ' ' + r.why() + ' ' + r.section));
    countEl.textContent = rows.length + ' of ' + settings.visibleRows().length + ' settings shown';
    if (!rows.length) {
      list.appendChild(h('div', { class: 'pending' }, h('strong', {}, i18n.t('empty.noMatch')), h('span', { class: 'muted', style: { fontSize: '.85rem' } }, i18n.t('empty.noMatchHint'))));
      return;
    }
    const sections = [...new Set(rows.map((r) => r.section))];
    for (const s of sections) {
      list.appendChild(h('h3', { style: { marginTop: '26px', marginBottom: '2px' } }, s));
      for (const r of rows.filter((x) => x.section === s)) {
        list.appendChild(settings.renderRow(r, () => window.mowui.refresh()).el);
      }
    }
  }
  field.onChange(render);

  const disclosure = h('div', { class: 'notice notice--info', style: { marginBottom: '22px' } },
    icon('info'),
    h('div', { class: 'stack', style: { gap: '6px' } },
      h('strong', {}, 'About the funny level'),
      h('p', { style: { fontSize: '.86rem', lineHeight: '1.6' } }, i18n.FUNNY_DISCLOSURE.en),
      h('p', { class: 'cjk', style: { fontSize: '.84rem', lineHeight: '1.75', opacity: '.85' } }, i18n.FUNNY_DISCLOSURE.zh)
    )
  );

  const dangerZone = h('div', { class: 'card card--outlined', style: { marginTop: '36px', display: 'flex', flexDirection: 'column', gap: '14px' } },
    h('strong', {}, i18n.t('set.reset')),
    h('p', { class: 'muted', style: { fontSize: '.86rem', lineHeight: '1.6' } }, i18n.t('set.resetWhy')),
    h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap' } },
      h('button', {
        class: 'btn btn--outlined',
        onclick: () => {
          const b = store.exportBundle();
          ui.downloadFile('material-open-webui-site-state.json', JSON.stringify(b, null, 2), 'application/json');
          ui.notify('Exported. Lock credentials, authenticator secrets and vocabulary contents were deliberately omitted — the file says so.', { kind: 'ok', persist: true });
        }
      }, icon('download', 'icon icon--sm'), 'Export everything first'),
      h('button', {
        class: 'btn btn--danger',
        onclick: () => ui.superConfirm({
          what: 'Reset this site',
          affects: 'Every preference, lock, authenticator entry, support ticket, notification and history record this site has stored in this browser. Nothing on the server changes, because there is nothing on a server.',
          onConfirm: () => { store.clearAll(); location.reload(); }
        })
      }, icon('trash', 'icon icon--sm'), i18n.t('set.reset'))
    )
  );

  wrap.append(
    sectionHead(i18n.t('set.title'), i18n.t('set.intro')),
    disclosure,
    h('div', { class: 'stack', style: { gap: '10px', marginBottom: '10px' } }, field.el, countEl),
    list,
    dangerZone
  );
  root.appendChild(wrap);
  render();
}

// ---------------------------------------------------------------- status

function status(root) {
  const wrap = h('div', { class: 'wrap section' });
  const log = h('div', { class: 'stack', style: { gap: '8px' } });
  const countEl = h('div', { class: 'muted', style: { fontSize: '.8rem' } });
  const field = searchField({ placeholder: 'Search the event log…', label: 'Search event log', sampleFrom: () => store.history().map((e) => e.label) });

  const selected = new Set();
  let actionFilter = null;

  const actionBtn = h('button', { class: 'btn btn--outlined' }, 'All actions', icon('arrow', 'icon icon--sm'));
  actionBtn.addEventListener('click', () => {
    const acts = store.historyActions();
    ui.menu(actionBtn, [
      { label: 'All actions (' + store.history().length + ')', icon: actionFilter === null ? 'check' : undefined, run: () => { actionFilter = null; actionBtn.firstChild.textContent = 'All actions'; render(); } },
      ...acts.map((a) => ({
        label: a.action + ' (' + a.count + ')',
        icon: actionFilter === a.action ? 'check' : undefined,
        run: () => { actionFilter = a.action; actionBtn.firstChild.textContent = a.action; render(); }
      }))
    ], { label: 'Filter by action', filterPlaceholder: 'Filter actions…' });
  });

  function view() {
    const m = field.matcher();
    return store.history().filter((e) =>
      (!actionFilter || e.action === actionFilter) &&
      m.test(e.label + ' ' + e.action)
    );
  }

  function render() {
    const rows = view();
    clear(log);
    countEl.textContent = rows.length + ' of ' + store.history().length + ' entries shown';
    if (!rows.length) {
      log.appendChild(h('div', { class: 'pending' },
        h('strong', {}, store.history().length ? i18n.t('empty.noMatch') : 'Nothing has happened yet.'),
        h('span', { class: 'muted', style: { fontSize: '.85rem' } },
          store.history().length ? 'No entry matches that action filter and search together.' : 'Change a setting and it will appear here. This log records what actually happened, not what was expected to.')
      ));
      return;
    }
    for (const e of rows) {
      const cb = h('input', {
        type: 'checkbox', 'aria-label': 'Select ' + e.label, style: { accentColor: 'var(--p)' },
        checked: selected.has(e.id),
        onchange: (ev) => { ev.target.checked ? selected.add(e.id) : selected.delete(e.id); sync(); }
      });
      log.appendChild(h('div', { class: 'card', style: { display: 'flex', gap: '12px', alignItems: 'center', padding: '12px 16px' } },
        cb,
        h('span', { class: 'chip chip--tonal', style: { height: '24px', fontSize: '.66rem' } }, e.action),
        h('span', { style: { flex: '1', fontSize: '.86rem' } }, e.label),
        h('span', { class: 'mono muted', style: { fontSize: '.7rem' } }, fmtTime(e.t)),
        e.detail && e.detail.key ? h('button', { class: 'btn btn--text', style: { height: '32px' }, onclick: () => { store.restore(e.id); ui.notify('Restored, and the restore is itself a new entry so it can be undone in turn.', { kind: 'ok' }); window.mowui.refresh(); } }, 'Restore') : null
      ));
    }
  }

  const bulkBar = h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap' } });
  function sync() {
    clear(bulkBar);
    const rows = view();
    add(bulkBar, 
      h('button', { class: 'btn btn--text', onclick: () => { rows.forEach((r) => selected.add(r.id)); render(); sync(); } }, 'Select all ' + rows.length + ' matching'),
      h('button', { class: 'btn btn--text', onclick: () => { rows.forEach((r) => selected.has(r.id) ? selected.delete(r.id) : selected.add(r.id)); render(); sync(); } }, 'Invert'),
      h('button', { class: 'btn btn--text', onclick: () => { selected.clear(); render(); sync(); } }, 'Clear'),
      selected.size ? h('span', { class: 'chip' }, selected.size + ' selected') : null,
      selected.size ? h('button', {
        class: 'btn btn--outlined',
        onclick: () => {
          const rows2 = store.history().filter((e) => selected.has(e.id));
          ui.downloadFile('event-log.json', JSON.stringify({ schema: 'material-open-webui.event-log', version: 1, exported: rows2.length, entries: rows2 }, null, 2), 'application/json');
          ui.notify('Exported ' + rows2.length + ' selected entries, honouring the current filter.', { kind: 'ok' });
        }
      }, icon('download', 'icon icon--sm'), 'Export selected') : null
    );
  }

  field.onChange(() => { render(); sync(); });

  const session = h('div', { class: 'card', style: { display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' } },
    h('div', { class: 'row', style: { gap: '10px' } }, icon('pulse'), h('strong', {}, 'This session')),
    h('div', { class: 'grid grid--3', style: { gap: '12px' } },
      ...[
        ['Surface', 'Documentation site'],
        ['Storage', 'This browser only'],
        ['Network calls', 'None'],
        ['Language', store.get('settings').language],
        ['Theme', store.get('settings').theme],
        ['Recorded events', String(store.history().length)]
      ].map(([k, v]) => h('div', { class: 'stack', style: { gap: '2px' } },
        h('span', { class: 'muted', style: { fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.06em' } }, k),
        h('span', { style: { fontSize: '.9rem', fontWeight: '600' } }, v)
      ))
    )
  );

  wrap.append(
    sectionHead('Status', 'A live session card and the real event log. Every feature on this site writes to it, so what you read here is what happened rather than what was meant to.',
      h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap' } }, actionBtn)),
    session,
    h('div', { class: 'stack', style: { gap: '10px', marginBottom: '16px' } }, field.el, countEl, bulkBar),
    log
  );
  root.appendChild(wrap);
  render();
  sync();
}

// ---------------------------------------------------------------- registry

import * as download from './download.js';

export const PAGES = {
  home:      { title: () => i18n.t('nav.home'),      zh: '主頁',     icon: 'chat',    render: home },
  features:  { title: () => i18n.t('nav.features'),  zh: '功能',     icon: 'grid',    render: features },
  docs:      { title: () => i18n.t('nav.docs'),      zh: '說明',     icon: 'book',    render: docs },
  changelog: { title: () => i18n.t('nav.changelog'), zh: '更新紀錄', icon: 'clock',   render: changelog },
  settings:  { title: () => i18n.t('nav.settings'),  zh: '設定',     icon: 'gear',    render: settingsPage },
  status:    { title: () => i18n.t('nav.status'),    zh: '狀態',     icon: 'pulse',   render: status },
  download:  { title: () => i18n.t('nav.download'),  zh: '下載',     icon: 'download', render: download.render }
};

export const PAGE_ORDER = ['home', 'features', 'docs', 'download', 'changelog', 'settings', 'status'];
export { REPO, UPSTREAM };
