# Implementation map

This map describes the implemented MVP. See [scope and limitations](mvp.md). Read [architecture](architecture.md) before adding process responsibilities.

| Location                       | Responsibility                                                        |
| ------------------------------ | --------------------------------------------------------------------- |
| `src/main/index.ts`            | Electron application and window lifecycle, security configuration     |
| `src/main/startup-error.ts`    | Allow-listed startup messages and privacy-safe typed diagnostics      |
| `src/main/navigation.ts`       | Renderer navigation policy and adjacent unit tests                    |
| `src/preload/index.ts`         | Named workspace/tutor/provider/tool bridge and subscriptions          |
| `src/contracts/desktop.ts`     | Shared serializable desktop contract                                  |
| `src/renderer/`                | Canvas, companion, tool panel, matrix experiment, styles and UI tests |
| `tests/e2e/`                   | Real Electron smoke tests                                             |
| `scripts/test-packaged.mjs`    | Smoke test against the packaged application                           |
| `drizzle/`                     | Authoritative reviewed SQLite migrations and migration journal        |
| `scripts/release-assets.mjs`   | Release asset selection                                               |
| `electron.vite.config.ts`      | Main, preload and renderer builds                                     |
| `electron-builder.yml`         | Installer configuration and packaged file scope                       |
| `.github/workflows/verify.yml` | Shared cross-platform verification                                    |
| `.github/workflows/`           | Pull request CI, candidate releases and optional Sonar analysis       |
| `context/design-system/`       | Shared renderer tokens/fonts/art and standalone interaction specimens |
| `context/repos/effect/`        | Read-only upstream reference; not application code                    |

Unit tests live beside their source. The MVP modules below own the implemented responsibilities.

`vitest.config.ts` separates Node unit, DOM renderer and real SQLite integration projects. `tests/integration/` owns cross-module persistence checks; `context/testing.md` owns test-layer guidance and CI activation evidence.

`compose.sonar.yml` runs the local-only Sonar/PostgreSQL stack and official scanner with immutable images. `context/sonar-local.md` documents operation; `.env.sonar` is private, ignored local configuration.

## MVP modules

- `src/contracts/workspace.ts`: compatibility project/entry/request models and named channels.
- `src/contracts/learning-records.ts`: serializable source, highlight, human-entry, path, placement, acknowledgement and conflict contracts for the durable learning workspace.
- `src/main/validation.ts`: runtime command, identifier, text, URL and bounds validation.
- `src/main/workspace-store.ts`: sole Drizzle/better-sqlite3 connection and transaction facade; preserves compatibility methods while exposing named learning-record operations and structured unreadable-project diagnostics.
- `src/main/learning-source-writer.ts`, `learning-entry-writer.ts`, `learning-path-writer.ts`: cohesive transaction-scoped invariants for immutable source/path versions, exact highlights, human revisions/supports and trusted backend path acceptance. They receive the store-owned transaction and never open a database.
- `src/main/learning-record-persistence.ts`: small shared identity, placement, acknowledgement and compatibility-entry persistence helpers; it is not a generic repository layer.
- `src/main/learning-record-validation.ts`, `learning-record-reader.ts`: runtime operation decoding and the validated learning-workspace read model.
- `src/main/workspace-decoder.ts`: shared runtime decoding for legacy migration, stored records and write-boundary invariants.
- `src/main/workspace-migration.ts`: Drizzle migration orchestration, typed failures, legacy validation, WAL-consistent verified backups and normalized-schema verification.
- `src/main/workspace-schema.ts`: query-only Drizzle table mapping; checked-in SQL migrations remain authoritative for database constraints.
- `src/main/tutor.ts`: bounded OpenRouter request, response/citation parsing and explicit unsupported/failure outcomes.
- `src/renderer/EntryCard.tsx`: human drafts/autosave, AI citations and movable entries.
- `src/renderer/FieldAtlas.tsx`: the reference arch mark and SVG control family, day/evening preference, and native modal focus/Escape behavior.
- `src/renderer/Opening.tsx`: approved topic-entry scene, actual saved-project rows, duplicate-submit prevention, retryable failure and keyboard focus. App normalizes bridge failures and owns project creation/navigation.
- `src/renderer/styles.css`: scoped application layouts and components; imports renderer-owned `tokens.css` and `fonts.css`. The approved `apple-landscape.webp` is bundled by Vite. Opening focus/motion and shared typography follow the accepted portable reference.
- `src/renderer/ToolPanel.tsx`: native guest layout requests, external fallback controls and browser/assembly/arm mode selection. A local scene hides the native guest surface without granting it new capabilities.
- `src/renderer/MatrixLab.tsx`, `math.ts`: a reusable deterministic linear transformation and captured results.
- `src/contracts/explanations.ts`: bounded versioned original-geometry recipes, explicit nullable origin and app-measured session capture contracts.
- `src/renderer/explanations/`: lazy Three.js/React Three Fiber selectable assembly and measured two-link arm; maintained OrbitControls, demand rendering, lifecycle/context-loss fallback, draft-preserving numeric controls and accessible scene interaction. `useArmInputs.ts` separates unfinished draft text from committed parameters. Recipe/geometry math, runtime cleanup and real Electron cases have independent review. Captures remain session-only; Reader/Canvas persistence and export are pending. First-load scene chunk is approximately 1.39 MB. `NOTICES.md` records original asset and upstream MIT provenance; consolidated distribution notices remain a release integration requirement.
- `src/renderer/assets/`: bundled approved artwork and Familjen Grotesk, Fraunces, Martian Mono and Newsreader fonts with their OFL notices, verified against the reference manifest.

Window/guest/credential lifecycle and IPC registration live in `src/main/index.ts`; real Electron tests exercise that wiring. Domain behavior has adjacent unit tests. No application imports the pinned Effect reference. Durable pasted plain-text sources and path records now have local contracts and persistence; visual Reader/Canvas use, broad ingestion, sync and durable background jobs remain unimplemented.

`tests/integration/workspace-migration.test.ts` exercises legacy bytes, schema-1 upgrade, WAL-inclusive backups, rollback, stale-backup recovery and migration refusal. `tests/integration/learning-records.test.ts` covers the connected source/highlight/note/question/insight flow, immutable supports and source versions, typed conflicts, cross-project refusal, Unicode locators, stable path identities and independent placements. Native-module commands in `package.json` select the Node or Electron ABI before their corresponding test/runtime command; packaged migration coverage lives in `scripts/test-packaged.mjs`.

## Portable design review

`context/design-handoff/prototype/` is a separate, temporary browser specimen, not shipped Electron code. `app.js` owns the topic sidebar and automatic Canvas icon-rail state, separate note/insight composers, source-highlight note capture, saved note/question support selection and Playbook/export; `workspace.js` owns Distilled/Expanded Canvas presentation, an unbounded dotted camera, topic/chapter origin edges, temporary positions, contextual back/forward navigation, saved exploration questions, pasted-source reading and exact-highlight navigation; `index.html` owns the shell and native dialogs; `styles.css` owns specimen layout. Pasted-text sources work only for the current page session. File/URL extraction, provider retrieval, exploration responses and durable anchors are not implemented here. `prototype-manifest.json` records the exact specimen files; the design contract records founder decisions and review gates.
