# Landing page design

Design sources for the project's landing page and documentation site. These are the **design**;
the shipped site is built from them in code and lives elsewhere in the repository.

| File | Artboard |
| --- | --- |
| `Main.dc.html` | Home, desktop width (1280px) |
| `Bilingual.dc.html` | Home in bilingual mode — how the Cantonese secondary sits against the English primary |
| `Mobile.dc.html` | Home at phone width (390px), where the tab strip collapses to a scrolling row |
| `canvas.json` | Artboard layout, notes, and which view the canvas opens on |

Every value here — colour tokens, corner radii, control heights, elevation — is lifted from the
application prototype in `../` rather than re-invented, so the site and the app cannot drift apart.
The type ramp is the one deliberate difference: the app sets body text at 13px for density, and a
page read at arm's length needs more than that.

## Three things the design deliberately does not do

- **The download button is off, not decorative.** No installer has been published, so the control
  states that rather than pointing at a guessed asset URL.
- **Screenshot slots say "capture pending".** They fill with real captures of the built application
  taken at a known commit. A mockup never stands in for one.
- **The unsigned-installer warning is up front**, not buried. Releases here are permanently
  unsigned, so the operating system's warning is accurate and the page says so first.

## Editing

Edit the `.dc.html` files here, then re-seed and republish the canvas. The seeded output file is
build output and is not tracked — regenerate it rather than editing it.
