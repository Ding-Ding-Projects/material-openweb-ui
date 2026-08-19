// The desktop shell.
//
// A frameless window with the operating system's own title bar hidden, because
// the product draws its own. Window controls are real IPC rather than stubs.
//
// What it will not do is open a blank window. If there is no built frontend to
// load, it says so on screen with the exact command that would produce one — an
// empty white rectangle is the least diagnosable failure a desktop app has.

import { app, BrowserWindow, ipcMain, shell, nativeTheme } from 'electron';
import { join, dirname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Backend } from './backend.js';
import { probe } from './hardware.js';

const __dirname_ = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname_, '..', '..');

const APP_ID = 'projects.dingding.material-openweb-ui';
const SHIPPED_NAME = 'Material Open WebUI';

let win: BrowserWindow | null = null;
const backend = new Backend(REPO_ROOT);

// The display name is the user's to change; the identity is not. Both are read
// from here so nothing else is tempted to derive one from the other.
function appIdentity() {
  let version = '0.0.0';
  try {
    version = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).version ?? version;
  } catch {
    /* keep the fallback */
  }
  return { id: APP_ID, name: SHIPPED_NAME, version, userData: app.getPath('userData') };
}

function builtFrontend(): string | null {
  const candidates = [join(REPO_ROOT, 'build', 'index.html'), join(__dirname_, '..', 'build', 'index.html')];
  return candidates.find((p) => existsSync(p)) ?? null;
}

/**
 * Shown when there is nothing built to load. It names the exact command rather
 * than saying "not found", because the person reading it is usually one command
 * away from a working app and does not know which one.
 */
function notBuiltPage(): string {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${SHIPPED_NAME}</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; font-family:"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;
         background:#141218; color:#E6E0E9; display:flex; align-items:center;
         justify-content:center; height:100vh; -webkit-app-region: drag; }
  main { max-width: 560px; padding: 40px; -webkit-app-region: no-drag; }
  h1 { font-size: 1.6rem; margin: 0 0 14px; letter-spacing:-.02em }
  p { line-height:1.65; color:#CAC4D0; margin:0 0 14px }
  code { font-family:"Cascadia Mono",Consolas,monospace; background:#211F26;
         padding:3px 8px; border-radius:6px; display:inline-block }
  .mark { width:52px;height:52px;border-radius:16px;background:#D0BCFF;margin-bottom:20px }
</style></head><body><main>
  <div class="mark"></div>
  <h1>Nothing is built yet</h1>
  <p>The desktop shell started, but there is no compiled frontend for it to load,
     so it is showing you this instead of an empty window.</p>
  <p>Build one with:</p>
  <p><code>npm run build</code></p>
  <p>Then start the shell again. The Material Design 3 frontend this shell is
     meant to load is not implemented yet — <code>INVENTORY.md</code> marks it
     planned rather than shipped.</p>
</main></body></html>`;
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 420,
    minHeight: 520,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#141218' : '#FEF7FF',
    title: SHIPPED_NAME,
    webPreferences: {
      // Electron detects an ESM preload by extension, so the compiled file is
      // copied to .mjs after tsc; a .js preload here loads as CommonJS and the
      // import statements inside it throw before contextBridge is ever reached.
      preload: join(__dirname_, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  // Nothing in this application opens a third-party page in-window. External
  // links go to the real browser, where the address bar is visible.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  const devUrl = process.env.MOWUI_DEV_URL;
  const built = builtFrontend();

  if (devUrl) win.loadURL(devUrl);
  else if (built) win.loadFile(built);
  else win.loadURL(notBuiltPage());

  win.once('ready-to-show', () => win?.show());
  win.on('closed', () => { win = null; });

  // Attached individually rather than looped: BrowserWindow.on is heavily
  // overloaded, and a union of event names does not resolve against it.
  const report = (name: string) => () =>
    pushEvent({ type: 'window:' + name, isMaximized: win?.isMaximized() ?? false });
  win.on('maximize', report('maximize'));
  win.on('unmaximize', report('unmaximize'));
  win.on('focus', report('focus'));
  win.on('blur', report('blur'));
}

function pushEvent(payload: unknown) {
  win?.webContents.send('desktop:event', payload);
}

ipcMain.handle('desktop:send', async (_e, message: { type: string; [k: string]: unknown }) => {
  switch (message?.type) {
    case 'app:info':
      return appIdentity();

    case 'app:data':
      return { backend: backend.current(), platform: process.platform, arch: process.arch };

    case 'window:isFocused':
      return { isFocused: win?.isFocused() ?? false };

    case 'window:minimize':
      win?.minimize();
      return { ok: true };

    case 'window:maximize':
      if (win?.isMaximized()) win.unmaximize();
      else win?.maximize();
      return { ok: true, isMaximized: win?.isMaximized() ?? false };

    case 'window:close':
      win?.close();
      return { ok: true };

    case 'window:state':
      return { isMaximized: win?.isMaximized() ?? false, isFocused: win?.isFocused() ?? false };

    case 'backend:state':
      return backend.current();

    case 'backend:start':
      return backend.start();

    case 'hardware:probe':
      return probe(typeof message.destination === 'string' ? message.destination : undefined);

    case 'token:update':
      // Deliberately not stored, not logged and not written anywhere. The token
      // belongs to the renderer's session; the shell has no use for a copy, and
      // a copy is a thing that can leak.
      return { ok: true };

    case 'shell:openPath':
      // The recovery route opens the folder and stands back. It never deletes.
      if (typeof message.path === 'string') await shell.openPath(message.path);
      return { ok: true };

    case 'shell:showItemInFolder':
      if (typeof message.path === 'string') shell.showItemInFolder(message.path);
      return { ok: true };

    case 'shell:load':
      return { ok: false, reason: 'Named views are not implemented yet in this shell.' };

    default:
      return { ok: false, reason: 'Unknown message type: ' + String(message?.type) };
  }
});

app.setAppUserModelId(APP_ID);

// One window, one instance. A second launch focuses the first rather than
// starting a rival copy pointed at the same data directory.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    createWindow();
    backend.onChange((state) => pushEvent({ type: 'backend:state', state }));
    // Not awaited: a slow or absent backend must never delay the window.
    backend.start().catch((e) => console.error('backend start failed', e));

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    backend.stop();
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => backend.stop());
}
