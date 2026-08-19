// The only bridge between the renderer and the main process.
//
// Context isolation stays on and node integration stays off, so the renderer
// gets exactly this surface and nothing else. The shape is not invented here:
// upstream's frontend already probes for `window.electronAPI` and calls
// `send({ type })`, `onEvent(handler)` and `load(name)`, so those are what this
// exposes. Window controls travel down the same `send` channel rather than as a
// second parallel API, because one channel is one thing to reason about.

import { contextBridge, ipcRenderer } from 'electron';

export type DesktopMessage =
  | { type: 'app:info' }
  | { type: 'app:data' }
  | { type: 'window:isFocused' }
  | { type: 'window:minimize' }
  | { type: 'window:maximize' }
  | { type: 'window:close' }
  | { type: 'window:state' }
  | { type: 'backend:state' }
  | { type: 'backend:start' }
  | { type: 'hardware:probe'; destination?: string }
  | {
      type: 'hardware:fit';
      destination?: string;
      models: Array<{ id: string; blobBytes?: number; parameterCount?: number; quantisation?: string; contextTokens?: number }>;
    }
  | { type: 'token:update'; token: string }
  | { type: 'shell:openPath'; path: string }
  | { type: 'shell:showItemInFolder'; path: string };

const listeners = new Set<(event: unknown) => void>();

ipcRenderer.on('desktop:event', (_e, payload) => {
  for (const fn of listeners) {
    try {
      fn(payload);
    } catch (err) {
      console.error('desktop event listener failed', err);
    }
  }
});

contextBridge.exposeInMainWorld('electronAPI', {
  /** Request/response over one channel. Rejects rather than resolving undefined. */
  send: (message: DesktopMessage) => ipcRenderer.invoke('desktop:send', message),

  /** Lifecycle events pushed from the main process. Returns an unsubscribe. */
  onEvent: (handler: (event: unknown) => void) => {
    listeners.add(handler);
    return () => listeners.delete(handler);
  },

  /** Navigate the shell to a named view. */
  load: (name: string) => ipcRenderer.invoke('desktop:send', { type: 'shell:load', name })
});
