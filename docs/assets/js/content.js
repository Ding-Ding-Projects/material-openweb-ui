// The feature catalogue, the documentation articles, and the changelog.
//
// Status is stated per surface and is deliberately unflattering. A catalogue
// that reads as though everything already works is the one kind of
// documentation that is worse than none.
//
// This comment used to say the desktop application had not been built yet and
// that nearly every row read `planned`. Both stopped being true, and a stale
// note at the top of the file that records what IS true is its own small
// version of the problem the whole file exists to avoid.

export const STATUS = {
  shipped: { label: 'Shipped', tone: 'ok' },
  partial: { label: 'Partial', tone: 'warn' },
  planned: { label: 'Planned', tone: 'tonal' },
  na: { label: 'Not applicable', tone: 'tonal' }
};

/** group → the section it appears under on the features page */
export const FEATURES = [
  {
    id: 'md3', name: 'Material Design 3 throughout', group: 'Interface',
    icon: 'palette', site: 'shipped', app: 'shipped',
    blurb: 'Tokens, typography, shape, elevation and motion follow the Material 3 baseline scheme seeded at #6750A4, with no legacy elements left over from the original interface.',
    detail: 'The token sheet is the same file of values on both surfaces. Colour is never written literally in a rule — every one reads a custom property, so a change to the seed moves the whole product at once instead of leaving a trail of hardcoded hexes behind. Light and dark are both complete palettes rather than one being a washed-out pass over the other, and the reader\'s explicit choice always beats the system preference.',
    verify: 'Switch the theme on this page and confirm every surface, border and shadow changes together. Search the stylesheet for a literal hex value outside tokens.css; there should be none.'
  },
  {
    id: 'frameless', name: 'Frameless window and custom title bar', group: 'Interface',
    icon: 'desktop', site: 'na', app: 'shipped',
    blurb: 'The desktop application draws its own title bar and window controls rather than showing the operating system\'s default chrome.',
    detail: 'Minimise, maximise and close are real controls wired to the main process over IPC. A web page has no window to manage, so this row is not applicable to the site rather than quietly counted as satisfied.',
    verify: 'In the built application, each control performs its action, and the window can still be moved and resized by its edges.'
  },
  {
    id: 'tabs', name: 'Browser-style tabs', group: 'Navigation',
    icon: 'grid', site: 'partial', app: 'shipped',
    blurb: 'Content is separated into tabs you open, pin, reorder, group and close, rather than one long scrolling page.',
    detail: 'The strip docks to any edge with left as the default, because a screen is wider than it is tall and a vertical strip shows more labels legibly. Docking is an orientation change rather than a rotation: the overflow surface measures the other axis, arrow keys follow the axis, and a label is never turned ninety degrees, because a sideways word is a word nobody reads. On a phone the strip becomes a scrolling row so it stops eating the width it exists to reveal.',
    verify: 'Open several tabs, pin one, reload the page, and confirm order and pinned state survive. Narrow the window to phone width and confirm the strip scrolls rather than wrapping.'
  },
  {
    id: 'tabsearch', name: 'Four tab-discovery searches', group: 'Navigation',
    icon: 'search', site: 'na', app: 'shipped',
    blurb: 'A search for the current strip, one inside each group, one for groups by name, and a master search across every open tab.',
    detail: 'Each has its own anchored regex builder and its own query, pattern, flags and mode. None of them shares hidden state with another, so a pattern typed in one can never silently apply in another.',
    verify: 'Type a pattern into the strip search and confirm the group search is unaffected.'
  },
  {
    id: 'palette', name: 'Command palette on Ctrl+Shift+F', group: 'Navigation',
    icon: 'search', site: 'shipped', app: 'shipped',
    blurb: 'One shortcut reaches every page, every setting and every action, and lands on the exact control rather than the general area.',
    detail: 'Rows are live controls, not labels: a setting result renders its own switch or slider inline and changing it there uses the same validation, persistence and history as the settings page itself. Selecting a destination opens the surface, scrolls the target into view, focuses it and flashes it briefly without disturbing anything else. Ctrl+K is deliberately not a competing default.',
    verify: 'Press Ctrl+Shift+F, search for a setting by name, change it from the palette row, then open Settings and confirm it holds.'
  },
  {
    id: 'regex', name: 'A regex builder beside every search field', group: 'Search',
    icon: 'search', site: 'shipped', app: 'shipped',
    blurb: 'Every search field, every dropdown filter and every right-click menu filter carries its own anchored pattern builder.',
    detail: 'Plain text stays the default and regex is an explicit opt-in. The builder offers guided tokens for classes, anchors, groups, alternation and quantifiers, a raw editor, flags, sample text, live validity, a match count and the first match\'s capture groups. It is anchored to the field you were already typing in rather than opening as a detached dialog somewhere else. Patterns are evaluated in this browser and never transmitted.',
    verify: 'Open any menu on this site, press the .* button in its filter, build a pattern, apply it, and confirm only that menu filters.'
  },
  {
    id: 'chat', name: 'Chat with a local model', group: 'Models',
    icon: 'chat', site: 'na', app: 'shipped',
    blurb: 'Streamed replies from a model running on this machine, with a model picker, cancellation and honest empty states.',
    detail: 'The design prototype faked this with a timer and three canned paragraphs. Nothing here is canned: the reply is streamed from the local daemon token by token, it can be stopped mid-flight, and when no model is installed the surface says so and points at the catalogue rather than answering with something it invented. Token throughput is reported from the timings the daemon itself returns.',
    verify: 'Stop the Ollama daemon and confirm the page diagnoses that rather than replying. Press Stop mid-reply and confirm the partial text is kept and marked as stopped.'
  },
  {
    id: 'ollama', name: 'Local Ollama suite manager', group: 'Models',
    icon: 'server', site: 'na', app: 'shipped',
    blurb: 'Daemon health, installed models, the full published catalog with every tag, pulls with real progress, deletes behind the confirmation gate, and a chat surface.',
    detail: 'Everything about your own machine — health, installed models, pulls, deletes and generation — goes through Ollama\'s documented local HTTP API and nothing else. Browsing the PUBLISHED catalogue is the one exception, and the page states it before the request is made: the local daemon has no endpoint that lists the registry, so this fetches ollama.com\'s library page and reads it. That is a behaviour of this application rather than an API of Ollama\'s, and saying "only the local API" while reaching a website would have been the more comfortable sentence and the false one. The catalogue is never a curated shortlist, and each refresh records its source revision, refresh time, the number of pages actually fetched, and a verdict of complete, incomplete or unverified — the third meaning the source carried no pagination this parser recognises, which is a different and more honest answer than assuming there is nothing more.  Offline it shows the last catalogue read plus current installed state and says which is which, instead of guessing at new entries.',
    verify: 'With the daemon stopped, the surface diagnoses that exact state and offers a retry, rather than spinning. Confirm the catalogue states where it fetches from before the request, and that its completeness verdict names what it is based on.'
  },
  {
    id: 'fit', name: 'Evidence-backed hardware fit verdicts', group: 'Models',
    icon: 'pulse', site: 'na', app: 'shipped',
    blurb: 'Every model variant is rated Runs well, Runs with limits, Unlikely, or Unknown, from measured hardware rather than from its name.',
    detail: 'The verdict combines real system RAM, GPU and usable VRAM, driver support and free destination disk with the model\'s actual blob size, parameter count, quantisation and declared context window. Missing metadata produces Unknown or a more conservative verdict; it is never treated as zero. The evidence behind each verdict is shown and timestamped, and it recomputes when the hardware, the storage or the settings change.',
    verify: 'Change the destination drive to one with less free space and confirm affected verdicts recompute and say why.'
  },
  {
    id: 'converter', name: 'Universal file converter', group: 'Tools',
    icon: 'swap', site: 'na', app: 'shipped',
    blurb: 'Type detected from the actual bytes, eight adapter categories, and every unavailable format listed with the exact dependency it is missing.',
    detail: 'Documents/PDF, Images, Audio, Video, Archives, Structured Data, Code/Text and Binary Encodings each have their own searchable catalogue. A format is only enabled when its adapter is bundled inside the installed application and works offline — a tool that happens to be on the developer\'s PATH never makes a format appear available. Lossy conversions disclose what will change before they run.',
    verify: 'Rename a PNG to .txt and confirm it is still detected as an image; check that a disabled row names its missing dependency rather than simply being greyed out.'
  },
  {
    id: 'authenticator', name: 'Built-in authenticator', group: 'Tools',
    icon: 'phonelock', site: 'na', app: 'shipped',
    blurb: 'Standards-correct one-time codes for whatever accounts you like, computed locally and checked against the published test vectors.',
    detail: 'RFC 6238 over RFC 4226, SHA-1/256/512, six to eight digits and an arbitrary period, defaulting to SHA-1/6/30 because that is what the rest of the world issues. The current code is shown large and grouped with a copy action, a countdown that is never colour-only, and a peek at the next code so nobody starts typing one with two seconds left. A skewed system clock is reported in plain words rather than producing confidently wrong digits.',
    verify: 'Run the RFC 6238 published test vectors; every one must match. Set the system clock forward and confirm the surface says so.'
  },
  {
    id: 'qr', name: 'QR pairing for one-time-code registration', group: 'Tools',
    icon: 'phonelock', site: 'na', app: 'shipped',
    blurb: 'A scannable code encoding a standard otpauth:// URI, drawn in-process from local code.',
    detail: 'Never a third-party QR service and never a remote chart API — that would hand the secret to a stranger\'s server on the way to rendering it. The manual secret is always shown beside the code in grouped base32, because a QR is useless to someone who cannot see it and useless again to someone pairing on the very device displaying it. Pairing is confirmed by typing one live code back before the factor arms.',
    verify: 'Confirm no network request occurs anywhere in registration, and that a wrong confirmation code is rejected.'
  },
  {
    id: 'locks', name: 'Toy locks on every element', group: 'Locks',
    icon: 'lock', site: 'na', app: 'shipped',
    blurb: 'Any tab, control or appearance value takes its own password or one-time-code lock, each with its own independent credential.',
    detail: 'There is no master credential and no inheritance: unlocking one surface never unlocks another, and a locked property inside a locked tab is two locks with two answers. The copy never claims this secures anything — it is a speed bump you set for yourself, and the recovery route is documented rather than hidden behind a support process.',
    verify: 'Lock two elements with different credentials and confirm unlocking one leaves the other locked.'
  },
  {
    id: 'tickets', playful: true, name: 'Support Tickets', group: 'Locks',
    icon: 'file', site: 'na', app: 'shipped',
    blurb: 'The recovery route for a forgotten lock, dressed as a service desk, whose resolution is the only thing that actually works.',
    detail: 'A ticket form, a locally generated number, a severity nobody will honour and a canned first response — and then the resolution opens the folder you need to clear, with the exact path shown beside the button. One plain unstyled line states that nothing is sent anywhere, no ticket exists outside this machine and nobody is reading it, so nobody waits for a reply that was never coming.',
    verify: 'Confirm the disclosure line is present and unstyled at every funny level, and that no network request is made.'
  },
  {
    id: 'ladder', playful: true, name: 'The unlock ladder', group: 'Locks',
    icon: 'unlock', site: 'na', app: 'shipped',
    blurb: 'Locked out? Play your way through dim sum, then sums, then whack-a-mole — or serve the clock.',
    detail: 'It clears the waiting and never the credential: winning returns you to the ordinary sign-in form still needing to know your password. It never refunds the attempt budget, it is capped at three skips per rolling hour, and it never slows the exponential escalation it skips. Under School mode the ladder starts at the sums, because the dim-sum rung must be absent rather than skipped with a message naming it.',
    verify: 'Confirm a cleared ladder sets no session and leaves the surface exactly as closed as it was.'
  },
  {
    id: 'language', playful: true, name: 'Three language modes', group: 'Language',
    icon: 'language', site: 'shipped', app: 'shipped',
    blurb: 'English, playful Hong Kong Cantonese, and a bilingual mode that keeps both readable.',
    detail: 'Bilingual holds English as the prominent primary and places Cantonese underneath as a compact secondary, rule-marked on long paragraphs so the two never read as one run-on. Localisation resources are kept separate from logic, and every mode is exercised at the longest strings and narrowest widths.',
    verify: 'Switch to Bilingual and check the longest labels at 320px width for clipping.'
  },
  {
    id: 'funny', playful: true, name: 'A funny level for each language', group: 'Language',
    icon: 'language', site: 'shipped', app: 'shipped',
    blurb: 'Two independent sliders from 1, fully serious, to 5, maximum playfulness — one for English and one for Cantonese.',
    detail: 'It applies to every category of message with no exemptions, errors and warnings included, and you are told that before you opt in. What changes is voice, never facts: at any level the message still names what happened, what is affected and what your options are. A warning nobody can act on is a broken warning, not a funny one.',
    verify: 'Set English to 1 and to 5 and confirm the same facts survive both readings.'
  },
  {
    id: 'vocab', playful: true, name: 'Personal vocabulary upload', group: 'Language',
    icon: 'file', site: 'shipped', app: 'shipped',
    blurb: 'A local JSON file of word replacements, applied to this product\'s own copy.',
    detail: 'The control is always visible, even before a file exists. The whole payload is validated before anything is displayed or cached — size, schema version, nesting depth, entry count, key and value lengths, string-only replacements, duplicate keys — and a rejected file never applies partially. Nothing about it reaches the network, an export, a log or a history entry.',
    verify: 'Upload a malformed file and confirm nothing changes and the reason is named. Confirm an export states that vocabulary contents were omitted.'
  },
  {
    id: 'narrator', playful: true, name: 'Spoken narrator', group: 'Language',
    icon: 'bell', site: 'na', app: 'shipped',
    blurb: 'Off by default, with a separate voice picker for each narrated language, plus rate and pitch.',
    detail: 'One picker per language, because choosing an English voice says nothing about which Cantonese voice should read the other half of a bilingual line. Each lists the voices this machine actually has, resolved at runtime, with Choose automatically as the shipped default — nothing ships naming a voice most installs do not have. It says beneath the picker what will actually be heard, including when a chosen voice is not installed here and the choice is being kept rather than reset.',
    verify: 'Confirm the picker fills in after the platform\'s late enumeration rather than reporting no voices on a machine with forty.'
  },
  {
    id: 'school', name: 'School mode', group: 'Settings',
    icon: 'shield', site: 'shipped', app: 'shipped',
    blurb: 'A renameable mode that omits the playful surfaces entirely and needs a PIN to leave.',
    detail: 'While on, the playful capabilities behave as though they are not installed — omitted from controls, copy, labels, search results and notifications rather than merely disabled, because a greyed-out control still names the thing it is hiding. Prior choices stay stored and return when it is turned off. It is a user-experience lock, not a security boundary, and the product says so rather than implying protection.',
    verify: 'Turn it on and confirm the hidden features produce no search results at all, not disabled ones.'
  },
  {
    id: 'schedule', name: 'Scheduled settings', group: 'Settings',
    icon: 'clock', site: 'na', app: 'shipped',
    blurb: 'Schedule the theme, language, narrator and appearance by time of day and day of week.',
    detail: 'A rule takes an optional start and end date, a start and end time, and either every day or an explicit set of weekdays. Values are interpreted in your configured local timezone, and the surface states the timezone and what happens across a daylight-saving boundary. Rules are stored in a versioned, bounded schema with stable identifiers and a documented precedence, and every edit is recorded in local history.',
    verify: 'Create a rule that crosses midnight and confirm the documented semantics hold.'
  },
  {
    id: 'appearance', name: 'Per-element appearance editor', group: 'Appearance',
    icon: 'palette', site: 'na', app: 'shipped',
    blurb: 'Every rendered element exposes Edit appearance… from its own context menu.',
    detail: 'Word-depth typography — every installed and bundled face with a live preview, variable axes, weight, style, underline variants, spacing, line height, baseline offset — plus shape, radius, elevation and every state and pseudo-state. The editor opens anchored beside the element being edited, tracks that anchor, and returns focus to it on close. It themes its own dialog too: a theming feature that cannot theme itself is incomplete.',
    verify: 'Edit one element\'s appearance, reset that single property, and confirm neighbouring elements are untouched.'
  },
  {
    id: 'colour', name: 'Infinite colour picker with translator', group: 'Appearance',
    icon: 'palette', site: 'na', app: 'shipped',
    blurb: 'A continuous spectrum and numeric entry, never a swatch-only chooser.',
    detail: 'Converts bidirectionally among named colours, HEX/HEX8, RGB/RGBA, HSL/HSLA, HSV, HWB, CIELAB/LCH, OKLab/OKLCH and CMYK, preserves alpha, identifies the active colour space and gamut, warns before clipping, and shows accessible contrast against the relevant background. Swatches and recent colours are conveniences layered on top rather than replacements for it.',
    verify: 'Enter an OKLCH value outside sRGB and confirm the clipping warning appears before it is applied.'
  },
  {
    id: 'logo', name: 'App logo customisation', group: 'Appearance',
    icon: 'image', site: 'na', app: 'shipped',
    blurb: 'Several shipped presets plus a local image, with crop, fit, focal point and background.',
    detail: 'Custom images are decoded locally through an isolated decoder that verifies the actual bytes rather than trusting an extension, and bounds input size, pixel count, frames and dimensions. Nothing is uploaded and no remote converter is involved. The mark changes presentation only: it never rewrites the package identity, the executable name, the data directory or the update feed.',
    verify: 'Upload a file renamed to .png that is not a PNG and confirm it is rejected without partially applying.'
  },
  {
    id: 'rename', name: 'Rename the product', group: 'Appearance',
    icon: 'gear', site: 'shipped', app: 'shipped',
    blurb: 'Change the name it shows you, without moving anything the name is not.',
    detail: 'Display comes from a setting; identity comes from a constant. A rename that moved the data directory would orphan every stored profile and history entry, which is exactly why the two are decoupled. Where the real product name matters — a diagnostic report, an issue you file — the shipped name is sent rather than your chosen one, and the setting says so.',
    verify: 'Rename it, reload, and confirm your stored settings are still there under the original storage keys.'
  },
  {
    id: 'confirm', name: 'Destructive-action super confirmation', group: 'Safety',
    icon: 'shield', site: 'shipped', app: 'shipped',
    blurb: 'Two independently operated keys, then a full-range slider, with an emergency exit always available.',
    detail: 'The gate names the exact action and the exact data affected. Both keys must be set before the slider arms, and nothing happens until the slider completes. Escape cancels, focus returns to the control that opened it, and the safety facts stay unambiguous at every language and funny level.',
    verify: 'Try the slider with one key set and confirm it is inert.'
  },
  {
    id: 'notify', name: 'Non-blocking notifications with a reviewable centre', group: 'Safety',
    icon: 'bell', site: 'shipped', app: 'shipped',
    blurb: 'Anything that only informs is a toast; a modal is reserved for a decision you must make.',
    detail: 'Toasts stack in a corner without overlapping, auto-dismiss on a sensible timeout, and persist when they are errors or warnings. Dismissed notifications stay reviewable in a centre, which is a list like any other and therefore carries multi-select, an honestly-scoped select-all, bulk dismiss and a bulk export that honours the active filter.',
    verify: 'Dismiss a toast and find it again in the notification centre.'
  },
  {
    id: 'bulk', name: 'Bulk actions on every list', group: 'Data',
    icon: 'grid', site: 'shipped', app: 'shipped',
    blurb: 'Multi-select, shift-click ranges, a select-all that states its scope, and inverse selection.',
    detail: 'Not exempt for the notification centre or a history panel — those are lists too. Actions are offered in bulk rather than a token subset, the exact count and a reviewable preview are shown first, and anything skipped is reported rather than silently dropped.',
    verify: 'Select every match of a filter, run a bulk action, and confirm the report distinguishes changed from skipped.'
  },
  {
    id: 'export', name: 'Export everything, in every format that fits', group: 'Data',
    icon: 'download', site: 'shipped', app: 'shipped',
    blurb: 'If a surface can show it, you can take it away.',
    detail: 'JSON, JSONL, YAML, TOML, XML, CSV, TSV, Markdown and HTML, chosen per datum rather than per product — tabular data gets CSV, structured records get JSON, prose gets Markdown. A format that would silently drop a field is never offered; where something cannot be carried, it is named before the export runs. Exports state their encoding, line endings and schema version.',
    verify: 'Export the same data twice in two formats and confirm neither loses a field without saying so.'
  },
  {
    id: 'history', name: 'Local version history', group: 'Data',
    icon: 'history', site: 'shipped', app: 'shipped',
    blurb: 'Every settings change, record edit and deletion is recorded so it can be undone.',
    detail: 'Append-only: restoring is itself recorded as a new entry, so an undo can be undone and that undo undone in turn. The panel filters by date and by the real actions the log actually contains, with counts beside each, composed with a regex-wired text search. Entries are labelled with what changed rather than that something did. Credentials never enter a snapshot.',
    verify: 'Change a setting, restore it, then restore the restore, and confirm all three appear as separate entries.'
  },
  {
    id: 'changelog', name: 'Changelog viewer', group: 'Data',
    icon: 'clock', site: 'shipped', app: 'shipped',
    blurb: 'Every released version in-product, filterable by date, searchable by pattern, each entry linking to its commit.',
    detail: 'An entry that says what changed but not where is unverifiable, so every one carries the full commit SHA rendered as a short clickable reference. A wrong SHA is worse than none, so the build fails rather than emitting a dead link. A version with no recorded changes says so rather than being padded.',
    verify: 'Follow a commit link and confirm it resolves in the repository the build came from.'
  },
  {
    id: 'status', name: 'Status Hub', group: 'Data',
    icon: 'pulse', site: 'shipped', app: 'shipped',
    blurb: 'A live session card and a real event log that every feature writes to.',
    detail: 'The log records what happened rather than what was expected to happen, which is the entire reason it is worth reading. It is a list, so it carries the same search, bulk actions and export as every other list.',
    verify: 'Perform an action and confirm the entry that appears describes what actually occurred.'
  },
  {
    id: 'dimsum', playful: true, name: 'Dim sum surprise', group: 'Delight',
    icon: 'image', site: 'shipped', app: 'shipped',
    blurb: 'A one-in-ten chance at startup of being shown a dish, named in both languages.',
    detail: 'Non-blocking and auto-dismissing: it never gates startup, never steals focus and never appears mid-task. There is no setting to switch it off. Photographs come from the public dim-sum catalogue rather than being copied into this repository, and where the catalogue has no published image the surface says so instead of filling the gap locally. School mode suppresses it entirely.',
    verify: 'Confirm it never fires twice in one load, and that School mode removes it rather than hiding it.'
  },
  {
    id: 'a11y', name: 'Accessibility and responsive layout', group: 'Quality',
    icon: 'check', site: 'shipped', app: 'shipped',
    blurb: 'Keyboard reachable end to end, screen-reader named, contrast-safe, and readable from 320px upward.',
    detail: 'Visible focus everywhere, correct roles and states, reduced motion respected, adequate touch targets with enough separation, and no clipping at 100/125/150/200% display scale or in bilingual mode where labels are longest. Wide content scrolls inside its own container so the page body never scrolls sideways.',
    verify: 'Tab through this page without touching the mouse and confirm every control is reachable and visibly focused.'
  },
  {
    id: 'buildscript', name: 'One-click build script', group: 'Quality',
    icon: 'file', site: 'shipped', app: 'shipped',
    blurb: 'A build.bat at the repository root that takes a bare machine to a running program.',
    detail: 'It assumes nothing is installed and obtains every dependency itself, without a prompt and without a sentence beginning "install X and run this again". It builds the real artifact through the same path CI uses, reports honestly at each phase, is safe to re-run, and has a silent mode that never blocks and exits non-zero on the first real failure.',
    verify: 'Run it on a machine with no toolchain and confirm it completes without manual intervention.'
  },
  {
    id: 'nosign', name: 'Permanently unsigned releases', group: 'Quality',
    icon: 'warn', site: 'shipped', app: 'na',
    blurb: 'Installers are never code-signed, and the product says so before you download one.',
    detail: 'The operating system will warn you about an unsigned installer. That warning is accurate and is not something to work around or dress up — it is stated plainly on the download surface rather than discovered afterwards.',
    verify: 'Confirm the warning text appears on the download surface before any release link.'
  },
  {
    id: 'free', name: 'Nothing is ever for sale', group: 'Quality',
    icon: 'check', site: 'shipped', app: 'shipped',
    blurb: 'No purchase, no licence, no subscription, no trial, no feature held behind an unlock.',
    detail: 'Every capability is available to everyone who runs it. This is not a pricing decision to revisit later. There are also no nagging prompts asking for donations, reviews, ratings or upgrades — where the product is built on somebody else\'s work, any funding link points at them and says so.',
    verify: 'Search the interface for any purchase, upgrade or donation prompt; there should be none.'
  }
];

export const FEATURE_GROUPS = ['Interface', 'Navigation', 'Search', 'Models', 'Tools', 'Locks', 'Language', 'Settings', 'Appearance', 'Safety', 'Data', 'Delight', 'Quality'];

export const CHANGELOG = [
  {
    version: '0.1.0',
    date: '2026-08-19',
    codename: 'First light',
    sections: [
      {
        title: 'Added',
        items: [
          { text: 'The Material Design 3 desktop application: frameless window, real window controls over IPC, and the token sheet shared with the documentation site so the two cannot drift apart.', sha: '324be60de' },
          { text: 'The Electron shell, with a narrow four-origin network allowlist and a backend probe that reports honestly when Python is absent.', sha: '58d546e2d' },
          { text: 'A command palette on Ctrl+Shift+F whose rows are live controls rather than labels, an export of everything, and the dim sum surprise.', sha: 'e6b77913d' },
          { text: 'Language modes, funny levels, the vocabulary contract, the spoken narrator with a voice picker per narrated language, and School mode — which omits rather than disables.', sha: 'd4fbc0337' },
          { text: 'Toy locks with a credential each, the support desk, and the unlock ladder that clears the waiting and never the credential.', sha: '5858e967c' },
          { text: 'QR pairing for the authenticator, encoded in this process from local code so no third-party service ever sees the secret.', sha: '0a681078c' },
          { text: 'A colour translator across every space the contract names, and a per-element appearance editor reachable from any context menu.', sha: '8af736fd7' },
          { text: 'The application mark: presets, a local image decided by its actual bytes, crop with a focal point, a maskable safe-area preview, and generated variants verified by signature.', sha: '3e6b1fd0c' },
          { text: 'Scheduled settings, with midnight crossings and both daylight-saving boundaries decided and documented rather than discovered.', sha: 'c57638c11' },
          { text: 'The tab system: docking to any edge, pinning, grouping, and the four discovery searches — all sharing one match predicate with the bulk closes.', sha: 'b459f5df5' },
          { text: 'Nine export formats, an append-only local history with a hash chain, and one bulk-action bar that states how much of a selection it cannot show you.', sha: 'a2bf591d2' }
        ]
      },
      {
        title: 'Fixed',
        items: [
          { text: 'An apostrophe in a string made content.js invalid JavaScript and the live site served a blank page. A parse gate now runs first, locally and in CI.', sha: 'bcbf470b8' },
          { text: 'The QR format-information second copy was transposed, row for column. It passed every structural eye-test and every real scanner would have rejected it.', sha: '0a681078c' },
          { text: 'An icon-name guard was reporting green while matching nothing: a shell layer had collapsed an escape into a literal backspace character, so the pattern required an unprintable byte. No file this project writes may now contain a control character.', sha: '3e6b1fd0c' },
          { text: 'A bulk action opting out of the routine confirmation was also skipping the out-of-view warning, so it could reach items the dialog never mentioned.', sha: 'a2bf591d2' }
        ]
      },
      {
        title: 'Notes',
        items: [
          { text: 'No installer has been published yet. Releases will be permanently unsigned, and the reason is stated rather than hidden.', sha: null },
          { text: 'Every entry above names the commit it shipped in. An entry whose commit does not resolve is a build failure, not a documentation slip.', sha: null }
        ]
      }
    ]
  },
  {
    version: '0.0.0',
    date: '2026-08-19',
    codename: null,
    sections: [
      {
        title: 'Added',
        items: [
          { text: 'Forked Open WebUI and vendored the Material Design 3 design prototype under design/ as implementer reference.', sha: '9079c5fcd8b77065786435574a2c88391ed1cc6c' },
          { text: 'Designed the landing page against the application\'s own token sheet — desktop, bilingual and phone views.', sha: '2b90041c6' },
          { text: 'Fixed the hero button row and sized the design artboard frames from measured renders rather than estimates.', sha: '4e4f92ae7' }
        ]
      },
      {
        title: 'Notes',
        items: [
          { text: 'No installer has been published. The desktop application is not built yet; this site documents what is designed and what is planned, and marks which is which.', sha: null }
        ]
      }
    ]
  }
];

/**
 * Whether School mode makes a feature absent.
 *
 * Marked on the feature itself rather than kept as a list somewhere else,
 * because a separate list is maintained in one place and forgotten in the three
 * that read it — which is exactly what happened: the settings page omitted the
 * playful rows while the features page, the documentation list and the command
 * palette all went on offering them by name.
 */
export function isPlayful(id) {
  const f = FEATURES.find((x) => x.id === id);
  return Boolean(f && f.playful);
}

export const DOCS = FEATURES.map((f) => ({
  id: f.id,
  playful: Boolean(f.playful),
  title: f.name,
  group: f.group,
  blurb: f.blurb,
  detail: f.detail,
  verify: f.verify,
  site: f.site,
  app: f.app
}));

/** Related reading for an article, so a reader is never dropped at a dead end. */
export function suggestedFor(id) {
  const article = DOCS.find((d) => d.id === id);
  if (!article) return [];
  const sameGroup = DOCS.filter((d) => d.group === article.group && d.id !== id);
  const others = DOCS.filter((d) => d.group !== article.group && d.id !== id);
  return [...sameGroup, ...others].slice(0, 4);
}
