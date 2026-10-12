# Offline PDF creation (verification checkpoint)

## Status

`pdf-make` remains **disabled**. The source implementation and tests exist, but
real Electron `file://` worker and local-font loading have not been verified.
It is not in the published v0.1.0 installer. Windows installed-application testing
is still required. This checkpoint does not close
[issue #3](https://github.com/Ding-Ding-Projects/material-openweb-ui/issues/3).

## Intended behaviour

The adapter turns UTF-8 plain text, HTML source, JSON source or CSV source into
an A4 PDF with a bundled Traditional Chinese/Latin font. HTML is printed literally;
scripts, styles, links, images and URLs are never executed, rendered or fetched.
JSON and CSV remain source text, not formatted tables. Every result is a separate
PDF; the original is unchanged. The file selected when the confirmation opens
stays the source even if another file is selected before completion.

A pre-conversion disclosure explains formatting losses and font overhead.
Line endings become LF, tabs become four spaces, a leading UTF-8 BOM is removed,
and long lines wrap at character boundaries. Blank input produces a blank page.
Only Basic Multilingual Plane characters supported by the bundled font are
accepted. Every supplementary-plane character (above U+FFFF) is rejected by
the adapter even if the bundled font contains it; this is an encoder limitation,
not evidence that the font lacks that glyph. Missing glyphs, including unsupported emoji or uncommon ideographs,
fail with the exact Unicode code point rather than producing blank glyphs.
All combining marks and variation selectors are also explicitly rejected,
including decomposed Latin accents. Independent rendering showed an incorrectly
positioned accent even when extraction preserved its code points. Precomposed
Latin characters such as é are supported when present in the font; the adapter
never silently normalizes source text. This is not a universal-Unicode or
complex-script typesetting engine.

## Limits, failure and isolation

- Input: 256 KiB, checked before worker creation or reading
- Source: 50,000 Unicode code points; malformed UTF-8 is rejected
- Layout: 100 A4 pages, 49 lines per page, fixed 11-point text
- Output: 16 MiB; no partial result is returned
- Worker lifetime: 30 seconds, including font loading and conversion
- Concurrency: one PDF worker per application renderer; a second request fails
- Controls and bidirectional formatting characters are rejected, except tabs and
  conventional line endings, which are normalized as disclosed

Parsing, font work and PDF serialization occur in a dedicated module worker.
Completion, error and timeout terminate the worker and release the slot. This
keeps expensive work off the UI thread and bounds its lifetime. Input/page/output
caps are not a strict process-memory limit; Chromium does not expose such a
worker limit here. Font parsing uses only the pinned bundled font, never a font
provided by the source. No PDF input parser, file attachment, JavaScript action,
HTML renderer or remote resource loader is used by this adapter.

The dispatcher does not buffer a PDF source on the main thread. The worker makes
one bounded source read and one local packaged-font read. It embeds a font subset
using the independently tested jsPDF path; even a short PDF has font overhead.
The mixed Traditional Chinese/Latin verification sample is 93,663 bytes (about
92 KiB), not a general lower bound or promised size. Other text uses other glyphs.

## Dependencies and footprint

jsPDF 4.0.0 is a locally vendored, unmodified browser distribution. The font is a
reproducible weight-400 derivative of official Noto Sans TC, renamed Material
Offline TC. Both travel under the existing `app/**/*` package rule; no `PATH`
tool, runtime download or npm dependency installation is needed by the app.
See [exact sources, hashes and license notices](../app/vendor/pdf/README.md).

The unminified jsPDF file is 1,200,371 bytes; the static font is 7,149,608 bytes.
Their combined raw size is 8,349,979 bytes; individual gzip measurements total
4,541,081 bytes. Notices, adapter code and tests are additional. Compressed asset measurements
are not an actual NSIS installer delta. Full fonts and runtime fontkit subsetting
were evaluated and rejected in favour of this verified renderer: extraction-only
tests missed visible-glyph loss, so raster tests are mandatory.

## Verification

`node scripts/test-pdf.mjs` exercises strict decoding, resource boundaries,
unsupported glyphs, the real worker module through a Node bridge, concurrency,
timeout/termination, malformed worker results and copied package-layout assets.
It is included in `node scripts/test-convert.mjs` and `npm run gates`.

`node scripts/test-converter-source.mjs` executes the real converter page event
flow with only DOM/UI/state boundaries substituted. It opens confirmation for
file A, selects file B, confirms A, clears selection during the suspended
conversion and verifies the completed result and history still name A. A second
confirmation can be dismissed without another conversion. Removing the snapshot
makes this executable negative regression fail. This is an event-flow regression,
not a substitute for real-browser visual and accessibility verification.

`python scripts/test-pdf-render.py` additionally requires Poppler and Pillow. It
creates a real PDF, checks exact text extraction with no parser warnings, and
asserts that every one of 17 CJK/Latin glyph cells contains distinct visible ink.
This catches the regression where extraction succeeds but glyphs disappear.
Manual inspection of the mixed-language page supplements these checks.

The Node bridge replaces browser file fetching with a strict local-file read;
it proves neither browser CSP nor file-origin worker access. For the real loader:

`electron scripts/test-pdf-electron.cjs`

The smoke loads the actual `app/index.html` via Electron `loadFile`, uses the
app's existing BrowserWindow isolation settings, blocks all nonlocal requests,
and invokes the candidate implementation without enabling its catalogue entry.
`PDF_PACKAGE_ROOT` can point to an extracted package root, and
`PDF_ELECTRON_OUTPUT` saves its real PDF for independent extraction/raster checks.
This smoke is prepared but has **not run successfully in this environment**.
It is still not equivalent to installing Windows NSIS on a clean machine.

Before enabling: run the real file-origin smoke without weakening webSecurity,
CSP or sandboxing; inspect resulting PDFs; verify every runtime asset and notice
in the actual installer; then run from the installed Windows application with
network access blocked and no developer tools on PATH. Include repeated runs,
timeouts, source changes, malformed UTF-8, unsupported glyphs and boundary sizes.

## Further reading

- [jsPDF official repository](https://github.com/parallax/jsPDF)
- [Noto CJK official source](https://github.com/notofonts/noto-cjk)
- [Font reproduction script](../scripts/build-pdf-font.py)
- [Independent raster regression](../scripts/test-pdf-render.py)
- [Converter issue and remaining adapters](https://github.com/Ding-Ding-Projects/material-openweb-ui/issues/3)
