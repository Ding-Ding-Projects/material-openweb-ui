// The built-in authenticator.
//
// Codes are computed here, from the system clock, with no network involved at
// any point — including registration, where a remote QR service would hand the
// secret to a stranger's server on the way to drawing it.
//
// One thing this build is deliberately honest about: the desktop shell does not
// expose an operating-system credential vault yet, and a secret written into a
// settings file is not storage, it is a leak with extra steps. So entries are
// held for the session and the surface says exactly that, rather than
// persisting secrets and calling them safe.

import { h, icon, clear } from '../../../docs/assets/js/dom.js';
import { searchField } from '../../../docs/assets/js/regex.js';
import * as ui from '../../../docs/assets/js/ui.js';
import * as totp from '../core/totp.js';
import * as state from '../state.js';

/** Session-only. Never written to disk — see the note at the top of this file. */
const entries = [];
let ticker = null;

function idFor() {
  return 'e' + Math.random().toString(36).slice(2, 9);
}

export function render(root) {
  const page = h('div', { class: 'page' });
  const list = h('div', { class: 'stack', style: { gap: '10px' } });
  const count = h('div', { class: 'muted', style: { fontSize: '.78rem' } });
  const field = searchField({ placeholder: 'Search entries…', label: 'Search authenticator entries' });

  // ---------- add ----------

  function addDialog() {
    const uriInput = h('input', { type: 'text', class: 'mono', placeholder: 'otpauth://totp/Issuer:account?secret=…', 'aria-label': 'otpauth URI' });
    const issuer = h('input', { type: 'text', placeholder: 'Issuer (optional)', 'aria-label': 'Issuer' });
    const account = h('input', { type: 'text', placeholder: 'Account', 'aria-label': 'Account' });
    const secret = h('input', { type: 'text', class: 'mono', placeholder: 'Base32 secret', 'aria-label': 'Secret' });
    const err = h('div', { style: { color: 'var(--err)', fontSize: '.8rem', minHeight: '18px' } });

    let algorithm = 'SHA1';
    let digits = 6;
    let period = 30;

    const algoSel = ui.select({ value: algorithm, options: [{ value: 'SHA1', label: 'SHA-1 (usual)' }, { value: 'SHA256', label: 'SHA-256' }, { value: 'SHA512', label: 'SHA-512' }], label: 'Algorithm', width: 190, onChange: (v) => { algorithm = v; } });
    const digitSel = ui.select({ value: digits, options: [{ value: 6, label: '6 digits (usual)' }, { value: 7, label: '7 digits' }, { value: 8, label: '8 digits' }], label: 'Digits', width: 170, onChange: (v) => { digits = Number(v); } });

    const d = ui.dialog({
      title: 'Add an entry',
      emoji: '🔐',
      wide: true,
      body: h('div', { class: 'stack', style: { gap: '14px' } },
        h('p', { class: 'muted', style: { fontSize: '.85rem' } },
          'Paste an otpauth:// URI and every parameter it carries is honoured — an issuer that asks for SHA-256 and eight digits means it, and quietly using the defaults produces codes it will reject.'),
        h('div', { class: 'field' }, uriInput),
        h('div', { class: 'row', style: { gap: '10px' } },
          h('button', { class: 'btn btn--outlined', onclick: () => {
            try {
              const p = totp.parseUri(uriInput.value);
              issuer.value = p.issuer; account.value = p.account; secret.value = p.secret;
              algorithm = p.algorithm; digits = p.digits; period = p.period;
              algoSel.set(algorithm); digitSel.set(digits);
              err.textContent = '';
              err.style.color = 'var(--ok)';
              err.textContent = 'Read: ' + p.algorithm + ', ' + p.digits + ' digits, ' + p.period + 's period.';
            } catch (e) {
              err.style.color = 'var(--err)';
              err.textContent = e.message;
            }
          } }, 'Read the URI')),
        h('hr'),
        h('div', { class: 'grid grid--2', style: { gap: '10px' } },
          h('div', { class: 'field' }, issuer),
          h('div', { class: 'field' }, account)),
        h('div', { class: 'field' }, secret),
        h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap' } }, algoSel.el, digitSel.el),
        err,
        h('div', { class: 'state state--info' }, icon('info'),
          h('div', { class: 'state__body' },
            h('div', { class: 'state__title' }, 'These entries last for this session only'),
            h('div', { class: 'state__text' },
              'The desktop shell does not expose the operating-system credential vault yet, and writing a one-time-code secret into a settings file would not be storage — it would be a leak with extra steps. So nothing here is written to disk, and closing the application forgets it.')))),
      actions: [
        { label: 'Cancel' },
        { label: 'Add', primary: true, run: () => {
          const s = secret.value.replace(/\s+/g, '');
          if (!s) { err.style.color = 'var(--err)'; err.textContent = 'A secret is required.'; return true; }
          try {
            totp.base32Decode(s).length || (() => { throw new Error('That secret is not valid Base32.'); })();
          } catch (e) {
            err.style.color = 'var(--err)'; err.textContent = e.message; return true;
          }
          entries.push({ id: idFor(), issuer: issuer.value.trim(), account: account.value.trim() || 'account', secret: s, algorithm, digits, period });
          state.log('Authenticator entry added', issuer.value.trim() || account.value.trim());
          paint();
        } }
      ]
    });
    return d;
  }

  // ---------- list ----------

  async function paint() {
    const m = field.matcher();
    clear(list);
    const matched = entries.filter((e) => m.test((e.issuer || '') + ' ' + e.account));
    count.textContent = matched.length + ' of ' + entries.length + ' entries shown';

    if (!entries.length) {
      list.append(h('div', { class: 'pending' },
        h('strong', {}, 'No entries yet'),
        h('span', { class: 'muted', style: { fontSize: '.85rem', maxWidth: '56ch' } },
          'Add one with an otpauth:// URI or by typing a Base32 secret. Codes are computed on this machine and no request leaves it.')));
      return;
    }

    for (const e of matched) {
      let code = '------';
      let next = '------';
      try {
        code = await totp.totp(e.secret, e);
        next = await totp.nextCode(e.secret, e);
      } catch { /* an invalid secret shows dashes rather than throwing */ }
      const left = totp.secondsRemaining(e.period);

      list.append(h('div', { class: 'card', dataset: { entry: e.id } },
        h('div', { class: 'row', style: { gap: '14px', flexWrap: 'wrap' } },
          h('div', { class: 'stack', style: { gap: '2px', flex: '1', minWidth: '160px' } },
            h('strong', { style: { fontSize: '.9rem' } }, e.issuer || e.account),
            h('span', { class: 'muted', style: { fontSize: '.76rem' } }, (e.issuer ? e.account + ' · ' : '') + e.algorithm + ' · ' + e.digits + ' digits · ' + e.period + 's')),
          h('div', { class: 'stack', style: { gap: '2px', alignItems: 'flex-end' } },
            h('div', { class: 'code-lg', 'aria-live': 'polite', 'aria-label': 'Current code' }, code.replace(/(\d{3})(?=\d)/, '$1 ')),
            // Never colour-only and never motion-only: the seconds are readable.
            h('div', { class: 'countdown' }, left + 's left · next ' + next)),
          h('div', { class: 'row', style: { gap: '6px' } },
            h('button', { class: 'btn btn--outlined', onclick: () => ui.copyToClipboard(code, 'Code copied.') }, 'Copy'),
            h('button', { class: 'btn btn--text', style: { color: 'var(--err)' }, onclick: () => ui.superConfirm({
              what: 'Delete ' + (e.issuer || e.account),
              affects: 'This entry and its secret are removed from memory. If you have no other copy of the secret, the account it belongs to becomes unreachable through this application.',
              onConfirm: () => {
                const i = entries.findIndex((x) => x.id === e.id);
                if (i >= 0) entries.splice(i, 1);
                state.log('Authenticator entry deleted', e.issuer || e.account);
                paint();
              }
            }) }, 'Delete'))
        )
      ));
    }
  }

  field.onChange(paint);

  // ---------- self check ----------

  const selfCheck = h('div', { class: 'card', style: { marginBottom: '20px' } }, h('div', { class: 'muted' }, 'Running the published test vectors…'));
  (async () => {
    const { ok, results } = await totp.verify();
    clear(selfCheck);
    selfCheck.append(h('div', { class: 'state ' + (ok ? 'state--ok' : 'state--bad') },
      icon(ok ? 'check' : 'warn'),
      h('div', { class: 'state__body' },
        h('div', { class: 'state__title' }, ok
          ? 'All ' + results.length + ' RFC 6238 test vectors pass'
          : 'This implementation disagrees with the published vectors'),
        h('div', { class: 'state__text' }, ok
          ? 'Checked at startup across SHA-1, SHA-256 and SHA-512. An authenticator that is subtly wrong emits digits every service refuses with no error to read, so this is verified rather than assumed.'
          : results.filter((r) => !r.pass).map((r) => r.algorithm + ' at t=' + r.time + ' gave ' + r.got + ', expected ' + r.expected).join('; ')))));
  })();

  // ---------- clock ----------

  const clock = h('div', { class: 'muted', style: { fontSize: '.78rem', marginTop: '10px' } });
  (async () => {
    const skew = await totp.clockSkewSeconds();
    if (skew === null) {
      clock.textContent = 'System-clock accuracy is unknown: this application is offline by design and did not check. If codes are being refused everywhere, the clock is the first thing to look at.';
    } else if (Math.abs(skew) <= 5) {
      clock.textContent = 'The system clock is within ' + Math.abs(skew) + 's of network time, which is well inside the tolerance every verifier allows.';
    } else {
      clock.textContent = 'The system clock is ' + Math.abs(skew) + 's ' + (skew > 0 ? 'ahead of' : 'behind') + ' network time. Codes will be refused until it is corrected — this is the failure nobody diagnoses, because the digits look perfectly fine.';
    }
  })();

  page.append(
    h('div', { class: 'page__head' },
      h('div', { style: { flex: '1' } },
        h('div', { class: 'page__title' }, 'Authenticator'),
        h('div', { class: 'page__sub' },
          'One-time codes for whatever accounts you like, computed on this machine. No account, no sync, and no request leaves this window.')),
      h('button', { class: 'btn btn--filled', onclick: addDialog }, icon('plus', 'icon icon--sm'), 'Add entry')),
    selfCheck,
    clock,
    h('div', { style: { height: '18px' } }),
    field.el,
    count,
    h('div', { style: { height: '10px' } }),
    list
  );

  root.append(page);
  paint();

  // One tick a second keeps the codes and the countdown honest.
  clearInterval(ticker);
  ticker = setInterval(() => { if (document.body.contains(page)) paint(); else clearInterval(ticker); }, 1000);
}

export const meta = { id: 'authenticator', title: 'Authenticator', zh: '驗證器', icon: 'phonelock' };
