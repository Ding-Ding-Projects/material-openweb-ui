// Application state.
//
// Keeps the `owmd3.` key names the design prototype's handoff documented, so a
// profile written by the prototype is readable here rather than orphaned by a
// rename nobody needed.
//
// Two things never enter this store: authenticator secrets and lock
// credentials. Those belong in the operating system's credential vault, and
// until the shell exposes one the surfaces that need them say so plainly rather
// than writing a secret into a settings file and calling it storage.

const PREFIX = 'owmd3.';

const DEFAULTS = {
  settings: {
    theme: 'system',
    language: 'English',
    funnyEn: 2,
    funnyZh: 2,
    ollamaHost: 'http://127.0.0.1:11434',
    lastModel: '',
    modelDestination: '',
    paletteSize: 'card',
    emojiDialogs: false,
    narrator: { on: false, voiceEn: '', voiceZh: '', rate: 1, pitch: 1 },
    school: { on: false, name: 'School mode', pin: '' }
  },
  settingsWritten: [],
  vocabulary: null,
  locks: {},
  tickets: [],
  tabs: [{ id: 'tb-ollama', page: 'ollama' }],
  activeTab: 'tb-ollama',
  chats: [],
  totpEntries: [],
  convResults: [],
  statusLog: []
};

const listeners = new Set();

function read(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn('could not persist ' + key, e);
    return false;
  }
}

const state = {};
for (const key of Object.keys(DEFAULTS)) {
  const stored = read(key);
  state[key] =
    stored === undefined
      ? structuredClone(DEFAULTS[key])
      : key === 'settings'
        ? { ...structuredClone(DEFAULTS.settings), ...stored }
        : stored;
}

export function get(key) {
  return state[key];
}

export function set(key, value) {
  state[key] = value;
  write(key, value);
  for (const fn of listeners) {
    try { fn(key, value); } catch (e) { console.error(e); }
  }
  return value;
}

export function patchSettings(patch) {
  return set('settings', { ...state.settings, ...patch });
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The event log every feature writes to, so the Status page reflects reality. */
export function log(event, detail = '') {
  const entry = { t: Date.now(), event, detail };
  const next = [entry, ...(state.statusLog || [])].slice(0, 300);
  set('statusLog', next);
  return entry;
}

export const STORAGE_PREFIX = PREFIX;
