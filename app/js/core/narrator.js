// The spoken narrator.
//
// Off by default, but always implemented. Two details are what separate a
// narrator people keep on from one they switch off in the first minute:
//
//   * A voice picker per narrated language. Choosing an English voice says
//     nothing about which Cantonese voice should read the other half of a
//     bilingual line, so they are separate choices with separate storage.
//
//   * The voice list arrives LATE. On most platforms the first call returns
//     nothing and the real list turns up a moment later behind an event. A
//     picker that reads it once reports "no voices installed" on a machine with
//     forty, and looks broken rather than slow.

import * as state from '../state.js';

const listeners = new Set();
let cached = [];
let subscribed = false;

export function supported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function refresh() {
  if (!supported()) return [];
  cached = window.speechSynthesis.getVoices() || [];
  return cached;
}

function ensureSubscribed() {
  if (subscribed || !supported()) return;
  subscribed = true;
  refresh();
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    refresh();
    for (const fn of listeners) {
      try { fn(cached); } catch (e) { console.error(e); }
    }
  });
}

/** Every voice the platform reports right now. */
export function voices() {
  ensureSubscribed();
  if (!cached.length) refresh();
  return cached;
}

/**
 * Voices that can read a language.
 *
 * Cantonese is matched on `zh` broadly rather than on `yue` alone: platforms
 * label Hong Kong voices inconsistently, and filtering to the strictest tag
 * hides voices that would have worked.
 */
export function voicesFor(tag) {
  const all = voices();
  if (tag === 'zh') return all.filter((v) => /^(zh|yue)/i.test(v.lang));
  return all.filter((v) => /^en/i.test(v.lang));
}

export function onVoicesChanged(fn) {
  ensureSubscribed();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function settings() {
  return state.get('settings').narrator || { on: false, voiceEn: '', voiceZh: '', rate: 1, pitch: 1 };
}

/**
 * Resolves the voice to actually use.
 *
 * A stored choice is matched by voiceURI, never by display name: names are not
 * unique, platforms localise them, and a profile written on one machine stops
 * matching on another. When the chosen voice is absent the choice is KEPT and
 * an automatic pick is used, because silently resetting it loses a preference
 * the moment somebody unplugs a language pack.
 */
export function resolve(tag) {
  const s = settings();
  const key = tag === 'zh' ? 'voiceZh' : 'voiceEn';
  const list = voicesFor(tag);
  const chosen = s[key] ? list.find((v) => v.voiceURI === s[key]) : null;
  return {
    voice: chosen || list[0] || null,
    chosenMissing: !!s[key] && !chosen,
    available: list.length
  };
}

let queue = [];
let speaking = false;

/**
 * Speaks one line. Utterances are serialised rather than overlapping, and a
 * superseded queued line is replaced rather than stacked — a narrator that
 * reads a backlog aloud is worse than one that says nothing.
 */
export function say(text, tag = 'en') {
  if (!supported()) return false;
  const s = settings();
  if (!s.on) return false;

  const { voice } = resolve(tag);
  const u = new SpeechSynthesisUtterance(String(text));
  if (voice) u.voice = voice;
  u.rate = Number(s.rate ?? 1);
  u.pitch = Number(s.pitch ?? 1);
  u.onend = () => { speaking = false; drain(); };
  u.onerror = () => { speaking = false; drain(); };

  queue = queue.slice(-2);
  queue.push(u);
  drain();
  return true;
}

function drain() {
  if (speaking || !queue.length) return;
  const u = queue.shift();
  speaking = true;
  try {
    window.speechSynthesis.speak(u);
  } catch {
    speaking = false;
  }
}

/** Reads a sample line so a chosen voice can be judged before it is relied on. */
export function test(tag = 'en') {
  const line = tag === 'zh'
    ? '呢個係旁白試音。事實唔會變，變嘅淨係語氣。'
    : 'This is the narrator, reading a test line. The facts never change; only the voice does.';
  if (!supported()) return false;
  const { voice } = resolve(tag);
  const s = settings();
  const u = new SpeechSynthesisUtterance(line);
  if (voice) u.voice = voice;
  u.rate = Number(s.rate ?? 1);
  u.pitch = Number(s.pitch ?? 1);
  try {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}

export function stop() {
  queue = [];
  speaking = false;
  if (supported()) {
    try { window.speechSynthesis.cancel(); } catch { /* nothing to cancel */ }
  }
}
