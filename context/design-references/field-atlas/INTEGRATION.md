# Integrating Field Atlas into the Electron renderer

September 7 port: the MVP renderer imports this directory's `tokens.css` and `fonts.css`, bundles `apple-landscape/apple-landscape.webp`, and ports the mark, controls, authorship treatments, themes and native dialogs into scoped React components. `src/renderer/FieldAtlas.tsx` and the current [code map](../code-map.md) identify the implementation. The instructions below remain the reference handoff; historical behavior and complete production contracts are not all implemented.

The repository now has an Electron/React development scaffold. Root `context/product.md` governs product behavior; `context/design.md` governs visual language. This standalone reference demonstrates earlier paper-reader and Workbench interactions. Those are specimens, not the current product scope or event schema. The current learning workbench centers the Learning Path, external activities, returned results, Canvas, and Playbook.

## Adopt first

1. Bring `tokens.css` and `fonts.css` into the renderer’s global style entry. Copy the font files with their licenses. Keep the token names semantic; change `data-theme` on the root to switch palettes.
2. For the desktop app opening screen, use the approved `apple-landscape/apple-landscape.webp` and composition in `apple-landscape/index.html`. Keep the prompt live and centered in the clear sky, preserving the canopy, falling apple and valley. The PNG is the archival original. This 16:10 desktop composition has no approved narrow-screen variant yet; the older atlas portrait is not its replacement. Keep artwork outside opaque reading, authoring and source-preview surfaces.
3. Extract buttons, citations, author labels, inputs, dialogs and tab controls from the reference into scoped React components. `styles.css` also contains atlas-page composition and global element styles; do not import it wholesale into an existing app without scoping.
4. Replace local browser state with durable application state and named, validated preload operations. Reference `app.js` demonstrates relationships between views, not production persistence or event-schema enforcement.

## Component contracts

| Reference component | Production responsibility | States that must survive the port |
|---|---|---|
| Button, text action, icon action | Semantic button; explicit action name; default type; disabled semantics | Hover, press, focus, disabled, busy without layout shift |
| Workspace tabs | One active peer view; arrow/Home/End keyboard behavior; linked tabpanels | Selected, focus, restored active view |
| Paper surface | Immutable parsed paper DOM; actual text-selection anchors; math and figures | Reading, selection, original PDF fallback, unavailable source |
| AI inset | Actual answer event and cited spans, distinct author label | Waiting, streaming, done, canceled, unsupported reference, refused, failed/retry |
| Human composer | Human event body, author constraints, stable source anchor | Empty, drafting, persisted, storage error, saved, undo |
| Source dialog | Resolve real paper/section/sentence identity and show exact context | Located, missing, stale span; open/close and return focus |
| Argument companion | Follow active paper; display sampled/distilled graph | Running, resolved, unresolved, failed/retry |
| Canvas / Learning Path | Connect lessons, questions, attempts, results, and human reasoning | Empty project, current step, branching exploration, returned evidence, source navigation |
| Thesis spine | Human-only claim/evidence/falsifier; durable draft separate from completion | Draft, incomplete, complete, revised back to draft |
| Playbook | Current compiled knowledge and observations; preserve human text | Compiling, ready, stale relative to events, failed/retry |
| Export | Main-process filesystem write and validation | Preparing, writing, complete only after success, failed/retry |
| Preferences | Main-process safeStorage, vault and MCP access | Disconnected, validating, connected, invalid/revoked, unavailable vault |

The fixed highlighted paragraph and local sample Markdown export are deliberate scope boundaries in the reference. Neither substitutes for real text selection, validation, source ingestion, or the multi-file Context pack. The reference also intentionally does not make API-key fields appear operational.

## Guardrails worth testing in the product

- A human insight or thesis cannot be authored by AI at the type and database levels.
- Human wording survives compile/export byte-for-byte according to the normalization contract selected for the product.
- An unresolved source never renders a semantic verification badge.
- Draft persistence is independent of the “complete” predicate.
- Counts derive from the same event collection in every view.
- Closing a source restores both reading context and keyboard focus.
- Aborted and failed operations leave recoverable text and source anchors.
- Reduced motion keeps all final states available immediately.

Validate these in the actual Electron app with real papers, long text, keyboard-only use and assistive technology. The visual reference’s browser checks do not establish these production guarantees.
