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
			throw new OllamaError('http', `Ollama answered ${res.status} for ${path}.`, {
				status: res.status,
				path
			});
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
		return {
			status: 'ready',
			version: data.version ?? 'unknown',
			host,
			latencyMs: Date.now() - startedAt
		};
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
	const res = await request(host, '/api/show', {
		method: 'POST',
		body: { model: name },
		signal,
		timeoutMs: 15000
	});
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
			try {
				yield JSON.parse(rest);
			} catch {
				/* ignore a truncated tail */
			}
		}
	} finally {
		try {
			await reader.cancel();
		} catch {
			/* already closed */
		}
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
		if (msg.error) {
			lastError = msg.error;
			continue;
		}
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
	await request(host, '/api/delete', {
		method: 'DELETE',
		body: { model: name },
		signal,
		timeoutMs: 30000
	});
	return { ok: true, name };
}

/**
 * Streams a chat completion. `onToken` receives each content fragment as it
 * arrives; the returned promise resolves with the full text and timings.
 */
export async function chat(
	messages,
	{ host = DEFAULT_HOST, model, signal, onToken, options } = {}
) {
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
 * The published catalogue.
 *
 * Three things this is careful to say correctly, because a catalogue that
 * looks complete is worse than an empty one that admits it could not check:
 *
 *  1. WHERE IT COMES FROM. The local daemon has no endpoint that lists the
 *     published registry — /api/tags reports what is INSTALLED, and the
 *     Docker-style /v2/_catalog answers 404. So this reaches ollama.com over
 *     the network and reads its library page. That is a documented behaviour of
 *     this application rather than a documented API of Ollama's, and the
 *     surface says so before the request rather than after.
 *  2. HOW MANY PAGES. Pages actually fetched are counted. `pages` used to be
 *     the literal 1 in every result, including the failure ones, so the note
 *     "verified complete across 1 page(s)" was a constant rather than a
 *     measurement.
 *  3. WHAT COMPLETENESS MEANS. There are three answers, not two. `complete`
 *     means the source declared no further pages and every page fetched
 *     succeeded. `incomplete` means a page failed. `unverified` means the
 *     document carried no pagination markup this parser recognises, so it
 *     cannot tell whether more pages exist — which is a different and more
 *     honest thing than assuming there are none. `complete: true` used to
 *     follow from nothing more than at least one link having matched.
 */

// Written as literals rather than as strings. A string pattern here lost its
// backslashes on the way through a shell, producing `?page=` with nothing to
// repeat — a RegExp that throws the moment the module is evaluated. Nothing
// caught it: the file parses perfectly, because the failure is at construction
// rather than at parse.
const NEXT_PAGE = /href="(\/library\?[^"]*page=\d+[^"]*)"/gi;
const PAGINATION_MARKUP = /(rel="next"|aria-label="[Pp]agination"|\?page=)/;
const MAX_PAGES = 40;

/** A short identifier for the exact document that was read. */
async function revisionOf(res, body) {
	const etag = res.headers && res.headers.get ? res.headers.get('etag') : null;
	if (etag) return { revision: etag.replace(/^W\//, '').replace(/"/g, ''), revisionFrom: 'ETag' };
	const modified = res.headers && res.headers.get ? res.headers.get('last-modified') : null;
	if (modified) return { revision: modified, revisionFrom: 'Last-Modified' };
	// No cache headers, so the body itself identifies the version. Two
	// catalogues can still be told apart, which is the point of recording one.
	try {
		const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
		const hex = Array.from(new Uint8Array(digest))
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');
		return { revision: hex.slice(0, 16), revisionFrom: 'SHA-256 of the page' };
	} catch {
		return { revision: null, revisionFrom: 'not available' };
	}
}

export async function fetchCatalog({ signal, source = 'https://ollama.com/library' } = {}) {
	const startedAt = Date.now();
	const names = new Set();
	const queue = [source];
	const seen = new Set();
	let pages = 0;
	let sawPaginationMarkup = false;
	let revision = null;
	let revisionFrom = 'not available';

	const fail = (reason) => ({
		models: [...names].sort().map((name) => ({ name })),
		pages,
		completeness: 'incomplete',
		complete: false,
		failure: reason,
		revision,
		revisionFrom,
		fetchedAt: new Date().toISOString(),
		tookMs: Date.now() - startedAt,
		source
	});

	while (queue.length) {
		const url = new URL(queue.shift(), source).href;
		if (seen.has(url)) continue;
		seen.add(url);
		if (pages >= MAX_PAGES) {
			// A cap is a cap, and a silently truncated catalogue is exactly the
			// thing being guarded against — so it is reported, not swallowed.
			return fail(
				'Stopped after ' +
					MAX_PAGES +
					' pages. The catalogue may go further; this is a bound on the request, not the end of the list.'
			);
		}

		let res;
		try {
			res = await fetch(url, { signal, cache: 'no-store' });
		} catch (e) {
			return fail('The catalogue could not be reached: ' + String(e && e.message ? e.message : e));
		}
		if (!res.ok) return fail('The catalogue page answered ' + res.status + ' for ' + url + '.');

		const html = await res.text();
		pages += 1;
		if (pages === 1) ({ revision, revisionFrom } = await revisionOf(res, html));

		const before = names.size;
		const LINK = new RegExp('href="/library/([a-z0-9][a-z0-9._-]*)"', 'gi');
		for (const m of html.matchAll(LINK)) names.add(m[1]);

		if (pages === 1 && names.size === before) {
			return fail(
				'The catalogue page loaded but no model links could be read from it, which means its markup changed and this parser needs updating.'
			);
		}

		if (PAGINATION_MARKUP.test(html)) sawPaginationMarkup = true;
		for (const m of html.matchAll(NEXT_PAGE)) {
			const href = new URL(m[1], source).href;
			if (!seen.has(href)) queue.push(href);
		}
	}

	// The verdict, and what it is based on. "Complete" is only ever said when a
	// check was actually performed.
	const completeness = sawPaginationMarkup ? 'complete' : 'unverified';
	const basis = sawPaginationMarkup
		? 'Followed every page the source linked to, and the last one linked to no further pages.'
		: 'The source carried no pagination markup this parser recognises, so it cannot confirm whether more pages exist. Everything on the page it did read is here.';

	const result = {
		models: [...names].sort().map((name) => ({ name })),
		pages,
		completeness,
		// Kept for callers that only ask the yes/no question. It is true only for
		// the verdict that earned it.
		complete: completeness === 'complete',
		basis,
		failure: null,
		revision,
		revisionFrom,
		fetchedAt: new Date().toISOString(),
		tookMs: Date.now() - startedAt,
		source
	};
	try {
		localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(result));
	} catch {
		/* quota */
	}
	return result;
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
		if (!res.ok)
			return { tags: [], complete: false, failure: 'The tag page answered ' + res.status + '.' };
		const html = await res.text();
		const tags = new Set();
		// A model name can contain a dot (qwen2.5), which is a regex metacharacter,
		// so it is escaped before being interpolated into the pattern.
		const escaped = name.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
		const TAG = new RegExp('href="/library/' + escaped + ':([^"]+)"', 'gi');
		for (const m of html.matchAll(TAG)) {
			tags.add(m[1]);
		}
		return {
			tags: [...tags].sort(),
			complete: tags.size > 0,
			failure: tags.size ? null : 'No tags could be read from the page.'
		};
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
	// A live fetch that read models is shown live whether or not completeness
	// could be VERIFIED — hiding a good catalogue because the verdict is
	// "unverified" would be worse than showing it with the verdict attached.
	if (fresh && fresh.models.length && !fresh.failure) {
		const pageWord = fresh.pages + ' page' + (fresh.pages === 1 ? '' : 's');
		return {
			source: 'live',
			catalog: fresh,
			// The heading and the note both follow the verdict rather than asserting
			// one. "Verified complete" used to be printed for any fetch that read at
			// least one link, which is not a verification of anything.
			title:
				fresh.completeness === 'complete'
					? 'Catalogue verified complete'
					: 'Catalogue read, completeness not verified',
			note:
				fresh.models.length +
				' models across ' +
				pageWord +
				', read just now. ' +
				(fresh.basis || '') +
				(fresh.revision
					? ' Source revision ' + fresh.revision + ' (' + fresh.revisionFrom + ').'
					: '')
		};
	}
	if (cached?.models?.length) {
		const age = catalogAgeDays(cached);
		return {
			source: 'cached',
			catalog: cached,
			note:
				'Showing the last catalogue read' +
				(age === null ? '' : age === 0 ? ' earlier today' : ' ' + age + ' day(s) ago') +
				'. ' +
				(fresh?.failure ?? 'The registry could not be reached now.') +
				' Nothing new is being guessed at.'
		};
	}
	return {
		source: 'none',
		catalog: { models: [], pages: fresh?.pages ?? 0, complete: false, completeness: 'incomplete' },
		note:
			'The published catalogue has never been fetched on this machine and the registry cannot be reached now, so there is nothing to browse. ' +
			(fresh?.failure ?? '') +
			' Installed models below are read from the local daemon and are unaffected.'
	};
}
