# Implementation map

This map describes the implemented MVP. See [scope and limitations](mvp.md). Read [architecture](architecture.md) before adding process responsibilities.

| Location                        | Responsibility                                                        |
| ------------------------------- | --------------------------------------------------------------------- |
| `src/main/index.ts`             | Electron application and window lifecycle, security configuration     |
| `src/main/startup-error.ts`     | Allow-listed startup messages and privacy-safe typed diagnostics      |
| `src/main/navigation.ts`        | Renderer navigation policy and adjacent unit tests                    |
| `src/preload/index.ts`          | Named workspace/account/tutor/tool bridge and subscriptions           |
| `src/contracts/desktop.ts`      | Shared serializable desktop bridge contract                           |
| `src/contracts/desktop-auth.ts` | Public account/session states, fixed origin/scheme and auth channels  |
| `src/contracts/learning-api.ts` | Authenticated backend request/response, provenance and quota contract |
| `src/backend/`                  | Better Auth, PostgreSQL accounting and bounded OpenRouter server      |
| `tests/backend-postgres/`       | Disposable real PostgreSQL migration/auth/accounting verification     |
| `src/renderer/`                 | Canvas, companion, tool panel, matrix experiment, styles and UI tests |
| `tests/e2e/`                    | Real Electron smoke tests                                             |
| `scripts/test-packaged.mjs`     | Smoke test against the packaged application                           |
| `drizzle/`                      | Authoritative reviewed SQLite migrations and migration journal        |
| `scripts/release-assets.mjs`    | Release asset selection                                               |
| `electron.vite.config.ts`       | Main, preload and renderer builds                                     |
| `electron-builder.yml`          | Installer configuration and packaged file scope                       |
| `.github/workflows/verify.yml`  | Shared cross-platform verification                                    |
| `.github/workflows/`            | Pull request CI, candidate releases and optional Sonar analysis       |
| `context/design-system/`        | Shared renderer tokens/fonts/art and standalone interaction specimens |
| `context/repos/effect/`         | Read-only upstream reference; not application code                    |

Unit tests live beside their source. The MVP modules below own the implemented responsibilities.

`vitest.config.ts` separates Node unit, DOM renderer and real SQLite integration projects. `tests/integration/` owns cross-module persistence checks; `context/testing.md` owns test-layer guidance and CI activation evidence.

`compose.sonar.yml` runs the local-only Sonar/PostgreSQL stack and official scanner with immutable images. `context/sonar-local.md` documents operation; `.env.sonar` is private, ignored local configuration.

## Authenticated backend modules

- `src/backend/config.ts`, `policy.ts`: strict runtime variables and approved origins, session, model, request, concurrency, duration and money limits.
- `src/backend/auth.ts`, `schema.ts`: Better Auth's Node handler, GitHub/Electron server plugin, fixed Electron browser callback destination, authoritative session lookup and Drizzle tables.
- `src/backend/accounting.ts`, `migrations/`: account-scoped idempotency plus locked UTC-month reservation/reconciliation transactions and reviewed SQL.
- `src/backend/text.ts`, `validation.ts`, `provider.ts`, `learning.ts`: remote Unicode/NUL decoding, canonical-source/citation enforcement, price-capped OpenRouter structured-output adapter and interruption-safe Effect reservation/provider/settlement orchestration.
- `src/backend/electron-auth-callback-client.ts`, `http.ts`: strict-CSP callback page and injected self-hosted maintained proxy-client bundle that completes the browser-to-desktop redirect, plus disconnect-aware public account/learning routes. Runtime composition loads the generated bundle before listening, so a missing deployment asset fails startup rather than a browser returning a late 500.
- `src/backend/diagnostics.ts`, `runtime.ts`, `entrypoint.ts`: allowlisted secret-safe diagnostics, managed resources and Node HTTP lifecycle.
- `src/backend/*.test.ts`: synthetic unit/HTTP/provider/database-double tests. These are explicitly not real provider or PostgreSQL evidence.
- `tests/backend-postgres/authenticated-backend.test.ts`: destructive, disposable-database-only proof of the actual migration, Better Auth session adapter and concurrent Drizzle transactions.
- `railway.json`, `.env.example`, `tsconfig.backend.json`, `scripts/copy-backend-assets.mjs`: deploy build/start/migration wiring and placeholder-only configuration.

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
- `src/renderer/App.tsx`: approved Opening, project loading through the named learning-records bridge, account Settings entry and shared appearance preference.
- `src/renderer/Shell.tsx`, `shell.css`: persistent topic navigation, Reader/Canvas/Practical/Settings composition, automatic Canvas icon rail and thin detail-mode bar. Reader stays mounted to preserve reading position; successful Canvas moves refresh the shared workspace before remounting.
- `src/renderer/useWorkspaceFlush.ts`: serial save barrier for Reader drafts, Canvas positions and Practical attempts before navigation, project replacement, Cmd/Ctrl+S and ordinary native window close. Failed saves keep the workspace mounted; this does not protect against forced process termination.
- `src/renderer/shell-records.ts`: resolves the exact selected path revision into Practical activity context and searches saved source/entry text without inventing origins.
- `src/renderer/reader/`: durable pasted-source reading, exact highlights, human notes/questions/insights and revision-aware draft saves. Reader accepts optional shell navigation/explanation slots and reports selected path changes.
- `src/renderer/canvas/`: supported React Flow infinite map, Distilled/Expanded projections, exact origin links and per-view placement saves from the shared learning workspace.
- `src/renderer/practical/`: activity/checkpoint consumer mounted by Shell. The durable result producer remains absent from the declared desktop bridge; empty/unavailable states are real, and unsaved practical drafts block navigation/close.
- `src/renderer/settings/`: account state/subscription operations and controlled Light/Dark appearance. No key importer or model picker is exposed by the new shell.
- `src/renderer/ReaderExplanations.tsx`: explicit session-local assembly/arm examples inline in Reader; graphics deactivate outside Reader and are never assigned a source origin automatically.
- `src/renderer/research/`: project-scoped research question/results UI consuming the frozen sourcing contract through explicit renderer callbacks. It separates catalog/abstract/readable/acquiring/acquired/partial states, rejects cancelled or mismatched responses, retains question/topic origins and opens only acknowledged local source revisions. `context/research-entry.md` owns the AR-37 integration handoff; Shell/bridge wiring is not included in this component checkpoint. Adjacent tests and `tests/e2e/research.spec.ts` use explicitly synthetic adapters and do not establish connected sourcing or persistence.
- `src/renderer/Opening.tsx`: approved topic-entry scene, actual saved-project rows, duplicate-submit prevention, retryable failure and keyboard focus. App normalizes bridge failures and owns project creation/navigation.
- `src/renderer/styles.css`: scoped application layouts and components; imports renderer-owned `tokens.css` and `fonts.css`. The approved `apple-landscape.webp` is bundled by Vite. Opening focus/motion and shared typography follow the accepted portable reference.
- `src/renderer/ToolPanel.tsx`: native guest layout requests, external fallback controls and browser/assembly/arm mode selection. A local scene hides the native guest surface without granting it new capabilities.
- `src/renderer/MatrixLab.tsx`, `math.ts`: a reusable deterministic linear transformation and captured results.
- `src/contracts/explanations.ts`: bounded versioned original-geometry recipes, explicit nullable origin and app-measured session capture contracts.
- `src/renderer/explanations/`: lazy Three.js/React Three Fiber selectable assembly and measured two-link arm; maintained OrbitControls, demand rendering, lifecycle/context-loss fallback, draft-preserving numeric controls and accessible scene interaction. `useArmInputs.ts` separates unfinished draft text from committed parameters. Recipe/geometry math, runtime cleanup and real Electron cases have independent review. Captures remain session-only; Reader/Canvas persistence and export are pending. First-load scene chunk is approximately 1.39 MB. `NOTICES.md` records original asset and upstream MIT provenance; consolidated distribution notices remain a release integration requirement.
- `src/renderer/assets/`: bundled approved artwork and Familjen Grotesk, Fraunces, Martian Mono and Newsreader fonts with their OFL notices, verified against the reference manifest.

Window/guest/credential lifecycle and IPC registration live in `src/main/index.ts`; real Electron tests exercise that wiring. Domain behavior has adjacent unit tests. No application imports the pinned Effect reference. Durable pasted plain-text sources and path records now have local contracts and persistence; Reader/Canvas now consume those records. Broad ingestion, generated curricula, durable practical results, sync and durable background jobs remain separate integration work.

`tests/integration/workspace-migration.test.ts` exercises legacy bytes, schema-1 upgrade, WAL-inclusive backups, rollback, stale-backup recovery and migration refusal. `tests/integration/learning-records.test.ts` covers the connected source/highlight/note/question/insight flow, immutable supports and source versions, typed conflicts, cross-project refusal, Unicode locators, stable path identities and independent placements. Native-module commands in `package.json` select the Node or Electron ABI before their corresponding test/runtime command; packaged migration coverage lives in `scripts/test-packaged.mjs`.

## Portable design review

`context/design-handoff/prototype/` is a separate, temporary browser specimen, not shipped Electron code. `app.js` owns the topic sidebar and automatic Canvas icon-rail state, separate note/insight composers, source-highlight note capture, saved note/question support selection and Playbook/export; `workspace.js` owns Distilled/Expanded Canvas presentation, an unbounded dotted camera, topic/chapter origin edges, temporary positions, contextual back/forward navigation, saved exploration questions, pasted-source reading and exact-highlight navigation; `index.html` owns the shell and native dialogs; `styles.css` owns specimen layout. Pasted-text sources work only for the current page session. File/URL extraction, provider retrieval, exploration responses and durable anchors are not implemented here. `prototype-manifest.json` records the exact specimen files; the design contract records founder decisions and review gates.

## Original animation render worker

`src/contracts/animation-recipes.ts` owns bounded serializable clip recipes. `src/render-worker/` owns the isolated Manim preset renderer, cancellation/queue limits, media verification and its synthetic playback/evidence harness. See [the worker boundary](../src/render-worker/README.md) and [runtime notices](../src/render-worker/NOTICES.md). Account-bound request/artifact persistence, Reader/Canvas attachment and export remain separate pending integration.

`tests/e2e/shell.spec.ts` exercises the assembled source → note → Canvas → Settings → restart journey with temporary synthetic data. `desktop.spec.ts` covers current Opening typography/focus, Reader edits and Canvas placement across restart. It also exercises the retained guest and development tutor named bridges directly, since their MVP controls are no longer shell destinations. `explanations.spec.ts` enters scenes from Reader and preserves numerical, picking/orbit, draft, responsive, idle-render, context-loss and focus checks. `electron-lifecycle.ts` handles Electron beforeunload protocol differences and forced cleanup of temporary test windows; save-on-close remains explicitly asserted in the shell journey.

## Delivery workflow

`.github/lanes.json` maps lane labels to owned paths and `scripts/lane-guard.mjs` (run by `lane-guard.yml`) enforces it on pull requests. `claude-review.yml` posts the pinned independent review. `scripts/linear-seed.mjs` creates the tickets in `.github/next-run-tickets.json`. `context/next-run.md` describes roles, gates and the cloud verification prompt.
