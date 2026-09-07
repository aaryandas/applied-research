# Reference verification — 2026-09-05

This record separates browser evidence from source inspection and production requirements.

## Executed checks

- `node --check design-system/app.js` passed after implementation and finish changes.
- Local HTTP server served the reference at `http://127.0.0.1:8765`.
- Browser reported fonts loaded; all runtime illustration/font URLs are local.
- Typed and saved a note in the Reader. Both count instances changed from 0 to 1; Workbench displayed the same body; Playbook preserved it under Notes.
- Entered claim, source attachment, and falsifier; completion became available and the completed thesis appeared in the Playbook. Source inspection confirms any later edit returns completion to draft.
- Reloaded the page during responsive testing: saved reaction count and completed thesis state remained available. A fresh-browser instance has no seeded reactions.
- Opened source preview. The close control received focus; Escape closed the dialog; the citation trigger regained focus.
- Switched daylight/evening with the header control. Preferences exposes the same theme state.
- Exercised unsupported and failed answer specimens with keyboard selection. Retry changed the failed specimen back to Ready. These are explicitly simulated states, not network behavior.
- Triggered the sample Markdown download. UI reported preparation; the final file's arrival on disk was not independently inspected.
- Reset QA writing through Preferences → Reset this local example → confirmation. Reaction count returned to 0. No demo notes are shipped in source.
- Captured 1440 × 1000 desktop, 390 × 844 mobile, and a 320 × 800 narrow acceptance view. The first 320 capture revealed slight header overflow; a targeted padding/gap and 44 px headline fix was applied. Final DOM: viewport 320 px, document scroll width 309 px (scrollbar occupies the remainder), no elements exceeding the viewport.
- Independently calculated 36 normal-text semantic foreground/background pairs across day/evening. Lowest ratio: 4.892:1. Opaque field captions: 6.448:1. This is not image-wide contrast analysis or a conformance claim.

## Source-inspected contracts

Native buttons, labeled text areas/selects, modal dialogs, ARIA tab roles with arrow/Home/End keyboard handling, explicit composer pressed state, visible focus treatment, a skip link, reduced-motion override, and a semantic equation label exist in source. Reaction content is inserted using textContent; the demo does not evaluate source content or user writing. Human bodies are preserved in the sample export. Storage failure changes the UI to session-only wording.

The Impeccable detector ran once in degraded regex mode because parser dependencies were unavailable. It reported four side-border warnings. The independent reviewer accepted the documented human-authorship margin grammar. It did not assess computed contrast, full accessibility, or application correctness.

## Evidence limits

No real provider request, paper import, live streaming, span-validation pipeline, event database, secure key store, Electron IPC, MCP connection, multi-file Context pack, or user study was exercised. No full screen-reader, forced-colors, OS zoom, offline cache, reduced-motion emulation, or production performance test was performed. Reduced-motion behavior was inspected in CSS, not measured in an emulated setting. Not every responsive view/state was captured.

`finish-review.md` contains the independent review and final per-finding verdict. Its initial and verdict sections distinguish original findings from their eventual resolution.
