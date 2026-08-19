// The renderer's half of the bridge to the desktop shell.
//
// Everything here degrades honestly when `window.electronAPI` is absent — the
// same files open in an ordinary browser for development, and the surfaces that
// need the shell say so rather than throwing or silently doing nothing.

const api = typeof window !== 'undefined' ? window.electronAPI : undefined;

export const isDesktop = !!api;

async function send(message) {
	if (!api) return null;
	try {
		return await api.send(message);
	} catch (e) {
		console.error('desktop bridge failed for ' + message.type, e);
		return null;
	}
}

export const windowControls = {
	minimize: () => send({ type: 'window:minimize' }),
	toggleMaximize: () => send({ type: 'window:maximize' }),
	close: () => send({ type: 'window:close' }),
	state: () => send({ type: 'window:state' })
};

export const appInfo = () => send({ type: 'app:info' });
export const appData = () => send({ type: 'app:data' });
export const backendState = () => send({ type: 'backend:state' });
export const startBackend = () => send({ type: 'backend:start' });
export const probeHardware = (destination) => send({ type: 'hardware:probe', destination });

/**
 * Fit verdicts for a list of models, against this machine as it is right now.
 *
 * The hardware is probed once per call rather than once per model, and the
 * probe travels back with the verdicts so the surface can show what each one
 * was measured against and when.
 */
export const fitModels = (models, destination) =>
	send({ type: 'hardware:fit', models, destination });
export const openPath = (path) => send({ type: 'shell:openPath', path });

/** Subscribe to lifecycle events pushed by the main process. */
export function onEvent(handler) {
	if (!api?.onEvent) return () => {};
	return api.onEvent(handler) ?? (() => {});
}
