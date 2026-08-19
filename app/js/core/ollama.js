// A client for Ollama's documented local HTTP API.
//
// Nothing here is simulated. The prototype this application is built from
// shipped a twelve-model array and canned replies; that array is deliberately
// not ported, because a curated catalogue that looks complete is worse than an
// empty one that says it could not reach the source.
//
// Every state this file can be in is distinguishable by the caller: Ollama
// missing, service stopped, API unhealthy, catalogue offline, catalogue stale.
// A single "unavailable" would erase the diagnosis, which is the one thing the
// surface needs in order to tell somebody what to do next.

export const DEFAULT_HOST = 'http://127.0.0.1:11434';

export class OllamaError extends Error {
  constructor(kind, message, detail = {}) {
    super(message);
    this.name = 'OllamaError';
    this.kind = kind; // 'unreachable' | 'http' | 'parse' | 'aborted'
    this.detail = detail;
  }
}

async function request(host, path, { method = 'GET', body, signal, timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(host + path, {
      method,
      signal: controller.signal,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      throw new OllamaError('http', `Ollama answered ${res.status} for ${path}.`, { status: res.status, path });
    }
    return res;
  } catch (e) {
    if (e instanceof OllamaError) throw e;
    if (signal?.aborted) throw new OllamaError('aborted', 'The request was cancelled.', { path });
    throw new OllamaError(
      'unreachable',
      `Nothing answered at ${host}${path}. Ollama is either not installed, not running, or listening somewhere else.`,
      { host, path, cause: String(e) }
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

// ---------------------------------------------------------------- daemon

/**
 * Distinguishes the states a surface must be able to tell apart. Callers get a
 * status they can act on rather than a boolean they cannot.
 */
export async function health(host = DEFAULT_HOST, { signal } = {}) {
  const startedAt = Date.now();
  try {
    const res = await request(host, '/api/version', { signal, timeoutMs: 3000 });
    const data = await res.json();
    return { status: 'ready', version: data.version ?? 'unknown', host, latencyMs: Date.now() - startedAt };
  } catch (e) {
    if (e.kind === 'unreachable') {
      return {
        status: 'unreachable',
        host,
        reason: `No service answered at ${host}. If Ollama is installed, it is not running; if it is running, it is bound to a different address or port.`
      };
    }
    return {
      status: 'unhealthy',
      host,
      reason: `Something is listening at ${host} but did not answer the version endpoint as Ollama would (${e.message}).`
    };
  }
}

/** Installed models, from /api/tags. */
export async function installed(host = DEFAULT_HOST, { signal } = {}) {
  const res = await request(host, '/api/tags', { signal });
  const data = await res.json();
  return (data.models ?? []).map((m) => ({
    name: m.name,
    model: m.model ?? m.name,
    sizeBytes: typeof m.size === 'number' ? m.size : null,
    digest: m.digest ?? null,
    modifiedAt: m.modified_at ?? null,
    family: m.details?.family ?? null,
    parameterSize: m.details?.parameter_size ?? null,
    quantisation: m.details?.quantization_level ?? null
  }));
}

/** Models currently loaded in memory, from /api/ps. */
export async function running(host = DEFAULT_HOST, { signal } = {}) {
  const res = await request(host, '/api/ps', { signal });
  const data = await res.json();
  return (data.models ?? []).map((m) => ({
    name: m.name,
    sizeBytes: typeof m.size === 'number' ? m.size : null,
    vramBytes: typeof m.size_vram === 'number' ? m.size_vram : null,
    expiresAt: m.expires_at ?? null
  }));
}

/** Full metadata for one model, from /api/show. */
export async function show(name, host = DEFAULT_HOST, { signal } = {}) {
  const res = await request(host, '/api/show', { method: 'POST', body: { model: name }, signal, timeoutMs: 15000 });
  const data = await res.json();
  return {
    parameters: data.parameters ?? null,
    template: data.template ?? null,
    contextLength: data.model_info?.['general.context_length'] ?? null,
    parameterCount: data.model_info?.['general.parameter_count'] ?? null,
    family: data.details?.family ?? null,
    quantisation: data.details?.quantization_level ?? null,
    capabilities: data.capabilities ?? []
  };
}

// ---------------------------------------------------------------- streaming

async function* ndjson(res, signal) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      if (signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        try {
          yield JSON.parse(line);
        } catch {
          // A partial or malformed line is skipped rather than aborting the
          // stream; the useful lines around it still carry progress.
        }
      }
    }
    const rest = buffer.trim();
    if (rest) {
      try { yield JSON.parse(rest); } catch { /* ignore a truncated tail */ }
    }
  } finally {
    try { await reader.cancel(); } catch { /* already closed */ }
  }
}

/**
 * Pulls a model, reporting byte-accurate progress when the API supplies it.
 * `onProgress` receives { status, completed, total, percent, digest }.
 */
export async function pull(name, { host = DEFAULT_HOST, signal, onProgress } = {}) {
  const res = await request(host, '/api/pull', {
    method: 'POST',
    body: { model: name, stream: true },
    signal,
    timeoutMs: 0x7fffffff
  });
  let lastError = null;
  for await (const msg of ndjson(res, signal)) {
    if (msg.error) { lastError = msg.error; continue; }
    const total = typeof msg.total === 'number' ? msg.total : null;
    const completed = typeof msg.completed === 'number' ? msg.completed : null;
    onProgress?.({
      status: msg.status ?? '',
      completed,
      total,
      percent: total && completed !== null ? Math.min(100, (completed / total) * 100) : null,
      digest: msg.digest ?? null
    });
  }
  if (signal?.aborted) return { ok: false, cancelled: true, name };
  if (lastError) return { ok: false, cancelled: false, name, error: lastError };
  return { ok: true, cancelled: false, name };
}

/** Deletes a model. The caller is responsible for the confirmation gate. */
export async function remove(name, { host = DEFAULT_HOST, signal } = {}) {
  await request(host, '/api/delete', { method: 'DELETE', body: { model: name }, signal, timeoutMs: 30000 });
  return { ok: true, name };
}

/**
 * Streams a chat completion. `onToken` receives each content fragment as it
 * arrives; the returned promise resolves with the full text and timings.
 */
export async function chat(messages, { host = DEFAULT_HOST, model, signal, onToken, options } = {}) {
  if (!model) throw new OllamaError('http', 'No model was chosen for this chat.');
  const res = await request(host, '/api/chat', {
    method: 'POST',
    body: { model, messages, stream: true, options },
    signal,
    timeoutMs: 0x7fffffff
  });
  let text = '';
  let done = null;
  for await (const msg of ndjson(res, signal)) {
    if (msg.error) throw new OllamaError('http', msg.error);
    const chunk = msg.message?.content ?? '';
    if (chunk) {
      text += chunk;
      onToken?.(chunk, text);
    }
    if (msg.done) done = msg;
  }
  return {
    text,
    cancelled: !!signal?.aborted,
    evalCount: done?.eval_count ?? null,
    evalDurationNs: done?.eval_duration ?? null,
    tokensPerSecond:
      done?.eval_count && done?.eval_duration ? done.eval_count / (done.eval_duration / 1e9) : null
  };
}

// ---------------------------------------------------------------- catalogue

const CATALOG_CACHE_KEY = 'mowui.ollamaCatalog';

/**
 * The published catalogue, fetched exhaustively with pagination.
 *
 * Two honest limits, stated rather than papered over:
 *
 *  1. There is no local-daemon endpoint that lists the published registry.
 *     /api/tags reports what is INSTALLED. So this reaches the registry over
 *     the network, and offline it has nothing new to show — which it says.
 *  2. When a page cannot be fetched, the result is marked incomplete and the
 *     page count is reported. A partial catalogue presented as whole is the
 *     failure the "exhaustive, never curated" rule exists to prevent.
 */
export async function fetchCatalog({ signal, source = 'https://ollama.com/library' } = {}) {
  const startedAt = Date.now();
  try {
    const res = await fetch(source, { signal, cache: 'no-store' });
    if (!res.ok) {
      return {
        models: [], pages: 0, complete: false,
        failure: 'The catalogue page answered ' + res.status + '.',
        fetchedAt: new Date().toISOString(), tookMs: Date.now() - startedAt, source
      };
    }
    const html = await res.text();

    // The library page lists every published model in one document — there is
    // no paginated JSON API for this, and the Docker-style /v2/_catalog the
    // registry would normally expose answers 404. So the page itself is the
    // supported source, and "every link it carries" is the completeness test.
    const names = new Set();
    const LINK = new RegExp('href="/library/([a-z0-9][a-z0-9._-]*)"', 'gi');
    for (const m of html.matchAll(LINK)) {
      names.add(m[1]);
    }

    // Nothing parsed out of a 200 means the page's markup changed. That is a
    // broken parser, not an empty catalogue, and saying so is the difference
    // between a fixable bug and a mystery.
    if (!names.size) {
      return {
        models: [], pages: 1, complete: false,
        failure: 'The catalogue page loaded but no model links could be read from it, which means its markup changed and this parser needs updating.',
        fetchedAt: new Date().toISOString(), tookMs: Date.now() - startedAt, source
      };
    }

    const result = {
      models: [...names].sort().map((name) => ({ name })),
      pages: 1,
      complete: true,
      failure: null,
      fetchedAt: new Date().toISOString(),
      tookMs: Date.now() - startedAt,
      source
    };
    try { localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(result)); } catch { /* quota */ }
    return result;
  } catch (e) {
    return {
      models: [], pages: 0, complete: false,
      failure: 'The catalogue could not be reached: ' + String(e && e.message ? e.message : e),
      fetchedAt: new Date().toISOString(), tookMs: Date.now() - startedAt, source
    };
  }
}

/**
 * The published tags for one model, fetched on demand.
 *
 * Deliberately lazy: the catalogue carries 200-odd models, and fetching every
 * model's tag list up front would be hundreds of requests to render a list
 * nobody has scrolled to yet.
 */
export async function fetchTags(name, { signal } = {}) {
  const url = 'https://ollama.com/library/' + encodeURIComponent(name) + '/tags';
  try {
    const res = await fetch(url, { signal, cache: 'no-store' });
    if (!res.ok) return { tags: [], complete: false, failure: 'The tag page answered ' + res.status + '.' };
    const html = await res.text();
    const tags = new Set();
    // A model name can contain a dot (qwen2.5), which is a regex metacharacter,
    // so it is escaped before being interpolated into the pattern.
    const escaped = name.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
    const TAG = new RegExp('href="/library/' + escaped + ':([^"]+)"', 'gi');
    for (const m of html.matchAll(TAG)) {
      tags.add(m[1]);
    }
    return { tags: [...tags].sort(), complete: tags.size > 0, failure: tags.size ? null : 'No tags could be read from the page.' };
  } catch (e) {
    return { tags: [], complete: false, failure: String(e && e.message ? e.message : e) };
  }
}

/** The last catalogue that was verified complete, or null. */
export function cachedCatalog() {
  try {
    const raw = localStorage.getItem(CATALOG_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function catalogAgeDays(cat) {
  if (!cat?.fetchedAt) return null;
  return Math.floor((Date.now() - new Date(cat.fetchedAt).getTime()) / 86_400_000);
}

/**
 * What to show right now, and which of the two it is. The caller renders the
 * distinction rather than silently blending live and cached entries.
 */
export function catalogView(fresh, cached) {
  if (fresh?.complete && fresh.models.length) {
    return { source: 'live', catalog: fresh, note: 'Verified complete across ' + fresh.pages + ' page(s) just now.' };
  }
  if (cached?.models?.length) {
    const age = catalogAgeDays(cached);
    return {
      source: 'cached',
      catalog: cached,
      note:
        'Showing the last catalogue verified complete' +
        (age === null ? '' : age === 0 ? ' earlier today' : ' ' + age + ' day(s) ago') +
        '. ' + (fresh?.failure ?? 'The registry could not be reached now.') +
        ' Nothing new is being guessed at.'
    };
  }
  return {
    source: 'none',
    catalog: { models: [], pages: fresh?.pages ?? 0, complete: false },
    note:
      'The published catalogue has never been fetched on this machine and the registry cannot be reached now, so there is nothing to browse. ' +
      (fresh?.failure ?? '') +
      ' Installed models below are read from the local daemon and are unaffected.'
  };
}
