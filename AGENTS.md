# Working agreement

A mirror of the shared instructions this project is built under, sanitized for a
public repository: the rules are kept in full, and everything identifying where
they were written — machine names, absolute paths, accounts, hosts, addresses,
credentials — is removed. Edit the canonical instructions first; this copy is
refreshed from them rather than edited in place.

Anyone working in this repository, human or agent, is expected to follow it.

---

## 1. Scope: every rule applies to every surface

Unless a rule names a narrower scope itself, it applies to **all of it** — the
desktop application, the documentation site, the landing page, every settings
screen, every panel, every dialog — and to each one individually, not to "the
project" as an aggregate that some corner sits outside of.

The failure this exists to stop is the plausible-sounding exemption. A rule gets
read as being about "the app", so the docs site skips it; or as being about "the
main screen", so a nested panel skips it. Both readings are wrong.

"It is small", "it is obviously scannable", "it is only docs" and "nobody
customises that one" are not exemptions. When a rule genuinely cannot apply to a
surface, say **which rule and why** in the project's documentation, rather than
leaving a silent gap that reads as an oversight to the next person and as a
decision to nobody.

## 2. Feature delivery is fail-closed

Every user-facing surface must implement every feature contract below. Words like
"optional" or "may" describe an end-user choice or a runtime behaviour; they never
make the implementation, documentation, localisation, accessibility, persistence,
tests or captures optional. An app may ship the narrator disabled by default, but
it must still ship the narrator, its language choice, its queue behaviour and its
tests.

No surface may satisfy a contract by delegating it to a sibling, hiding it,
replacing it with a placeholder, or claiming another surface already provides it.

Each project keeps a **hand-written completeness inventory** naming every
canonical feature, and a guard that fails when a named feature is missing. A
checklist that validates only the features it can already find is invalid,
because it cannot detect a feature that disappeared entirely.

Each project also keeps an **executable negative regression** for that inventory:
it removes one asserted item at a time and must turn red each time, and green
again when restored. Use exact boundaries, never a substring a renamed symbol can
accidentally satisfy.

In this repository: `INVENTORY.md`, `scripts/check-inventory.mjs`,
`scripts/test-inventory-guard.mjs`.

## 3. Honesty

- **Never present unreleased work as shipped.** Status is stated per surface, and
  "planned" is written where it is true.
- **No fake defaults or placeholder content.** Use explicit empty states and a
  real creation path. A placeholder-looking control must either work or be
  labelled as a static preview.
- **Decorative-looking UI must be functional.** Any icon, card, tab, badge or
  affordance presented as usable must perform its labelled action, expose an
  accessible equivalent, persist state where applicable, and be covered by an
  interaction test. Visual resemblance is never evidence of working behaviour.
- **Every disabled control names exactly which condition is unmet**, in its own
  tooltip or adjacent text. A disabled button with no explanation reads as broken
  rather than blocked.
- **A download link appears only when the release it points at is verified.** It
  stays absent rather than pointing at a candidate or guessed URL.

## 4. Language and voice

- Three language modes: **English**, playful Hong Kong-style **Cantonese**, and
  **bilingual**. Bilingual keeps the primary label prominent and the secondary
  compact; validate at narrow widths, where those labels are longest.
- A persisted **funny-level slider from 1 to 5 for each language**, independently
  adjustable. It applies to every category of message with no exemptions, errors
  and warnings included, and the behaviour is disclosed before opt-in.
- The funny level changes **voice, never facts**. At any level the message still
  names what happened, what is affected and what the options are. A warning
  nobody can act on is a broken warning, not a funny one.
- A persisted **emoji-in-dialogs toggle**. Emoji decorate dialog titles only —
  never buttons, action labels, field labels or accessible names.
- A visible **personal-vocabulary JSON upload** in every surface's own settings,
  present even before a file exists, with no-file / loaded / invalid / replace /
  clear states. Validate the whole payload before display or caching: size cap,
  schema version, nesting depth, entry count, key and value lengths, string-only
  replacements, malformed and duplicate-key rejection. A rejected file never
  applies partially. It is local-only and excluded from every export, log and
  history entry, and exports say that it was excluded.
- A **TTS narrator**, off by default but always implemented, with **one voice
  picker per narrated language**, rate and pitch, and "choose automatically" as
  the shipped default. Persist the platform's stable voice identity, never its
  display name. Platform voice enumeration commonly returns nothing on the first
  call — subscribe and re-read, or the picker reports "no voices" on a machine
  with forty. Say beneath the picker what will actually be heard, including when
  a chosen voice is not installed and the choice is being kept rather than reset.

## 5. School mode

A renameable mode, shared across the user's applications, that propagates live
rather than at next launch. While on, the playful capabilities behave as though
they are **not installed** — omitted from controls, copy, labels, routes, search
results and notifications, not merely disabled, because a greyed-out control
still names what it is hiding. Prior choices stay stored and return when it is
off. Leaving it requires the locally verified credential set when it was enabled.

It is a user-experience lock, **not a security boundary**. Clearing the local data
removes it, and the product says so rather than implying protection.

## 6. Search and the regex builder

- Every project ships a usable **regex builder**: guided construction for
  literals, classes, anchors, groups, alternation and quantifiers, a raw editor,
  flags, sample text, live validity, match count and capture groups, and copy or
  export. Name the actual engine and dialect.
- **Every search field carries one, anchored beside that field** — not in a
  distant menu, not on a separate page. Plain text stays the default; regex is an
  explicit opt-in; query, pattern, flags, validation and mode synchronise both
  ways.
- **Every settings surface, every dropdown and every right-click menu carries a
  search field wired to the same builder.** Not the long ones — every single one.
  "It only has four items" is not an exemption: a four-item menu becomes fourteen
  without anyone revisiting the decision, and a user who learns to type in one
  dropdown and finds the next one inert has learned that the pattern is
  unreliable.
- Each field owns its own state. Never one shared builder applying to whichever
  field was last touched.
- Evaluate locally. Bound pattern and sample sizes, handle zero-width matches
  safely, and protect against catastrophic backtracking.

## 7. Navigation

- Content is presented as **browser-style tabs**, not one long scrolling surface.
  The strip docks to any edge with left as the default, and the choice persists.
  Docking is an orientation change rather than a rotation: overflow measures the
  other axis, arrow keys follow the axis, and a label is never rotated ninety
  degrees.
- Tabs support overflow, reordering, pinning, grouping, collapse, and persistence
  of all of it across restarts.
- **Four tab-discovery searches**: the current strip, inside each group, groups by
  name, and a master search across everything — each with its own anchored builder.
- **Bulk close by matching text, and its inverse**, sharing one predicate so flags
  and casing cannot drift between them. Never runs on an empty query. Shows the
  count and a reviewable preview first, and excludes pinned tabs by default.
- **Settings surfaces are tabbed too.** A settings window with a search field and
  a scrolling column satisfies one rule and breaks this one.
- A **command palette on `Ctrl+Shift+F`** reaching every page, setting and action.
  Rows are live controls, not labels — a setting result renders its real control
  inline, using the same validation, persistence and history as its own surface.
  Selecting a result teleports to the exact element: opens the surface, reveals
  it, scrolls, focuses and briefly highlights it. Do not keep `Ctrl+K` as a
  competing default.

## 8. Safety and destructive actions

- **Non-blocking notifications** for anything that only informs. Modals are
  reserved for a decision that must be made before continuing. Errors and warnings
  persist until dismissed; dismissed notifications stay reviewable in a centre.
- **Destructive-action super confirmation**, implemented in the app's own UI:
  two independently operated keys, then a full-range confirmation slider, with an
  always-available emergency exit, an Escape path, and focus returned to the
  originating control. The gate names the exact action and the exact data
  affected, and stays unambiguous at every language and funny level.
- **Toy locks** on every rendered element, each with its own independent
  credential — password or standard one-time code. No master credential and no
  inheritance. Credentials live in the operating-system credential vault, never in
  settings files, exports, logs, screenshots or version control; a password is
  verified against a stored hash. The copy never claims it secures anything, and
  the recovery route is documented and self-service.
- **A support-desk recovery route** for a forgotten lock, whose resolution opens
  the data folder so the user can clear it themselves, with the exact path shown.
  One plain, unstyled line states that nothing is sent anywhere and nobody is
  reading it.
- **An unlock ladder** wherever a user can be locked out. It clears the *waiting*,
  never the credential; never refunds the attempt budget; is capped per rolling
  hour; never slows the escalation it skips; and is graded against a single-use
  nonce rather than in the browser.

## 9. Appearance

- Full **Material Design 3** conformance — tokens, typography, shape, elevation,
  motion and component anatomy — with no legacy elements. Functional data colours
  are exempt as data, not chrome.
- Persisted runtime controls for theme, density, accent or seed colour, and full
  font customisation, applied live where feasible.
- **An appearance editor for every rendered element**, reached from that element's
  own context menu and a keyboard equivalent, opening anchored beside it and
  returning focus on close. Word-depth typography; every state and pseudo-state.
- **An infinite colour picker** — a continuous field plus numeric entry, never
  swatch-only — with a translator across the common colour spaces, alpha
  preserved, gamut identified, clipping warned about, and contrast shown.
- **The user can rename the product.** Display comes from a setting; identity —
  data directory, package identifiers, update feed — comes from a constant and
  never moves. Where the real name matters, send the shipped name.
- **App-logo customisation** with presets and a local image, processed locally
  through an isolated decoder that verifies actual bytes and bounds size, pixels,
  frames and dimensions. Never uploaded, never converted remotely. Presentation
  only: it never rewrites installed identity.

## 10. Data

- **Export everything**, in every format that can faithfully carry it — JSON,
  JSONL, YAML, TOML, XML, CSV, TSV, Markdown, HTML and language-source forms where
  they make sense. Never offer a format that would silently drop a field; say what
  will be lost before the export runs. State encoding, line endings and schema
  version. Archives are ZIP or 7z, and the 7z path exposes what 7z actually offers.
- **Bulk actions on every list, table and grid** — including the notification
  centre and every history panel. Multi-select, shift-click ranges, a keyboard
  equivalent, a select-all that states its scope, and inverse selection. Show the
  exact count and a preview first; report anything skipped.
- **Local, append-only version history** in an isolated store beside the app's own
  data — never a repository inside the user's folders. Every settings change,
  record edit and deletion is recorded so it can be undone; restoring is itself a
  new entry so an undo can be undone. Filter by date and by the real actions the
  log contains, with counts, composed with a regex-wired search. Label entries with
  what changed, not that something did. Credentials never enter a snapshot.
- **A changelog viewer** covering every released version, with a date filter, a
  pattern search, export, and **a commit link on every entry**. Validate that each
  referenced commit exists and fail the build rather than emitting a dead link. A
  version with no recorded changes says so. Bring the changelog current in the
  same task that changes behaviour.

## 11. Sites and documentation

- Every project ships a **Material Design 3 landing page and documentation site**,
  carrying every contract above as a landing-page equivalent, with per-visitor
  state in local browser storage and **no CDN, remote font, remote image or
  analytics**. Where a rule assumes a credential vault or a data folder, the site
  says plainly what it uses instead and how to reset it.
- **Mobile friendly is a shipping requirement.** Responsive from roughly 320px,
  with a proper viewport tag; the page body never scrolls sideways and wide
  content scrolls inside its own container; text reflows rather than truncating;
  every target meets the platform minimum with enough separation. Anchored
  overlays stay inside the viewport and never cover the control that opened them.
  Hover-only affordances need a tap equivalent.
- **Every feature gets its own article** covering behaviour, configuration,
  failure modes, security considerations and verification, ending with suggested
  further reading so nobody is dropped at a dead end.
- **READMEs and landing pages carry real captures** of the real built artifact at
  a known commit — never mockups, never design files, never hand-edited images —
  each with alt text naming what it shows. A surface that genuinely cannot be
  captured yet says so plainly where the image would go.
- **A README is not one endless scroll**: a compact index at the top and long
  sections folded into collapsible blocks.
- **A real Open Graph embed graphic**, so a pasted link shows a picture rather
  than a grey card.
- **Every release states the project's line count**, produced by CI running the
  repository's committed counter over the tagged commit.

## 12. Build and release

- **A `build.bat` at the repository root** that takes a machine with nothing
  installed to a built, runnable program. It obtains its own toolchain without a
  prompt and without "install X and run this again"; refreshes `PATH` in-process
  after an install; builds the real artifact through the same path CI uses; then
  asks whether to run it, last. A silent mode installs and builds with no prompt
  and exits non-zero on the first real failure. Idempotent and safe to re-run.
  It never installs a secret, a credential or a signing certificate, and never
  weakens the machine's persistent execution policy.
- **Releases are permanently unsigned.** The operating system will warn about the
  installer; that warning is accurate, and the download surface says so up front
  rather than leaving it to be discovered.
- **Nobody ever pays anything.** No purchase, licence, subscription, lapsing
  trial, or feature behind an unlock. Where a project is built on somebody else's
  work, any funding link points at them and says so. No nagging prompts for
  payment, donations, reviews, ratings or upgrades.

## 13. Git

- Use the `git` CLI for local operations and the `gh` CLI for forge operations.
- **One author across every repository**, set per repository rather than globally,
  with a single co-author trailer. One identity in author, committer and trailer
  is what makes attribution and line counts mean one thing rather than several.
- **Commit messages are bilingual**, English and playful Hong Kong-style
  Cantonese, and both halves carry the same wit rather than one reading as a dry
  changelog beside a playful one. Roast the code, never a person.
- Humour styles the telling, never the facts. The subject line stays a precise,
  scannable summary; the body names the real behaviour, the real cause and the
  real fix. A commit whose message is funny but leaves the reader unsure what
  changed is a broken commit message.
- Every task that changes the repository ends with the intended work committed and
  pushed. Inspect status and diff first, preserve unrelated work, and verify the
  push landed. Never force-push without an explicit request.
- Nothing is deleted while it holds uncommitted, unmerged or unpushed work, and a
  branch tip is proved an ancestor of the pushed default branch before removal.

## 14. Accessibility and quality, as completion blockers

Keyboard reachability, visible focus, correct roles/names/states, contrast,
reduced-motion respect and screen-reader-sensible structure are fixed where
encountered rather than deferred as polish. So is visual clipping at every
supported size, display scale, density and language mode — checked against the
longest localised strings, which is bilingual mode. So are element-size defects:
controls sized to spec, adequate targets, layouts holding at 100/125/150/200%.
