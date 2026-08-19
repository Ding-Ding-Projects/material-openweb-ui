# Open WebUI → Material 3 Electron rewrite — developer handoff

Prototype: `Open WebUI MD3.dc.html` (+ `app-core.js`). Every visible control works; state persists in localStorage under the `owmd3.` prefix. The Ollama runtime is simulated — swap points are marked below.

## Architecture target

- Electron (frameless `BrowserWindow`, `titleBarStyle: hidden`), single renderer.
- Keep Open WebUI's SvelteKit routes as the information architecture (mirrored in this prototype's pages); replace all Tailwind chrome with M3 tokens below.
- Window controls in the prototype call stubs — wire to `ipcRenderer.send('window:minimize' | 'window:maximize' | 'window:close')`.

## M3 tokens

Seed `#6750A4`, standard Material baseline scheme. Full light/dark CSS custom properties are in the `<helmet><style>` of the prototype (`--p`, `--pc`, `--sur`, `--sc*`, `--ons`, `--onsv`, `--out*`, `--err*`, elevation shadows). Type: Roboto Flex + Roboto Mono; icons: Material Symbols Rounded. Shape: 12–28px radii; full-round buttons/fields per M3.

## Feature contract wiring (the @uh universal features)

| Feature | Prototype implementation | Production notes |
| --- | --- | --- |
| Browser-style tabs | Tab strip above content; open/close/duplicate, persisted; context menu | Keep per-page tab model; restore session on launch |
| Tab + toy locks | Right-click any `[data-lock]` element or tab → anchored lock wizard; password or TOTP (real HMAC-SHA1); duration; disclosure; unlock prompt anchored | Store per-element credentials separately; never reuse state between elements |
| Ctrl+Shift+F palette | Global keydown; fuzzy + regex search over pages/settings/actions; teleports and focuses | Index every settings row id (`set-*`, `search-*` ids already present) |
| Regex builder | `.*` button beside every search field opens anchored builder: pattern, i/m flags, token inserts, live validity + sample match count | Reuse component; plain-text stays default |
| Ollama suite manager | Overview (daemon card, installed models, pull progress, delete via super-confirm), Model Store (search+regex, fit verdicts vs simulated 16 GB probe, pulls), quick chat | Replace `app-core.js` simulated store/pulls with the documented local HTTP API: `/api/tags`, `/api/pull`, `/api/delete`, `/api/chat` (stream). Probe RAM/GPU via Electron main process |
| File converter | Byte-signature sniffing (magic numbers, text heuristics); 8-category adapter catalog; unavailable adapters visibly disabled with exact missing dependency; canvas/image, JSON↔CSV, base64/hex conversions run for real; result history with downloads | Add ffmpeg.wasm, pdf-lib, zip reader adapters to close the disabled rows |
| Authenticator | Real TOTP (WebCrypto HMAC-SHA1, Base32), 30s countdown, copy, search+regex, delete gated | Persist in app-data local Git history repo per contract |
| Vocabulary upload | Settings → Personalization; JSON validated (version + terms array, 2 MB bound); no-file/loaded/invalid/replace/clear states | Keep cache private+local; never sync |
| Language modes | English / Cantonese / Bilingual select persisted; Cantonese copy pending (falls back with honest note) | Drop in string tables when copy arrives |
| Funny levels | Two 1–5 sliders (EN/Canto), persisted; affects greeting copy | Extend to all narrated/UI strings |
| School mode | Renameable; enable sets local PIN; while on, playful surfaces (language, funny, vocabulary, dim-sum) are omitted, not just disabled; PIN to turn off; honest not-a-security-boundary copy | Store in shared app-data location across your apps |
| Emoji toggle | Persisted; decorates dialog titles only, never buttons/labels | |
| TTS narrator | Off by default; system voices enumerated, user-selectable, test line; narrates app events | Both-language serialization when Cantonese lands |
| Scheduled settings | Daily HH:MM schedules for theme/language/narrator; fires live; last-fired shown | Extend to density/accent/fonts |
| Logo customization | 4 presets + local upload (1 MB bound, validated), fit + background controls, live in titlebar/sidebar/auth, reset | Also generate .ico/installer marks at build; presentation never changes app identity |
| Destructive super-confirmation | Type DELETE + full slider, both required; used by every delete (chats, models, TOTP entries, vocabulary, wipe) | Native in-app layer, no helper window |
| Status Hub | Live session card + real event log (all features log) | Publish to shared hub inbox with Ed25519 signing in packaged build |
| Changelog | Full in-app viewer, every version, categorized | Append per release |
| Dim-sum surprise | 10% on launch (tweakable prop); suppressed by School mode; real catalog photo URLs for dishes 0002/0003, honest placeholder otherwise | Source images only from the public dim-sum-photos catalog releases |

## Data map (localStorage → production store)

`owmd3.user` (SHA-256 password hash), `settings`, `tabs`/`activeTab`, `chats`, `installed`, `wsModels`/`prompts`/`knowledge`/`tools`, `totp`, `locks`, `statusLog`, `convResults`. Export-all excludes `locks` and `totp` by design.

## Simulated → real swap points

1. `app-core.js` `OLLAMA_STORE`, `fitVerdict`, `simulatedReply` → live API + real probe.
2. Chat streaming `setInterval` in `sendMsg`/`olcSend` → fetch stream from `/api/chat`.
3. Window control stubs → Electron IPC.
4. Single-user auth → Open WebUI backend auth when multi-user.
