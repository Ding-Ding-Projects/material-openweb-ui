<div align="center">

<img src="docs/assets/favicon.svg" width="72" height="72" alt="Material Open WebUI">

# Material Open WebUI

**A Material Design 3 rewrite of [Open WebUI](https://github.com/open-webui/open-webui) as a self-contained Electron desktop app for Windows.**

Frameless Material 3 chrome · browser-style tabs · a local Ollama suite manager,
file converter and authenticator · bilingual English and Cantonese · fully
offline · nothing in it is ever for sale.

[**Documentation site →**](https://ding-ding-projects.github.io/material-openweb-ui/)

</div>

---

> [!IMPORTANT]
> **No installer has been published yet.** The desktop application runs from a
> checkout — the screenshots below are of it, against a real Ollama daemon — but
> nothing is packaged, so there is nothing to download. Every feature is marked
> with what is actually shipped and what is planned, and
> [`INVENTORY.md`](INVENTORY.md) is checked by a guard on every build so those
> claims cannot quietly drift away from the code.

## Install

There is nothing to install yet. When there is, it will be an **unsigned** Windows
installer — the operating system will warn you about it, and that warning will be
telling the truth. This project does not sign releases, ever, and says so before
the download rather than after.

In the meantime:

```bash
git clone https://github.com/Ding-Ding-Projects/material-openweb-ui
cd material-openweb-ui
build.bat
```

`build.bat` assumes a machine with nothing installed. It obtains its own
toolchain — including a Node version inside this project's supported range, since
upstream pins `<=22.x.x` with `engine-strict` on — installs dependencies, runs the
gates, and then asks whether to run what it built. `build.bat /s` does the same
with no prompts and a non-zero exit on the first real failure.

## Contents

[What this is](#what-this-is) ·
[Status](#status) ·
[Screenshots](#screenshots) ·
[Features](#features) ·
[Repository layout](#repository-layout) ·
[Development](#development) ·
[Working agreement](#working-agreement) ·
[Licence and attribution](#licence-and-attribution)

---

## What this is

Open WebUI does the hard work underneath: the model plumbing, the backend, the
years of it. This fork changes the interface and adds a desktop shell around it,
and it changes nothing about who deserves the credit. Upstream's own README is
preserved verbatim at [`README.upstream.md`](README.upstream.md).

The rewrite has three commitments that shape everything else.

**It runs where you are sitting.** Chats, settings, one-time codes and converted
files stay in the application on the machine you used. There is no account to
make, and nothing you have to switch off to keep it that way.

**Nothing on screen is decoration.** If it looks like a control, it works. A
button that cannot do its job names the condition that is unmet. An empty state
stays honestly empty instead of being filled with sample data. A screenshot slot
with no screenshot says so, rather than showing a mockup wearing one's clothes.

**Voice is adjustable; facts are not.** Three language modes and a funny-level
slider per language, from fully serious to maximum playfulness. At every level
the message still names what happened, what is affected, and what your options
are. A warning nobody can act on is a broken warning, not a funny one.

## Status

<details>
<summary><b>Where each surface actually is</b> — two running, one unpackaged</summary>

<br>

| Surface                 | State                                                                                                                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Documentation site**  | **Live** at [ding-ding-projects.github.io/material-openweb-ui](https://ding-ding-projects.github.io/material-openweb-ui/). Six tabbed destinations, a command palette, regex builders, three language modes, both themes, append-only local history, export. |
| **Desktop application** | **Runs from a checkout** via `npm run electron:dev`. Frameless Material 3 window with real IPC window controls; Ollama manager, chat, file converter and authenticator all working against real data. Several surfaces are still `planned` and say so.       |
| **Design**              | Landing page designed against the application's own token sheet — desktop, bilingual and phone views. Sources in [`design/landing/`](design/landing/).                                                                                                       |
| **Installer**           | **None.** Nothing is packaged, so there is nothing to download.                                                                                                                                                                                              |

The prototype in `design/` was not a mockup either: its one-time codes were real
and its converter really converted. What it simulated was the Ollama runtime and
the window controls — and those are exactly the two things this fork replaced
first, because they were the parts that could not be checked by looking.

</details>

## Screenshots

<details open>
<summary><b>Captures</b> — real ones, from the real application</summary>

<br>

**The Ollama page, against a running daemon.** Version and latency from
`/api/version`; three installed models with their real sizes and quantisation
from `/api/tags`; system memory and GPU measured through the desktop shell. The
model destination is empty in this capture, and the line beside it says so
rather than reporting a free-space figure it did not measure.

<img src="docs/assets/captures/app-ollama.png" width="820" alt="The Material Open WebUI Ollama page: a frameless dark Material 3 window with a docked tab strip on the left and a destination rail, showing Ollama running at version 0.32.14 on 127.0.0.1:11434 with 34 ms latency, this machine's 63.81 GB of memory and RTX 4070 Laptop GPU with 8 GB of video memory, a model destination field reading the daemon default beside a note that free space was therefore not measured, and three installed models with their real sizes and quantisation.">

**The authenticator, self-checked.** All eighteen RFC 6238 published vectors run
at startup across SHA-1, SHA-256 and SHA-512, and the system clock is compared
against network time — because a skewed clock is the failure nobody diagnoses:
the digits look perfectly fine and are refused everywhere.

<img src="docs/assets/captures/app-authenticator.png" width="820" alt="The authenticator page showing a green banner reading all 18 RFC 6238 test vectors pass, a note that the system clock is within 3 seconds of network time, a search field with a regex builder, and an honest empty state.">

Nothing in either image is staged. The models, the memory figure and the GPU
belong to the machine the capture was taken on, read live from Ollama's local
API and from the operating system — which is the point of capturing a built
artifact rather than drawing one.

Both were taken on an off-screen desktop, so the machine's visible session was
never disturbed. Every capture records the commit it came from in
[`docs/assets/captures/`](docs/assets/captures/).

**What is missing:** nothing that [`INVENTORY.md`](INVENTORY.md) claims. Every
row there now reads `shipped` or `na` on both surfaces, and `na` means the
feature does not belong on that surface rather than that it is pending. What is
genuinely absent is stated in the rows themselves — the adapters the converter
disables because nothing is bundled to run them, and the installer that has not
been built. Those say so where you would look for them.

</details>

## Features

<details>
<summary><b>The full list</b> — 37 features, with what is shipped and what is not</summary>

<br>

The complete catalogue with per-surface status is on the documentation site, and
every feature has its own article covering behaviour, failure modes and how to
verify it. The short version:

**Interface and navigation** — Material 3 throughout; a frameless window with a
custom title bar; browser-style tabs that dock to any edge with pinning, grouping
and an overflow surface; four tab-discovery searches; and a command palette on
`Ctrl+Shift+F` whose rows are live controls and which teleports to the exact
element rather than the general area.

**Search** — a regex builder anchored beside every search field, every dropdown
filter and every right-click menu filter. Plain text stays the default and regex
is an explicit opt-in.

**Models** — a local Ollama suite manager speaking only the documented local HTTP
API, with an exhaustive catalogue rather than a curated shortlist, and hardware
fit verdicts computed from measured RAM, VRAM and free disk rather than guessed
from a model name.

**Tools** — a file converter that detects type from actual bytes across eight
adapter categories and lists unavailable formats with the exact missing
dependency; and a standards-correct authenticator checked against the RFC 6238
published test vectors, with QR pairing drawn in-process and never by a remote
service.

**Locks** — per-element password or one-time-code locks, each with its own
independent credential, plus a support-desk recovery route and an unlock ladder
that clears the waiting and never the credential.

**Language** — three modes, two funny-level sliders, an emoji toggle, a
personal-vocabulary upload validated in full before anything is displayed, and a
narrator with a separate voice picker per narrated language.

**Safety and data** — a two-key-plus-slider gate on every destructive action;
non-blocking notifications with a reviewable centre; bulk actions on every list;
export in every format that can carry the data; append-only local history; and a
changelog viewer where every entry links to the commit that made the change.

</details>

## Repository layout

<details>
<summary><b>What lives where</b></summary>

<br>

| Path                 | What it is                                                                                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/`               | The Material Design 3 desktop frontend the shell loads. Vanilla ES modules, no build step, sharing the design-system primitives in `docs/assets/js/` so the two surfaces cannot drift apart. |
| `electron/`          | The desktop shell: frameless window, IPC window controls, backend supervisor, hardware probe.                                                                                                |
| `docs/`              | The documentation site, published to GitHub Pages. Vanilla ES modules, no build step, and no third-party request of any kind.                                                                |
| `docs/assets/fonts/` | Vendored Roboto Flex and Roboto Mono, latin subsets, 208 KB. Chinese uses the reader's platform face rather than shipping megabytes of CJK.                                                  |
| `design/`            | The Material 3 prototype, verbatim from the design tool. Reference only — never built, never linted, never edited in place.                                                                  |
| `design/landing/`    | The landing-page design sources.                                                                                                                                                             |
| `src/`, `backend/`   | Upstream Open WebUI, unmodified so far.                                                                                                                                                      |
| `scripts/`           | The completeness guard, its negative regression, and the line counter CI runs at release.                                                                                                    |
| `INVENTORY.md`       | The hand-written completeness inventory the guard checks the tree against.                                                                                                                   |
| `AGENTS.md`          | The full working agreement.                                                                                                                                                                  |
| `README.upstream.md` | Upstream Open WebUI's own README, preserved unchanged.                                                                                                                                       |

</details>

## Development

<details>
<summary><b>Running and checking it</b></summary>

<br>

The documentation site is static and needs no build:

```bash
npx http-server docs -p 8080 -c-1
```

The gates, which `build.bat` also runs:

```bash
node scripts/check-inventory.mjs
node scripts/test-inventory-guard.mjs
node scripts/count-lines.mjs
```

`check-inventory.mjs` fails when the tree and `INVENTORY.md` disagree in either
direction — a catalogued feature with no row, a row for a feature that no longer
exists, a shipped claim whose anchor does not resolve, a planned row that quietly
grew one, or a status the site renders that the inventory does not back up.

`test-inventory-guard.mjs` is the reason to trust any of that. It removes one
asserted item at a time from a scratch copy and requires the guard to turn red
for each, then requires green again once restored. On its first run it found a
real hole: renaming `searchField` to `searchFieldRenamed` left the guard green,
because a substring check still matched the old needle inside the new name. That
is exactly the failure a completeness guard is supposed to be immune to, and it
was sitting in the guard itself.

</details>

## Working agreement

<details>
<summary><b>The rules this project is built under</b> — summary; full text in AGENTS.md</summary>

<br>

[`AGENTS.md`](AGENTS.md) carries the complete, sanitized working agreement.
Anyone working in this repository, human or agent, is expected to follow it. The
parts that shape the code most:

- **Every rule applies to every surface** — the app, the site, the landing page,
  every settings screen, every dialog, individually. "It is only docs" is not an
  exemption. Where a rule genuinely cannot apply, say which rule and why rather
  than leaving a silent gap that reads as an oversight to the next person and as
  a decision to nobody.
- **Feature delivery is fail-closed**, tracked by a hand-written inventory and a
  guard that has been watched fail. A checklist that discovers its own items can
  never notice that an item disappeared.
- **Never present unreleased work as shipped.** Status is stated per surface, and
  "planned" is written where it is true.
- **Plain text is the default search mode, and a regex builder is anchored beside
  every field** — including every dropdown and every right-click menu. Four items
  is not an exemption, because a four-item menu becomes fourteen without anyone
  revisiting the decision.
- **Destructive actions need two independent keys and a slider**, and name the
  exact data affected at every language and funny level.
- **Credentials never enter settings files, exports, logs, screenshots or version
  control**, and a toy lock never claims to secure anything.
- **No CDN, no remote font, no remote image, no analytics** on any surface.
- **Accessibility and clipping defects are completion blockers**, not polish.
- **Commits are bilingual**, carry one author, and say what actually changed.
- **Nobody ever pays anything**, and there are no prompts asking them to.

</details>

## Licence and attribution

<details>
<summary><b>Upstream, licence, and why the branding stays</b></summary>

<br>

This repository is a fork of [**Open WebUI**](https://github.com/open-webui/open-webui)
by Open WebUI Inc., created by Timothy Jaeryang Baek. The upstream project is the
substance underneath this one, and its README is preserved at
[`README.upstream.md`](README.upstream.md).

The code is governed by multiple licences depending on when it was contributed —
see [`LICENSE`](LICENSE), [`LICENSE_HISTORY`](LICENSE_HISTORY) and
[`LICENSE_NOTICE`](LICENSE_NOTICE). Clause 4 of the Open WebUI License restricts
altering or removing "Open WebUI" branding above a threshold of fifty end users in
any rolling thirty-day period. A single-user desktop application sits inside that
exemption, and this project keeps the upstream name and attribution regardless,
because the interface is what changed and the credit is not.

Nothing here is for sale, and no funding link on this project routes anything away
from upstream.

</details>

---

<div align="center">
<sub>A Ding Ding Projects application · unsigned by policy · everything stays local</sub>
</div>
