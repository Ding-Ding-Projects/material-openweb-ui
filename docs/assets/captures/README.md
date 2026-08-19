# Captures

Real captures of real built artifacts, each taken through an off-screen desktop
so the machine's visible session is never disturbed. Nothing in this folder is a
mockup, a design export, or a hand-edited image.

Every entry records the commit it was taken at. A capture whose commit is behind
the surface it claims to show is worse than no capture, because it is confidently
wrong and the reader has no way to tell — so when a surface changes, the capture
is retaken rather than left to age.

The Ollama capture has been retaken once for exactly that reason: the older one
showed a banner reading "Catalogue verified complete", and that claim turned out
to be printed on every successful fetch whether or not anything had been
verified. Leaving the image would have preserved a sentence the code no longer
says.

| File                          | Shows                                                                                                                                                                                                                                                                                                                                                    | Commit      | Taken      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| `app-ollama.png`              | The Ollama page against a real daemon: version and 34 ms latency from `/api/version`, three installed models with their real sizes and quantisation from `/api/tags`, system memory and GPU measured through the shell, the tab strip docked to the left edge, and the model destination empty with a line saying free space was therefore not measured. | `d27a54c00` | 2026-08-19 |
| `app-authenticator.png`       | The authenticator with all 18 RFC 6238 vectors passing, the system-clock check reporting a 3-second offset, and an honest empty state.                                                                                                                                                                                                                   | `58d546e2d` | 2026-08-19 |
| `app-packaged-0.1.0.png`      | The INSTALLED artifact — not the development tree — running from inside its own asar at v0.1.0: the frontend loaded from the package, a real Ollama daemon at 43 ms, this machine's real memory, GPU and installed models, and the tab strip docked left. This is the evidence that what was published actually runs.                                    | `8fe974763` | 2026-08-19 |
| `desktop-shell-not-built.png` | The Electron shell running with no compiled frontend present — frameless, on the Material 3 dark surface token, naming the command that would produce one. Kept because it is the state a fresh checkout is in.                                                                                                                                          | `6173dc348` | 2026-08-19 |

## What the numbers in these captures are

The figures are not staged. The models, sizes, GPU and memory belong to the
machine the capture was taken on, read live from Ollama's local API and from the
operating system. That is the point of capturing a built artifact rather than
drawing one: a screenshot of invented data proves nothing about whether the code
can obtain real data.

## What is missing, and why

There is no capture of the chat surface mid-stream, the converter with a file
loaded, or any surface still marked `planned` in `INVENTORY.md`. Those gaps are
left visible rather than filled with something that has never run.

## How they are taken

An off-screen Win32 desktop is created, the built executable is launched onto
it, its window handle is resolved at run time, and the window is captured
directly via `PrintWindow`. The visible desktop, the cursor, keyboard focus and
the foreground application are all untouched, which is what makes it safe to
take a capture in the middle of somebody else's working session.
