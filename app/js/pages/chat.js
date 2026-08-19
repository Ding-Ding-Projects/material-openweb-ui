// Chat, streamed from a model running on this machine.
//
// The prototype this is built from faked the stream with setInterval and canned
// replies. Nothing here is canned: if no model is installed, the surface says
// so and offers the route to install one, rather than answering with something
// it made up.

import { h, icon, clear, fmtTime } from '../../../docs/assets/js/dom.js';
import * as ui from '../../../docs/assets/js/ui.js';
import * as ollama from '../core/ollama.js';
import * as state from '../state.js';

let controller = null;

export function render(root) {
  const page = h('div', { class: 'page', style: { display: 'flex', flexDirection: 'column', height: '100%', maxWidth: '900px' } });
  const thread = h('div', { style: { flex: '1', minHeight: '0', overflowY: 'auto', paddingRight: '4px' } });
  const banner = h('div', {});

  let messages = [];
  let model = state.get('settings').lastModel || '';
  let models = [];

  const modelBtn = h('button', { class: 'btn btn--outlined', 'aria-haspopup': 'listbox' }, icon('server', 'icon icon--sm'), h('span', {}, model || 'No model'), icon('arrow', 'icon icon--sm'));
  modelBtn.addEventListener('click', () => {
    if (!models.length) {
      ui.notify('No models are installed, so there is nothing to choose. Pull one from the Ollama page first.', { kind: 'info' });
      return;
    }
    ui.menu(modelBtn, models.map((m) => ({
      label: m.name,
      icon: m.name === model ? 'check' : undefined,
      run: () => {
        model = m.name;
        state.patchSettings({ lastModel: model });
        modelBtn.children[1].textContent = model;
      }
    })), { label: 'Choose a model', filterPlaceholder: 'Filter models…' });
  });

  const box = h('textarea', {
    placeholder: 'Ask the model something…',
    'aria-label': 'Message',
    rows: '1',
    onkeydown: (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    }
  });

  const sendBtn = h('button', { class: 'btn btn--filled', onclick: () => submit() }, icon('arrow', 'icon icon--sm'), 'Send');
  const stopBtn = h('button', { class: 'btn btn--outlined', style: { display: 'none' }, onclick: () => controller?.abort() }, icon('x', 'icon icon--sm'), 'Stop');

  function paint() {
    clear(thread);
    if (!messages.length) {
      thread.append(h('div', { class: 'pending', style: { marginTop: '40px' } },
        icon('chat', 'icon icon--lg'),
        h('strong', {}, 'Nothing has been asked yet'),
        h('span', { class: 'muted', style: { fontSize: '.85rem', maxWidth: '54ch' } },
          'Replies come from a model running on this machine. Nothing typed here is sent anywhere else.')));
      return;
    }
    for (const m of messages) {
      thread.append(h('div', { class: 'msg' },
        h('div', { class: 'msg__who', dataset: { role: m.role } }, m.role === 'user' ? 'You' : 'AI'),
        h('div', { class: 'msg__body' }, m.content || (m.streaming ? '…' : ''))));
    }
    thread.scrollTop = thread.scrollHeight;
  }

  async function submit() {
    const text = box.value.trim();
    if (!text) return;
    if (!model) {
      ui.notify('Choose a model first — there is no default, because guessing which of your models you meant is not something this can do honestly.', { kind: 'info' });
      return;
    }
    box.value = '';
    messages.push({ role: 'user', content: text });
    const reply = { role: 'assistant', content: '', streaming: true };
    messages.push(reply);
    paint();

    controller = new AbortController();
    sendBtn.style.display = 'none';
    stopBtn.style.display = '';

    try {
      const result = await ollama.chat(
        messages.filter((m) => !m.streaming || m.content).map(({ role, content }) => ({ role, content })),
        {
          host: state.get('settings').ollamaHost,
          model,
          signal: controller.signal,
          onToken: (_chunk, full) => { reply.content = full; paint(); }
        }
      );
      reply.streaming = false;
      if (result.cancelled) reply.content += '\n\n[stopped]';
      state.log('Chat reply', model + (result.tokensPerSecond ? ' · ' + result.tokensPerSecond.toFixed(1) + ' tok/s' : ''));
    } catch (e) {
      reply.streaming = false;
      // Stopping before the first token arrives reaches here rather than the
      // cancelled path, because the fetch itself rejects. It is still a stop:
      // treating it as a failure discarded the message and raised an error for
      // something the person did deliberately.
      if (e.kind === 'aborted' || (controller && controller.signal.aborted)) {
        const BREAK = String.fromCharCode(10, 10);
        reply.content = (reply.content || '') + BREAK + '[stopped before the model answered]';
        state.log('Chat stopped', model + ' · before the first token');
        return;
      }
      reply.content = '';
      messages.pop();
      ui.notify('The model did not answer: ' + e.message, { kind: 'error' });
    } finally {
      controller = null;
      sendBtn.style.display = '';
      stopBtn.style.display = 'none';
      paint();
    }
  }

  (async () => {
    try {
      models = await ollama.installed(state.get('settings').ollamaHost);
    } catch (e) {
      clear(banner);
      banner.append(h('div', { class: 'state state--bad', style: { marginBottom: '14px' } }, icon('warn'),
        h('div', { class: 'state__body' },
          h('div', { class: 'state__title' }, 'The Ollama daemon is not answering'),
          h('div', { class: 'state__text' }, e.message + ' Nothing can be asked until it is running — and this surface will not answer with something it invented in the meantime.'),
          h('button', { class: 'btn btn--outlined', style: { marginTop: '12px' }, onclick: () => window.mowuiApp.open('ollama') }, 'Open the Ollama page'))));
      return;
    }
    if (!models.length) {
      clear(banner);
      banner.append(h('div', { class: 'state state--info', style: { marginBottom: '14px' } }, icon('info'),
        h('div', { class: 'state__body' },
          h('div', { class: 'state__title' }, 'No models are installed'),
          h('div', { class: 'state__text' }, 'The daemon is running and reported an empty list. Pull a model and it will appear in the picker.'),
          h('button', { class: 'btn btn--outlined', style: { marginTop: '12px' }, onclick: () => window.mowuiApp.open('ollama') }, 'Browse the catalogue'))));
      return;
    }
    if (!model || !models.some((m) => m.name === model)) {
      model = models[0].name;
      modelBtn.children[1].textContent = model;
      state.patchSettings({ lastModel: model });
    }
  })();

  page.append(
    h('div', { class: 'page__head', style: { flex: 'none' } },
      h('div', { style: { flex: '1' } },
        h('div', { class: 'page__title' }, 'Chat'),
        h('div', { class: 'page__sub' }, 'Streamed from a model on this machine.')),
      modelBtn),
    banner,
    thread,
    h('div', { class: 'composer', style: { flex: 'none' } }, box, stopBtn, sendBtn)
  );

  root.append(page);
  paint();
}

export const meta = { id: 'chat', title: 'Chat', zh: '對話', icon: 'chat' };
