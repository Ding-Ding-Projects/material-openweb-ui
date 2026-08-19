// Supervises the Open WebUI Python backend as a child of this process.
//
// The application is meant to run without anybody starting a server first, so
// the desktop shell owns that lifecycle. What it will not do is pretend: when
// no Python runtime can be found, the renderer is told exactly that and lights
// up local-only mode, rather than showing a spinner over a server that was
// never going to arrive.

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';

export type BackendState =
  | { status: 'stopped' }
  | { status: 'starting'; port: number }
  | { status: 'ready'; port: number; url: string }
  | { status: 'unavailable'; reason: string; tried: string[] }
  | { status: 'failed'; reason: string; exitCode: number | null };

type Listener = (state: BackendState) => void;

const HEALTH_TIMEOUT_MS = 60_000;
const HEALTH_INTERVAL_MS = 400;

export class Backend {
  private child: ChildProcess | null = null;
  private state: BackendState = { status: 'stopped' };
  private listeners = new Set<Listener>();

  constructor(private readonly repoRoot: string) {}

  current(): BackendState {
    return this.state;
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(state: BackendState) {
    this.state = state;
    for (const fn of this.listeners) {
      try {
        fn(state);
      } catch (e) {
        console.error('backend listener failed', e);
      }
    }
  }

  /**
   * Candidate interpreters, most specific first. A virtual environment inside
   * the checkout is preferred over whatever happens to be on PATH, because that
   * is the one whose dependencies were installed for this project.
   */
  private candidates(): { label: string; exe: string }[] {
    const backendDir = join(this.repoRoot, 'backend');
    const out: { label: string; exe: string }[] = [
      { label: 'checkout .venv', exe: join(this.repoRoot, '.venv', 'Scripts', 'python.exe') },
      { label: 'checkout .venv (posix)', exe: join(this.repoRoot, '.venv', 'bin', 'python') },
      { label: 'backend .venv', exe: join(backendDir, '.venv', 'Scripts', 'python.exe') },
      { label: 'backend .venv (posix)', exe: join(backendDir, '.venv', 'bin', 'python') }
    ];
    // A bundled runtime, once packaging ships one.
    out.push({ label: 'bundled runtime', exe: join(process.resourcesPath ?? '', 'python', 'python.exe') });
    return out;
  }

  private async freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const srv = createServer();
      srv.once('error', reject);
      srv.listen(0, '127.0.0.1', () => {
        const addr = srv.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        srv.close(() => resolve(port));
      });
    });
  }

  private async healthy(port: number): Promise<boolean> {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1500) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async start(): Promise<BackendState> {
    if (this.state.status === 'ready' || this.state.status === 'starting') return this.state;

    const tried: string[] = [];
    let python: string | null = null;
    for (const c of this.candidates()) {
      tried.push(`${c.label} (${c.exe})`);
      if (c.exe && existsSync(c.exe)) {
        python = c.exe;
        break;
      }
    }

    if (!python) {
      // Honest, and specific about what was looked for. "Backend unavailable"
      // on its own sends people hunting.
      this.set({
        status: 'unavailable',
        reason:
          'No Python runtime was found for the Open WebUI backend. The application runs local-only until one exists: chats, settings and one-time codes still work, and the surfaces that need the backend say so rather than showing an empty table.',
        tried
      });
      return this.state;
    }

    const port = await this.freePort();
    this.set({ status: 'starting', port });

    const backendDir = join(this.repoRoot, 'backend');
    this.child = spawn(
      python,
      ['-m', 'uvicorn', 'open_webui.main:app', '--host', '127.0.0.1', '--port', String(port)],
      {
        cwd: existsSync(backendDir) ? backendDir : this.repoRoot,
        env: { ...process.env, WEBUI_AUTH: process.env.WEBUI_AUTH ?? 'False' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      }
    );

    this.child.stdout?.on('data', (d) => process.stdout.write(`[backend] ${d}`));
    this.child.stderr?.on('data', (d) => process.stderr.write(`[backend] ${d}`));

    this.child.on('exit', (code) => {
      this.child = null;
      if (this.state.status !== 'stopped') {
        this.set({
          status: 'failed',
          reason: 'The backend process exited. Its output is in this window\'s console.',
          exitCode: code
        });
      }
    });

    // A local flag rather than re-reading this.state: the exit handler above can
    // move the state underneath us, and asking "is it still starting?" after the
    // loop reads as a race even where it happens not to be one.
    let settled = false;
    const deadline = Date.now() + HEALTH_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (!this.child) break;
      if (await this.healthy(port)) {
        this.set({ status: 'ready', port, url: `http://127.0.0.1:${port}` });
        settled = true;
        break;
      }
      await new Promise((r) => setTimeout(r, HEALTH_INTERVAL_MS));
    }

    if (!settled && this.state.status !== 'failed') {
      this.set({
        status: 'failed',
        reason: `The backend did not answer /health within ${HEALTH_TIMEOUT_MS / 1000}s. It may still be installing dependencies on first run.`,
        exitCode: null
      });
    }
    return this.state;
  }

  /** Terminates the child. Called on window-all-closed and before quit. */
  stop(): void {
    const child = this.child;
    this.child = null;
    this.set({ status: 'stopped' });
    if (!child) return;
    try {
      child.kill();
    } catch {
      /* already gone */
    }
  }
}
