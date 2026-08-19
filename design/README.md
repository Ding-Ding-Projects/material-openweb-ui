# Design reference — Material Design 3 rewrite prototype

This folder is a **verbatim copy of the source design prototype**. It is reference material for
implementers. Nothing here is built, bundled, linted, formatted, or shipped, and nothing in
`src/` or `electron/` imports from it.

| File | What it is |
| --- | --- |
| `HANDOFF.md` | Developer handoff: architecture target, Material Design 3 token seed, the feature-contract wiring table, the persistence data map, and the four simulated-to-real swap points. |
| `Open WebUI MD3.dc.html` | The prototype itself — token stylesheet, declarative template, and component logic in one file. Open it directly in a browser to compare a surface side by side with the implementation. |
| `app-core.js` | Pure logic extracted from the prototype: TOTP, byte-signature sniffing, the converter adapter registry, vocabulary validation, and search helpers. Ported to TypeScript under `src/lib/md3/core/`. |
| `support.js` | Generated canvas runtime that makes the prototype render. Third-party build output — not part of this application and not ported. |
| `.thumbnail` | Preview image emitted by the design tool. |

## Reading it

The prototype is a single component. Its template uses `sc-if` / `sc-for` and `{{ }}` bindings;
its logic is a class whose `*Vals` methods build the view model for each surface. Those methods
map one-to-one onto the Svelte stores and derived view models in `src/lib/md3/`, so they are the
right unit to compare against when checking whether a surface is faithful.

The prototype simulates the Ollama runtime and stubs the window controls. The shipped application
does neither — see the swap points in `HANDOFF.md`.

## Do not edit

Changes belong in the design source, then get re-exported here whole. Editing a file in this
folder makes it disagree with the design it is supposed to represent, which is the one job it has.
