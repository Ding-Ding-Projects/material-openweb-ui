# Offline ZIP file listing

## Status and scope

The current source build includes the `zip-list` converter adapter. It is
unreleased and is not included in the published v0.1.0 installer. Windows
installed-application verification is pending. This addresses only the ZIP
reader part of [issue #3](https://github.com/Ding-Ding-Projects/material-openweb-ui/issues/3);
the AVIF, PDF, audio and video adapter work is still open.

The reader is a local ES module at `app/js/core/zip.js`, imported by the actual
converter dispatcher. `electron-builder.yml` includes `app/**/*`, so the module
travels with the application. It needs no npm package, command-line tool,
network service or runtime download. There are no new installer dependencies.

## Behaviour and output

Choose a ZIP in File converter, then choose File listing (text). Detection uses
ZIP signatures rather than the source extension; a ZIP renamed to `.png` is
still a ZIP. The existing pre-conversion disclosure explains that archive
contents, timestamps, comments and extra fields will not be present in the
listing. Confirming creates a separate `source.listing.txt` download. The source
archive is never modified.

The UTF-8 text has LF line endings and no byte-order mark. It starts with a
metadata-only warning, the entry count and a column header. Each subsequent row
contains the entry kind, claimed compressed and uncompressed byte counts,
numeric compression method, claimed CRC32 and JSON-quoted filename. Entries
retain central-directory order, including duplicates. Directories and Unix
symlinks are labelled; symlinks are never followed. Compression methods are
reported by number, not decoded. Stored, deflated and data-descriptor ZIP32
archives can therefore be listed without decompressing their contents.

UTF-8 filenames are decoded strictly. Names without the UTF-8 flag use CP437,
or a version-1 Info-ZIP Unicode path extra field whose filename CRC32 is valid.
Malformed Unicode fields, conflicting names and duplicate Unicode path fields
are rejected. Names retain leading UTF-8 BOM characters when present.

## Limits and unsupported variants

The limits are fixed, apply before the relevant allocation or loop, and cannot
be raised through settings:

- Archive size: 256 MiB
- Central directory: 4 MiB
- Entry count: 10,000
- Filename: 4,096 bytes, including Unicode-path override names
- Generated listing: 4 MiB, measured after UTF-8 encoding and escaping
- End-record search: the final 65,557 bytes

Three bounded Blob range reads load the signature, end-record region and central
directory. The end-record search may include payload-adjacent bytes and reads
an entire archive when it is smaller than 65,557 bytes. Large archives are not
buffered in full. The total requested bytes, including overlapping reads, are
at most 4 + 65,557 + 4 MiB. No payload is interpreted or inflated, so a large
claimed uncompressed size does not allocate an equally large output. A
malformed archive, read failure or limit violation throws a readable error;
there is no partial download.

The adapter rejects ZIP64 sentinels, ZIP64 extra fields and locators; multipart
or split archives; conventional/strong/AES encryption; self-extracting or
prefixed ZIPs; and central-directory signature/trailer variants. Trailing bytes
outside the declared archive comment are also rejected. Encrypted central
directories whose metadata cannot be read fail as malformed or unsupported
records. There is no password prompt, extraction or fallback to a system tool.

## Security and verification limits

This is a metadata listing, not an integrity check. Payloads, local headers,
content CRC32 and digital signatures are not verified. Offset/size bounds are
checked, but the contents of each claimed local header are not read. A forged
or internally inconsistent archive may therefore produce forged metadata if
its central directory passes these structural checks. Treat the names, kinds,
sizes, methods and CRC32 values as untrusted claims.

All names are quoted. Tabs, line breaks, control characters and directional
formatting characters are escaped so an entry cannot create fake rows or
visually reverse a suffix. HTML-looking names, `..`, absolute paths, drive
letters and names such as `__proto__` remain literal text. The module does not
write files, interpret paths, execute members, follow symlinks or contact a
server. A listing cannot establish whether the archive is safe to extract.

## Automated checks

Run with the repository's supported Node 22 toolchain:

```sh
node scripts/test-zip-list.mjs
node scripts/test-convert.mjs
npm run gates
```

The ZIP suite runs through `convert.run` and is imported by the existing
converter gate, including the existing build and CI paths. Its deterministic
fixtures contain real local headers, central records and end records, alongside
an independently generated Python standard-library ZIP fixture. The suite covers:

- Stored, deflated, data-descriptor, empty, Unicode, directory and symlink ZIPs
- Byte-signature selection, output type/name and source preservation
- Duplicate, traversal-looking, HTML, control and bidi filenames
- Maximum comments, huge uncompressed claims and bounded read ranges
- Every truncation of a complete ZIP fixture and trailing-data rejection
- ZIP64, split, encrypted, malformed bounds/records/extra fields and bad UTF-8
- Entry/name limits and an independently enforced escaped-output limit
- A package-layout asset copy running with an empty PATH and network calls disabled

The package-layout smoke verifies the bundled module import and converter path.
It is not a Windows installation test or an Electron UI test.

## Installed-application verification still required

Build the current application, install the resulting unsigned Windows artifact
on a clean machine, disconnect its network and remove developer tools from PATH.
Use File converter to list stored, deflated, empty and renamed ZIP32 fixtures.
Save and inspect the `.listing.txt` result. Confirm the source archive is
unchanged and all names are one-row quoted data. Then try malformed, ZIP64,
encrypted and over-limit inputs and confirm the persistent error notification
explains why no result was written. Check Cancel and repeated conversions as
well as the successful confirmation flow.

Do not mark issue #3 complete from this ZIP-only change or the package-layout
smoke. Its other disabled adapters and the installed-app verification remain.

## Further reading

- [PKWARE ZIP format specification](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT),
  especially central-directory records, filename encoding and Unicode path fields
- [Converter source](../app/js/core/convert.js) and [reader source](../app/js/core/zip.js)
- [Adversarial integration suite](../scripts/test-zip-list.mjs)
