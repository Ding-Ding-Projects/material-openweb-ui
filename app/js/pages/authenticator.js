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
import * as qr from '../core/qr.js';
import * as state from '../state.js';

/** Session-only. Never written to disk — see the note at the top of this file. */
const entries = [];
let ticker = null;

/**
 * A code, broken into groups small enough to read across.
 *
 * Six splits as 3+3 and seven or eight as 4+3 and 4+4, which is how a person
 * transcribing one actually chunks it. The first version used a single
 * non-global replace, which grouped six correctly and left "123 4567" and
 * "123 45678" for the lengths the feature explicitly offers.
 */
export function groupCode(code) {
  const text = String(code);
  if (text.length <= 6) return text.replace(/(\d{3})(?=\d)/g, '$1 ');
  return text.slice(0, 4) + ' ' + text.slice(4);
}

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
    // The engine has always supported an arbitrary period and an imported URI
    // has always carried one through; there was simply no way to type one, so a
    // hand-entered secret was silently pinned to thirty seconds.
    const periodInput = h('input', {
      type: 'number', min: '1', max: '3600', step: '1', value: String(period),
      'aria-label': 'Period in seconds',
      oninput: (e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v > 0) period = Math.round(v); }
    });
    const periodField = h('label', { class: 'field-labelled' },
      h('span', {}, 'Period (seconds)'), periodInput);

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
              algoSel.set(algorithm); digitSel.set(digits); periodInput.value = String(period);
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
        h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' } }, algoSel.el, digitSel.el, periodField),
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


  // ---------- pair a new factor ----------
  //
  // The QR is drawn in this process from local code. A third-party QR service
  // or a remote chart API would hand the secret to a stranger's server on the
  // way to rendering it, which is a strange price to pay for a picture.

  function pairDialog() {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    const secret = totp.base32Encode(bytes);
    const issuer = h('input', { type: 'text', value: 'Material Open WebUI', 'aria-label': 'Issuer' });
    const account = h('input', { type: 'text', placeholder: 'you@example.test', 'aria-label': 'Account' });
    const confirm = h('input', { type: 'text', class: 'mono', placeholder: 'Type the current code', 'aria-label': 'Confirmation code' });
    const err = h('div', { style: { color: 'var(--err)', fontSize: '.8rem', minHeight: '18px' } });
    const qrBox = h('div', { style: { background: '#FFFFFF', padding: '10px', borderRadius: '12px', width: 'fit-content' } });
    const secretBox = h('div', { class: 'mono', style: { fontSize: '.9rem', letterSpacing: '.08em', userSelect: 'all', filter: 'blur(5px)', cursor: 'pointer' }, title: 'Click to reveal' }, totp.groupSecret(secret));

    // Revealed only on an explicit action, never on the surface by default.
    secretBox.addEventListener('click', () => { secretBox.style.filter = 'none'; secretBox.style.cursor = 'text'; });

    function paintQr() {
      const uri = totp.buildUri({ issuer: issuer.value.trim(), account: account.value.trim() || 'account', secret });
      let matrix;
      try {
        matrix = qr.encode(uri);
      } catch (e) {
        // A long enough issuer overruns the encoder. Saying so beats throwing on
        // every keystroke and leaving the last good code on screen, which would
        // be a picture of a different URI than the one it claims to show.
        clear(qrBox);
        qrBox.append(h('div', { style: { color: '#B3261E', fontSize: '.78rem', maxWidth: '180px', padding: '20px 4px' } },
          'Too long to draw: ' + e.message));
        return;
      }
      qrBox.innerHTML = qr.toSvg(matrix, { moduleSize: 4, quiet: 4 });
      qrBox.firstChild.setAttribute('role', 'img');
      qrBox.firstChild.setAttribute('aria-label',
        'A QR code pairing ' + (account.value.trim() || 'this account') + ' with ' + (issuer.value.trim() || 'this application') +
        '. The same secret is printed beside it for anyone who cannot scan it.');
    }
    issuer.addEventListener('input', paintQr);
    account.addEventListener('input', paintQr);
    paintQr();

    const d = ui.dialog({
      title: 'Pair an authenticator',
      emoji: '📷',
      wide: true,
      body: h('div', { class: 'stack', style: { gap: '14px' } },
        h('p', { class: 'muted', style: { fontSize: '.86rem', lineHeight: '1.6' } },
          'The secret was generated on this machine a moment ago. The code below is drawn here too — no request is made anywhere in this flow.'),
        h('div', { class: 'grid grid--2', style: { gap: '10px' } },
          h('div', { class: 'field' }, issuer), h('div', { class: 'field' }, account)),
        h('div', { class: 'row', style: { gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' } },
          qrBox,
          h('div', { class: 'stack', style: { gap: '8px', flex: '1', minWidth: '220px' } },
            h('strong', { style: { fontSize: '.85rem' } }, 'Or type it in'),
            secretBox,
            h('div', { class: 'muted', style: { fontSize: '.75rem' } }, 'Click to reveal. SHA-1, 6 digits, 30-second period.'),
            h('button', { class: 'btn btn--outlined', onclick: () => ui.copyToClipboard(secret, 'Secret copied.') }, 'Copy the secret'))),
        h('hr'),
        h('div', { class: 'stack', style: { gap: '8px' } },
          h('strong', { style: { fontSize: '.85rem' } }, 'Confirm the pairing'),
          h('p', { class: 'muted', style: { fontSize: '.8rem', lineHeight: '1.55' } },
            'Type one current code back. Without this step a mistyped or mis-scanned secret locks you out of something you have just set up, and the first you learn of it is when you need it.'),
          h('div', { class: 'field' }, confirm),
          err)),
      actions: [
        { label: 'Cancel' },
        { label: 'Confirm and add', primary: true, run: () => {
          // A code is checked against this window and the one either side, for
          // the same reason verification does: a machine a few seconds out of
          // step is the normal case, not an attack.
          Promise.all([-1, 0, 1].map((w) => totp.totp(secret, { atMs: Date.now() + w * 30000 }))).then((allowed) => {
            if (!allowed.includes(confirm.value.replace(/\s+/g, ''))) {
              err.textContent = 'That code does not match. Give the authenticator a moment to finish adding it, then type the code it is showing now.';
              return;
            }
            entries.push({ id: idFor(), issuer: issuer.value.trim(), account: account.value.trim() || 'account', secret, algorithm: 'SHA1', digits: 6, period: 30 });
            state.log('Authenticator paired', issuer.value.trim() || account.value.trim());
            ui.notify('Paired, and confirmed against a live code.', { kind: 'ok' });
            paint();
            d.close();
          });
          // Held open on purpose: the check is asynchronous, and a dialog that
          // shuts before it finishes would report success it has not had yet.
          return true;
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
            h('div', { class: 'code-lg', 'aria-live': 'polite', 'aria-label': 'Current code' }, groupCode(code)),
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

  const clock = h('div', { class: 'clock', role: 'status' });

  /**
   * Two different questions, reported as two different facts.
   *
   * "Is this clock right?" needs the network and cannot be answered offline,
   * which is this application's normal state. "Did this clock just move?" needs
   * nothing at all and is answered continuously. Reporting only the first meant
   * that offline — the usual case — the surface said accuracy was unknown once
   * and then never mentioned the clock again, however far it drifted.
   */
  const watch = totp.createClockWatch();
  let networkSkew = null;
  let networkCheckedAt = null;
  let localJumpSeconds = 0;

  function paintClock() {
    clear(clock);
    const lines = [];

    if (localJumpSeconds) {
      lines.push(h('div', { class: 'clock__alarm' },
        icon('warn', 'icon icon--sm'),
        h('span', {}, 'The system clock moved ' + Math.abs(localJumpSeconds) + ' seconds ' +
          (localJumpSeconds > 0 ? 'forward' : 'backward') +
          ' while this was open. Every code below changed with it, and any that were already typed elsewhere will now be refused.')));
    }

    if (networkSkew === null) {
      lines.push(h('div', {},
        networkCheckedAt
          ? 'Network time could not be reached when this was last checked, so how accurate the clock IS remains unknown. Whether it has MOVED is watched continuously and reported above.'
          : 'Checking the system clock against network time…'));
    } else {
      // An ageing verdict decays rather than continuing to reassure. A line
      // saying "within 2s of network time" that was measured forty minutes ago
      // is a claim about forty minutes ago.
      const ageMin = networkCheckedAt ? Math.floor((Date.now() - networkCheckedAt) / 60000) : 0;
      const when = ageMin < 1 ? 'just now' : ageMin === 1 ? '1 minute ago' : ageMin + ' minutes ago';
      lines.push(h('div', {},
        Math.abs(networkSkew) <= 5
          ? 'The system clock was within ' + Math.abs(networkSkew) + 's of network time when checked ' + when + '.'
          : 'The system clock was ' + Math.abs(networkSkew) + 's ' + (networkSkew > 0 ? 'ahead of' : 'behind') +
            ' network time when checked ' + when + '. Codes will be refused until it is corrected — this is the failure nobody diagnoses, because the digits look perfectly fine.'));
    }

    lines.push(h('button', {
      class: 'btn btn--outlined btn--sm',
      onclick: () => checkNetwork(true)
    }, 'Check against network time now'));

    add(clock, ...lines);
  }

  async function checkNetwork(manual) {
    if (manual) {
      clock.setAttribute('aria-busy', 'true');
    }
    networkSkew = await totp.clockSkewSeconds();
    networkCheckedAt = Date.now();
    clock.removeAttribute('aria-busy');
    paintClock();
  }

  checkNetwork(false);
  // Re-checked on returning to the window, because that is when a clock is most
  // likely to have been changed since anyone last looked.
  const onFocus = () => { if (document.body.contains(page)) checkNetwork(false); };
  window.addEventListener('focus', onFocus);

  page.append(
    h('div', { class: 'page__head' },
      h('div', { style: { flex: '1' } },
        h('div', { class: 'page__title' }, 'Authenticator'),
        h('div', { class: 'page__sub' },
          'One-time codes for whatever accounts you like, computed on this machine. No account, no sync, and no request leaves this window.')),
      h('div', { class: 'row', style: { gap: '10px' } },
        h('button', { class: 'btn btn--outlined', onclick: pairDialog }, icon('phonelock', 'icon icon--sm'), 'Pair with a QR'),
        h('button', { class: 'btn btn--filled', onclick: addDialog }, icon('plus', 'icon icon--sm'), 'Add entry'))),
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

  // One tick a second keeps the codes, the countdown and the clock watch honest.
  clearInterval(ticker);
  ticker = setInterval(() => {
    if (!document.body.contains(page)) {
      clearInterval(ticker);
      window.removeEventListener('focus', onFocus);
      return;
    }
    paint();
    // Checked every second, because a clock that moves has moved the codes on
    // screen and someone reading them deserves to know within a second rather
    // than the next time the page happens to be rebuilt.
    const jump = watch.check();
    if (jump) {
      localJumpSeconds = jump;
      paintClock();
      state.log('System clock moved', jump + 's');
      // The network verdict was measured against the old clock, so it is no
      // longer a statement about this one.
      networkSkew = null;
      networkCheckedAt = null;
      checkNetwork(false);
    }
  }, 1000);
}

export const meta = { id: 'authenticator', title: 'Authenticator', zh: '驗證器', icon: 'phonelock' };
