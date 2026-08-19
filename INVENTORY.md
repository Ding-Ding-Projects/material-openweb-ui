# Completeness inventory

This file is written by hand, and it is the thing `scripts/check-inventory.mjs`
checks the repository against. It exists because a guard that only validates the
features it can already find passes cleanly on a project that has lost one — the
list has to be independent of the code for the check to mean anything.

Every canonical feature gets a row. A row claiming `shipped` on a surface must
name an anchor — `path#needle` — that really resolves in the tree, or the guard
fails. A row claiming `planned` is honest about not being built, and the guard
holds it to having no anchor rather than letting it quietly carry a stale one.

Run it:

```bash
node scripts/check-inventory.mjs
```

The negative regression that proves the guard can actually fail lives in
`scripts/test-inventory-guard.mjs`. It removes one asserted item at a time from
a scratch copy and requires the guard to turn red each time, then requires it to
turn green again once restored. A guard nobody has watched fail is a guard
nobody should trust.

## Surfaces

| Key | Surface |
| --- | --- |
| `site` | The documentation and landing site in `docs/`, published to GitHub Pages |
| `app` | The Electron desktop application in `app/`, run by the shell in `electron/` |

## Rows

| id | Feature | site | app | Implementation anchor | Docs |
| --- | --- | --- | --- | --- | --- |
| md3 | Material Design 3 throughout | shipped | shipped | `app/css/app.css#titlebar` | content.js |
| frameless | Frameless window and custom title bar | na | shipped | `electron/main.ts#titleBarStyle` | content.js |
| tabs | Browser-style tabs | partial | shipped | `app/js/core/tabs.js#export function ordered` | content.js |
| tabsearch | Four tab-discovery searches | na | shipped | `app/js/tabs-ui.js#export function searchDialog` | content.js |
| palette | Command palette on Ctrl+Shift+F | shipped | shipped | `docs/assets/js/palette-core.js#export function createPalette` | content.js |
| regex | A regex builder beside every search field | shipped | partial | `docs/assets/js/regex.js#export function searchField` | content.js |
| chat | Chat with a local model | na | partial | `app/js/core/ollama.js#export async function chat` | content.js |
| ollama | Local Ollama suite manager | na | partial | `app/js/core/ollama.js#export async function pull` | content.js |
| fit | Evidence-backed hardware fit verdicts | na | partial | `electron/hardware.ts#export function fit` | content.js |
| converter | Universal file converter | na | partial | `app/js/core/convert.js#export function sniff` | content.js |
| authenticator | Built-in authenticator | planned | partial | `app/js/core/totp.js#export async function totp` | content.js |
| qr | QR pairing for one-time-code registration | na | shipped | `app/js/core/qr.js#export function encode` | content.js |
| locks | Toy locks on every element | planned | shipped | `app/js/core/locks.js#export async function create` | content.js |
| tickets | Support Tickets | planned | shipped | `app/js/locks-ui.js#export function supportTickets` | content.js |
| ladder | The unlock ladder | planned | shipped | `app/js/locks-ui.js#export function startingRung` | content.js |
| language | Three language modes | shipped | shipped | `app/js/i18n.js#export const LANGUAGES` | content.js |
| funny | A funny level for each language | shipped | shipped | `app/js/i18n.js#export function levelLabel` | content.js |
| vocab | Personal vocabulary upload | shipped | shipped | `app/js/core/vocabulary.js#export function validate` | content.js |
| narrator | Spoken narrator | planned | shipped | `app/js/core/narrator.js#export function resolve` | content.js |
| school | School mode | planned | shipped | `app/js/i18n.js#PLAYFUL_SETTINGS` | content.js |
| schedule | Scheduled settings | na | shipped | `app/js/core/schedule.js#export function resolve` | content.js |
| appearance | Per-element appearance editor | na | shipped | `app/js/appearance.js#export function editor` | content.js |
| colour | Infinite colour picker with translator | na | shipped | `app/js/colour-picker.js#export function colourPicker` | content.js |
| logo | App logo customisation | na | shipped | `app/js/core/logo.js#export function inspect` | content.js |
| rename | Rename the product | shipped | planned | `docs/assets/js/settings.js#set-app-name` | content.js |
| confirm | Destructive-action super confirmation | shipped | shipped | `docs/assets/js/ui.js#export function superConfirm` | content.js |
| notify | Non-blocking notifications with a reviewable centre | shipped | shipped | `docs/assets/js/ui.js#export function notify` | content.js |
| bulk | Bulk actions on every list | partial | planned | `docs/assets/js/pages.js#Select all` | content.js |
| export | Export everything, in every format that fits | shipped | partial | `app/js/app.js#function exportAll` | content.js |
| history | Local version history | shipped | planned | `docs/assets/js/store.js#export function record` | content.js |
| changelog | Changelog viewer | shipped | planned | `docs/assets/js/pages.js#function changelog` | content.js |
| status | Status Hub | shipped | partial | `app/js/pages/misc.js#export function renderStatus` | content.js |
| dimsum | Dim sum surprise | partial | partial | `app/js/app.js#function maybeDimSum` | content.js |
| a11y | Accessibility and responsive layout | shipped | partial | `docs/assets/css/site.css#skip-link` | content.js |
| buildscript | One-click build script | shipped | shipped | `scripts/build.ps1#Get-EngineRange` | content.js |
| nosign | Permanently unsigned releases | na | planned | — | content.js |
| free | Nothing is ever for sale | shipped | shipped | `docs/assets/js/i18n.js#foot.free` | content.js |

## What the guard checks

1. **Every feature in `docs/assets/js/content.js` has a row here.** A feature
   that disappears from this file fails the build, which is the failure mode a
   self-derived checklist can never catch.
2. **Every row here names a feature that exists.** A row for something deleted
   is a stale claim, and stale claims are what make an inventory useless.
3. **Every `shipped` claim resolves.** The anchor's file must exist and must
   contain the needle. Renaming the function without updating the row fails.
4. **Every `planned` and `na` row carries no anchor.** A planned feature that
   quietly gained an anchor is either shipped and mislabelled, or the anchor is
   fiction; both are worth failing over.
5. **The site's status matches the catalogue.** `content.js` and this file must
   agree on what is shipped, so the page a reader sees cannot claim more than
   the inventory does.

## What it deliberately does not check

The guard proves an implementation exists at the named place. It cannot prove
the implementation is correct, accessible, localised at every funny level, or
captured against a built artifact — those need the tests and the capture harness,
which are named in the roadmap and are not written yet. Saying so here is the
point: a guard that implied otherwise would be a worse guard.
