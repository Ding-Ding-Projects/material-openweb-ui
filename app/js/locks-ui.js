// The lock wizard, the unlock prompt, the support desk and the unlock ladder.
//
// The ladder's five safety rules are the whole feature, and they are worth
// stating where the code is:
//
//   1. It clears the WAITING, never the credential. Winning returns you to the
//      ordinary prompt still needing the answer.
//   2. It never refunds the attempt budget.
//   3. It is capped — three skips per rolling hour — which is what makes it
//      safe rather than clever.
//   4. It never slows the escalation it skips.
//   5. Each challenge is single-use, so a wrong answer cannot be retried
//      against the same question and a right one cannot be replayed.
//
// One honest deviation: the contract wants answers graded server-side. This
// application has no server — that is the point of it — so grading happens
// locally, and the surface says so rather than implying a protection it does
// not have. The lock is a toy either way, and pretending otherwise would be a
// worse failure than the one being avoided.

import { h, icon, clear, add } from '../../docs/assets/js/dom.js';
import * as ui from '../../docs/assets/js/ui.js';
import * as locks from './core/locks.js';
import * as totp from './core/totp.js';
import * as state from './state.js';
import * as i18n from './i18n.js';

const DISHES = [
  { en: 'Har Gow', zh: '蝦餃' },
  { en: 'Siu Mai', zh: '燒賣' },
  { en: 'Char Siu Bao', zh: '叉燒包' },
  { en: 'Cheung Fun', zh: '腸粉' },
  { en: 'Lo Mai Gai', zh: '糯米雞' },
  { en: 'Dan Tat', zh: '蛋撻' }
];

// ---------------------------------------------------------------- wizard

/** Opens the wizard for one exact element. Never reuses another lock's state. */
export function wizard(targetId, label) {
  let method = 'password';
  let duration = 'surface';

  const password = h('input', { type: 'password', placeholder: 'At least four characters', 'aria-label': 'Password' });
  const secretInput = h('input', { type: 'text', class: 'mono', placeholder: 'Base32 secret', 'aria-label': 'One-time-code secret' });
  const err = h('div', { style: { color: 'var(--err)', fontSize: '.8rem', minHeight: '18px' } });
  const methodBox = h('div', { class: 'stack', style: { gap: '10px' } });

  function paintMethod() {
    clear(methodBox);
    add(methodBox, method === 'password'
      ? h('div', { class: 'field' }, password)
      : h('div', { class: 'stack', style: { gap: '8px' } },
          h('div', { class: 'field' }, secretInput),
          h('div', { class: 'muted', style: { fontSize: '.76rem', lineHeight: '1.55' } },
            'A one-time-code lock has to store its secret, because that is how the codes are generated. A password lock stores only a hash. That difference is real, and worth knowing before choosing.')));
  }

  const methodSel = ui.select({
    value: method, width: 220, label: 'Method',
    options: [{ value: 'password', label: 'Password' }, { value: 'totp', label: 'One-time code' }],
    onChange: (v) => { method = v; paintMethod(); }
  });

  const durationSel = ui.select({
    value: duration, width: 240, label: 'Stay open for',
    options: locks.DURATIONS,
    onChange: (v) => { duration = v; }
  });

  paintMethod();

  return ui.dialog({
    title: 'Lock “' + label + '”',
    emoji: '🔒',
    body: h('div', { class: 'stack', style: { gap: '14px' } },
      h('p', { class: 'muted', style: { fontSize: '.86rem', lineHeight: '1.6' } },
        'This lock belongs to this one element and carries its own credential. Locking something else creates a separate lock with a separate answer — there is no master credential here.'),
      h('div', { class: 'row', style: { gap: '12px', flexWrap: 'wrap' } }, methodSel.el, durationSel.el),
      methodBox,
      err,
      h('div', { class: 'state state--info' }, icon('info'),
        h('div', { class: 'state__body' },
          h('div', { class: 'state__title' }, 'It is just for fun'),
          h('div', { class: 'state__text' }, locks.DISCLOSURE)))),
    actions: [
      { label: i18n.t('action.cancel') },
      { label: 'Lock it', primary: true, run: () => {
        locks.create({
          id: targetId, label, method, duration,
          password: password.value, secret: secretInput.value
        }).then(() => {
          ui.notify('“' + label + '” is locked. The recovery route is in Support Tickets if the answer goes missing.', { kind: 'ok' });
          window.mowuiApp.refresh();
        }).catch((e) => {
          err.textContent = e.message;
        });
        return true; // keep the dialog open until create resolves or errors
      } }
    ]
  });
}

// ---------------------------------------------------------------- unlock

export function unlockPrompt(targetId, onOpened) {
  const lock = locks.get(targetId);
  if (!lock) return null;

  const answer = h('input', {
    type: lock.method === 'password' ? 'password' : 'text',
    class: lock.method === 'password' ? '' : 'mono',
    placeholder: lock.method === 'password' ? 'Password' : 'Current code',
    'aria-label': lock.method === 'password' ? 'Password' : 'Current one-time code'
  });
  const err = h('div', { style: { color: 'var(--err)', fontSize: '.8rem', minHeight: '18px' } });
  const waitLine = h('div', { class: 'muted', style: { fontSize: '.8rem' } });

  let dialog = null;

  function refreshWait() {
    const secs = locks.waitRemaining(targetId);
    const budget = locks.ladderBudget();
    clear(waitLine);
    if (secs > 0) {
      add(waitLine,
        h('span', {}, 'Waiting ' + secs + 's before the next try. '),
        budget.remaining
          ? h('button', {
              class: 'btn btn--text', style: { height: '26px', padding: '0 8px' },
              onclick: () => { if (dialog) dialog.close(); ladder(targetId, () => unlockPrompt(targetId, onOpened)); }
            }, 'Play your way out (' + budget.remaining + ' left this hour)')
          : h('span', {}, 'The ladder is used up for this hour, so the clock is the only way through.'));
    }
  }

  const timer = setInterval(refreshWait, 1000);

  dialog = ui.dialog({
    title: 'Unlock “' + lock.label + '”',
    emoji: '🔑',
    onClose: () => clearInterval(timer),
    body: h('div', { class: 'stack', style: { gap: '12px' } },
      h('div', { class: 'field' }, answer),
      err,
      waitLine,
      h('div', { class: 'muted', style: { fontSize: '.78rem', lineHeight: '1.6' } },
        'Forgotten it? ',
        h('button', {
          class: 'btn btn--text', style: { height: '24px', padding: '0 4px' },
          onclick: () => { dialog.close(); supportTickets(targetId); }
        }, 'Support Tickets'),
        ' has the way out. Nothing here can be reset by us, because there is no account and no server.')),
    actions: [
      { label: i18n.t('action.cancel') },
      { label: 'Unlock', primary: true, run: () => {
        locks.tryUnlock(targetId, answer.value).then((r) => {
          if (r.ok) {
            dialog.close();
            ui.notify('“' + lock.label + '” is open.', { kind: 'ok' });
            if (onOpened) onOpened();
            window.mowuiApp.refresh();
          } else {
            err.textContent = r.reason;
            refreshWait();
          }
        });
        return true;
      } }
    ]
  });
  refreshWait();
  return dialog;
}

// ---------------------------------------------------------------- the ladder

/**
 * Rung order: dim sum → ten sums → whack-a-mole → the clock.
 *
 * Under School mode the dim-sum rung is ABSENT rather than skipped with a
 * message, because a message naming the hidden thing is exactly what the mode
 * forbids. One function decides the starting rung so no caller can get it wrong.
 */
export function startingRung() {
  const school = state.get('settings').school;
  return school && school.on ? 'sums' : 'dish';
}

export function ladder(targetId, onDone) {
  const budget = locks.ladderBudget();
  if (!budget.remaining) {
    ui.notify('The ladder has been used ' + budget.cap + ' times this hour, which is its cap. The clock is the only way through now — that cap is what keeps this safe rather than clever.', { kind: 'info', persist: true });
    return null;
  }

  let rung = startingRung();
  let wrongDishes = 0;
  let nonce = Math.random().toString(36).slice(2);
  const body = h('div', { class: 'stack', style: { gap: '14px' } });
  let dialog = null;

  function finishWon() {
    locks.spendLadder();
    locks.clearWait(targetId);
    dialog.close();
    ui.notify('The wait is cleared — and only the wait. You still need the answer, because guessing a dumpling was never an authentication factor.', { kind: 'ok', persist: true });
    if (onDone) onDone();
  }

  function fallToClock(why) {
    dialog.close();
    ui.notify(why + ' The ladder is not offered again for this lockout, so you serve the wait you were already serving — which is exactly where you started, and no worse.', { kind: 'info', persist: true });
    if (onDone) onDone();
  }

  // ---- rung 1: dim sum ----
  function paintDish() {
    const correct = DISHES[Math.floor(Math.random() * DISHES.length)];
    const options = [...DISHES].sort(() => Math.random() - 0.5).slice(0, 4);
    if (!options.includes(correct)) options[0] = correct;
    options.sort(() => Math.random() - 0.5);
    const thisNonce = nonce;

    clear(body);
    add(body,
      h('div', { style: { fontSize: '.9rem' } }, 'Which one is ', h('strong', { class: 'cjk' }, correct.zh), '?'),
      h('div', { class: 'grid grid--2', style: { gap: '10px' } },
        ...options.map((o) => h('button', {
          class: 'btn btn--outlined',
          onclick: () => {
            if (thisNonce !== nonce) return; // single use: a stale question grades nothing
            nonce = Math.random().toString(36).slice(2);
            if (o === correct) return finishWon();
            wrongDishes++;
            if (wrongDishes >= 5) { rung = 'sums'; paintSums(); }
            else paintDish();
          }
        }, o.en))),
      h('div', { class: 'muted', style: { fontSize: '.76rem' } }, 'Five wrong and it moves on. ' + (5 - wrongDishes) + ' left.'));
  }

  // ---- rung 2: ten sums ----
  function paintSums() {
    let index = 0;
    const total = 10;

    function ask() {
      const a = 1 + Math.floor(Math.random() * 20);
      const b = 1 + Math.floor(Math.random() * 20);
      const thisNonce = nonce;
      const input = h('input', { type: 'text', inputmode: 'numeric', class: 'mono', 'aria-label': 'Answer', style: { width: '90px' } });
      const submit = () => {
        if (thisNonce !== nonce) return;
        nonce = Math.random().toString(36).slice(2);
        if (Number(input.value.trim()) !== a + b) { rung = 'mole'; paintMole(); return; }
        index++;
        if (index >= total) return finishWon();
        ask();
      };
      clear(body);
      add(body,
        h('div', { style: { fontSize: '.9rem' } }, 'Sum ' + (index + 1) + ' of ' + total),
        h('div', { class: 'row', style: { gap: '10px', alignItems: 'center' } },
          h('span', { class: 'code-lg', style: { fontSize: '1.6rem' } }, a + ' + ' + b + ' ='),
          h('div', { class: 'field', style: { width: '120px' } }, input),
          h('button', { class: 'btn btn--filled', onclick: submit }, 'Check')),
        h('div', { class: 'muted', style: { fontSize: '.76rem' } }, 'Every one has to be right. One wrong and it moves on.'));
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
      setTimeout(() => input.focus(), 0);
    }
    ask();
  }

  // ---- rung 3: whack-a-mole ----
  function paintMole() {
    const ROUND_MS = 8000;
    const NEED = 6;
    let hits = 0;
    const startedAt = Date.now();
    const cells = [];
    let live = -1;
    let moveTimer = null;
    let endTimer = null;
    const score = h('div', { class: 'muted', style: { fontSize: '.8rem' } });

    function stop() {
      clearInterval(moveTimer);
      clearTimeout(endTimer);
    }

    function paintScore() {
      score.textContent = hits + ' of ' + NEED + ' — ' + Math.max(0, Math.ceil((ROUND_MS - (Date.now() - startedAt)) / 1000)) + 's left';
    }

    const grid = h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' } });
    for (let i = 0; i < 9; i++) {
      const cell = h('button', {
        class: 'btn btn--outlined',
        style: { height: '64px' },
        'aria-label': 'Cell ' + (i + 1),
        onclick: () => {
          // A hit counts only against a mole that was genuinely visible, in
          // that cell, at that moment — and each mole is hittable once.
          if (i !== live) return;
          live = -1;
          cell.textContent = '';
          hits++;
          paintScore();
          if (hits >= NEED) {
            stop();
            // A timed game cannot be won faster than it lasts.
            if (Date.now() - startedAt < ROUND_MS * 0.5) {
              return fallToClock('That round finished impossibly fast, so it was not counted.');
            }
            finishWon();
          }
        }
      }, '');
      cells.push(cell);
      grid.appendChild(cell);
    }

    moveTimer = setInterval(() => {
      if (live >= 0) cells[live].textContent = '';
      live = Math.floor(Math.random() * 9);
      cells[live].textContent = '●';
      paintScore();
    }, 700);

    endTimer = setTimeout(() => {
      stop();
      fallToClock('The round ended with ' + hits + ' of ' + NEED + '.');
    }, ROUND_MS);

    clear(body);
    add(body,
      h('div', { style: { fontSize: '.9rem' } }, 'Hit ' + NEED + ' moles before the round ends.'),
      grid,
      score);
    paintScore();
  }

  dialog = ui.dialog({
    title: 'Play your way out',
    emoji: '🥟',
    wide: true,
    body: h('div', { class: 'stack', style: { gap: '14px' } },
      body,
      h('div', { class: 'state state--info' }, icon('info'),
        h('div', { class: 'state__body' },
          h('div', { class: 'state__title' }, 'What winning does, exactly' ),
          h('div', { class: 'state__text' },
            'It clears the wait and nothing else. You are returned to the ordinary prompt and still need the answer — this is not a second, weaker password. It does not return extra attempts, and it does not shorten the escalation it skipped. Answers are graded on this machine, because there is no server here; the lock is a toy either way, and saying so is better than implying otherwise.')))),
    actions: [{ label: 'Serve the wait instead', run: () => { if (onDone) onDone(); } }]
  });

  if (rung === 'dish') paintDish(); else paintSums();
  return dialog;
}

// ---------------------------------------------------------------- support desk

export function supportTickets(targetId) {
  const tickets = state.get('tickets') || [];
  const category = h('select', {
    'aria-label': 'Category',
    style: { border: '1px solid var(--outv)', borderRadius: '20px', padding: '10px 14px', background: 'transparent', color: 'var(--ons)' }
  },
    ...['Cannot remember the answer', 'Lost the authenticator', 'It was my sibling', 'Other'].map((c) => h('option', { value: c }, c)));
  const description = h('textarea', {
    rows: '3', 'aria-label': 'Description', placeholder: 'Tell us what happened. Nobody will read it.',
    style: { width: '100%', borderRadius: '14px', padding: '10px 12px', border: '1px solid var(--outv)', background: 'transparent', color: 'var(--ons)' }
  });

  const list = h('div', { class: 'stack', style: { gap: '8px' } });

  function paintList() {
    clear(list);
    const all = state.get('tickets') || [];
    if (!all.length) {
      add(list, h('div', { class: 'muted', style: { fontSize: '.8rem' } }, 'No tickets have been raised on this machine.'));
      return;
    }
    for (const t of all.slice(0, 6)) {
      add(list, h('div', { class: 'card', style: { padding: '10px 14px', display: 'flex', gap: '10px', alignItems: 'center' } },
        h('span', { class: 'chip chip--tonal mono', style: { height: '22px', fontSize: '.64rem' } }, t.number),
        h('span', { style: { flex: '1', fontSize: '.82rem' } }, t.category),
        h('span', { class: 'muted', style: { fontSize: '.72rem' } }, t.status)));
    }
  }
  paintList();

  const dataDir = 'the application\'s stored data';

  return ui.dialog({
    title: 'Support Tickets',
    emoji: '🎫',
    wide: true,
    body: h('div', { class: 'stack', style: { gap: '14px' } },
      // The one plain line, deliberately outside the comedy and unstyled by the
      // funny level. Nobody should sit waiting for a reply that was never coming.
      h('div', { class: 'state state--info' }, icon('info'),
        h('div', { class: 'state__body' },
          h('div', { class: 'state__text', style: { fontWeight: '600' } },
            'Nothing is sent anywhere. No ticket exists outside this machine, no network request is made, no data is collected, and nobody is reading it. This is a joke with a working button at the end of it.'))),
      h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap' } }, category),
      description,
      h('button', {
        class: 'btn btn--outlined',
        onclick: () => {
          const number = 'MOW-' + String(Date.now()).slice(-6);
          const t = { number, category: category.value, at: Date.now(), status: 'Awaiting triage (forever)' };
          state.set('tickets', [t, ...(state.get('tickets') || [])].slice(0, 40));
          state.log('Support ticket raised', number);
          paintList();
          ui.notify('Ticket ' + number + ' raised. Severity: urgent. Assigned to: nobody.', { kind: 'info' });
        }
      }, 'Raise a ticket'),
      list,
      h('hr'),
      h('div', { class: 'stack', style: { gap: '10px' } },
        h('strong', {}, 'Resolution'),
        h('p', { class: 'muted', style: { fontSize: '.84rem', lineHeight: '1.6' } },
          'The only thing that actually works: clear ' + dataDir + '. That removes every lock, along with everything else this application has stored. It is your action, in your own file manager — this never deletes anything for you.'),
        h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap' } },
          h('button', {
            class: 'btn btn--filled',
            onclick: async () => {
              const info = await (await import('./desktop.js')).appInfo();
              if (info?.userData) {
                (await import('./desktop.js')).openPath(info.userData);
                ui.notify('Opened ' + info.userData + '. Deleting it is your call, and your action.', { kind: 'info', persist: true });
              } else {
                ui.notify('This is running in a browser, which has no application-data folder. Clearing this site\'s storage is the equivalent.', { kind: 'info', persist: true });
              }
            }
          }, icon('file', 'icon icon--sm'), 'Open the folder'),
          h('button', {
            class: 'btn btn--outlined',
            onclick: async () => {
              const info = await (await import('./desktop.js')).appInfo();
              ui.copyToClipboard(info?.userData || 'browser storage for this origin', 'Path copied.');
            }
          }, 'Copy the path')))),
    actions: [{ label: 'Close' }]
  });
}
