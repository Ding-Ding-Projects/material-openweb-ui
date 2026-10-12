# Offline PDF dependencies

This tree is bundled by `app/**/*`; no runtime CDN, package install, system font,
or PATH tool is used. The `pdf-make` catalogue entry remains **disabled** pending
real packaged `file://` worker/font-loading verification. Source implementation
and Node worker-bridge tests are not installed-application proof.

## Exact sources

- `jspdf.js`: **jsPDF 4.0.0**, unmodified `package/dist/jspdf.umd.js` from
  `https://registry.npmjs.org/jspdf/-/jspdf-4.0.0.tgz`.
  The unminified distribution preserves its notices and avoids raw control bytes
  in the minified build. SHA-256 values for shipped files are in `manifest.json`.
- `MaterialOfflineTC-Regular.ttf`: a weight-400 static derivative of
  [NotoSansTC-VF.ttf](https://github.com/notofonts/noto-cjk/blob/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Sans/Variable/TTF/Subset/NotoSansTC-VF.ttf),
  version 2.004. The exact input SHA-256 is
  `ac091cc8cd19e848202afc8fe6d3809b4526c8fdbdb4be82da20c4f785949591`.
  Reproduce with Python and **FontTools 4.61.1**:
  `python scripts/build-pdf-font.py <official-input.ttf> app/vendor/pdf/MaterialOfflineTC-Regular.ttf`.
  The builder checks the version and input hash, pins timestamps and table order,
  and renames family/full/PostScript/unique IDs to **Material Offline TC**.
  Expected output SHA-256:
  `6286d380a7bba6673eab6dfaaf2acdd5d44413209a14c8fef9987640d8a15a7d`.

## Copyright and redistribution notices

Font copyright retained in binary metadata:
© 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'.
The derivative does not use that reserved name in its user-facing identity.
The font remains under SIL OFL 1.1 (`OFL.txt`), including its modified form.
The PDF documents themselves do not become OFL-licensed by embedding the font.

`LICENSE-jspdf.txt` and the intact library header contain the distributed MIT
permission and copyright notices. `jspdf-distributed-notices.txt` additionally
collects verbatim copyright/license blocks from that exact unminified bundle,
including bundled historical helper-code notices. The whole original bundle
is retained, so no comment or attribution was stripped.

The source map identifies embedded fflate, fast-png, iobuffer and pako code.
Their distributed license texts are retained from official npm packages:
fflate 0.8.2 (MIT), fast-png 6.2.0 (MIT), iobuffer 5.4.0 (MIT), pako 2.1.0
(MIT AND Zlib). Their metadata is license-source provenance, not a claim that
jsPDF published an exact locked build graph. Pako 2.1.0 is named in the bundled
source itself. The jsPDF declaration also names @babel/runtime; its 7.28.4 MIT
notice is retained conservatively. Optional HTML/image-rendering dependencies
are not separately installed or called by this text-only adapter.

No pdf-lib or fontkit assets are shipped by this implementation. Their evaluated
font-subsetting path was rejected after independent rendering lost glyphs.
