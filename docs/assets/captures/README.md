# Captures

Real captures of real built artifacts, each taken through an off-screen desktop
so the machine's visible session is never disturbed. Nothing in this folder is a
mockup, a design export, or a hand-edited image.

Every entry records the commit it was taken at. A capture whose commit is behind
the surface it claims to show is worse than no capture, because it is confidently
wrong and the reader has no way to tell — so when a surface changes, the capture
is retaken rather than left to age.

| File | Shows | Commit | Taken |
| --- | --- | --- | --- |
| `desktop-shell-not-built.png` | The Electron shell running with no compiled frontend present. Frameless, on the Material 3 dark surface token, showing the honest not-built page with the exact command that would produce one. | `6173dc348` | 2026-08-19 |

## What is missing, and why

There is no capture of the Material Design 3 application interface, because it is
not implemented yet — `INVENTORY.md` marks it planned. The gap is stated here
rather than filled with a screenshot of the prototype, which would show something
that has never run as this product.

## How they are taken

An off-screen Win32 desktop is created, the built executable is launched onto it,
its window handle is resolved at run time, and the window is captured directly
via `PrintWindow`. The visible desktop, the cursor, keyboard focus and the
foreground application are all untouched, which is what makes it safe to take a
capture in the middle of somebody else's working session.
