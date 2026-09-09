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
- `src/backend/learning-api.ts`, `sourced-learning/`: additive retrieval-before-generation orchestration, acquired evidence validation/context budgeting, separate quota-controlled semantic review, supported path/first-lesson assembly, immutable generated lesson identity and backend phase timing. The public seam and pending producer/desktop connections are documented in [sourced learning](sourced-learning.md).
- `src/backend/render-delivery/`: additive authenticated Manim job/artifact delivery around the isolated worker. HTTP is implemented here and is not registered in `http.ts` until the coordinator patch. See [render delivery](../src/backend/render-delivery/README.md).
- `src/backend/diagnostics.ts`, `runtime.ts`, `entrypoint.ts`: allowlisted secret-safe diagnostics, managed resources and Node HTTP lifecycle.
- `src/backend/sourcing/acquisition/`: guarded public HTTPS acquisition, pinned parse5 HTML extraction and immutable canonical revisions. `src/backend/sourcing/corpus/`: the reviewed one-page manifest, integrity-checked ingestion, deterministic UTF-16 passages and pure revision/tombstone reconciliation. [Acquisition checkpoint and integration limits](corpus-acquisition.md) distinguish this from durable corpus jobs and a populated vector index.
- `src/backend/*.test.ts`: synthetic unit/HTTP/provider/database-double tests. These are explicitly not real provider or PostgreSQL evidence.
- `tests/backend-postgres/authenticated-backend.test.ts`: destructive, disposable-database-only proof of the actual migration, Better Auth session adapter and concurrent Drizzle transactions.
- `railway.json`, `.env.example`, `tsconfig.backend.json`, `scripts/copy-backend-assets.mjs`: deploy build/start/migration wiring and placeholder-only configuration.

## Source index adapter checkpoint

`src/backend/sourcing/index/adapter.ts` composes bounded indexing, deletion and hybrid retrieval. `writes.ts` validates acquired passages and authoritative tombstones; `retrieval.ts` builds identical scoped ANN/BM25 branches, validates exact canonical evidence and fuses ranks. `identity.ts`, `validation.ts`, `deadline.ts`, `transport.ts`, `results.ts` and `types.ts` own generation/row identity, producer validation, operation deadlines, bounded HTTP and safe outcomes. Adjacent public-boundary tests use synthetic vectors and provider responses. [Source index contract](source-index.md) records limits, integration seams and blocked live acceptance. No production transport or route composition is enabled.

## Evidence selection

- `src/backend/sourcing/retrieval/selection.ts`: one backend-only deterministic learning/research selection seam over frozen sourcing contracts; no adapter or route composition.
- `src/backend/sourcing/retrieval/{identity,ranking,fusion,diversity,passages,validation}.ts`: stable work/version grouping, attributed policy signals, reciprocal rank fusion, coverage diversity, exact permitted canonical passages and bounded input validation.
- `src/backend/sourcing/retrieval/selection.test.ts`: synthetic public-seam acceptance cases; [selection policy and outstanding relevance/integration acceptance](evidence-selection.md).

## MVP modules

- `src/main/auth-sdk.ts`: supported Better Auth Electron client, guarded Node fetch for cookie-bearing auth responses, and the SDK OAuth state compatibility wrapper. Adjacent SDK tests cover real Node response headers; `tests/e2e/auth.spec.ts` exercises encrypted restart and sign-out in Electron.
- `src/contracts/workspace.ts`: compatibility project/entry/request models and named channels.
- `src/contracts/learning-records.ts`: serializable source, highlight, human-entry, path, placement, acknowledgement and conflict contracts for the durable learning workspace.
- `src/main/validation.ts`: runtime command, identifier, text, URL and bounds validation.
- `src/main/workspace-store.ts`: sole Drizzle/better-sqlite3 connection and transaction facade; preserves compatibility methods while exposing named learning-record operations and structured unreadable-project diagnostics.
- `src/main/learning-source-writer.ts`, `learning-entry-writer.ts`, `learning-path-writer.ts`: cohesive transaction-scoped invariants for immutable source/path versions, exact highlights, human revisions/supports and trusted backend path acceptance. They receive the store-owned transaction and never open a database.
- `src/main/source-adoption*`, `source-generated-validation.ts`, `source-persistence*`: main-only acquired/generated source acceptance, project/cancellation lifetime, immutable remote-to-local edition mapping and stored provenance validation. `src/contracts/source-provenance.ts` and `source-generated-lesson.ts` describe the additive records/handoff; [source adoption](source-adoption.md) records the producer and UI integration gates. Migration `drizzle/0002_source_adoption.sql` preserves existing editions/highlights while adding trusted provenance storage.
- `src/main/learning-record-persistence.ts`: small shared identity, placement, acknowledgement and compatibility-entry persistence helpers; it is not a generic repository layer.
- `src/main/learning-record-validation.ts`, `learning-record-reader.ts`: runtime operation decoding and the validated learning-workspace read model.
- `src/main/workspace-decoder.ts`: shared runtime decoding for legacy migration, stored records and write-boundary invariants.
- `src/main/workspace-migration.ts`: Drizzle migration orchestration, typed failures, legacy validation, WAL-consistent verified backups and normalized-schema verification.
- `src/main/workspace-schema.ts`: query-only Drizzle table mapping; checked-in SQL migrations remain authoritative for database constraints.
- `src/main/tutor.ts`: bounded OpenRouter request, response/citation parsing and explicit unsupported/failure outcomes.
- `src/renderer/EntryCard.tsx`: human drafts/autosave, AI citations and movable entries.
- `src/contracts/companion.ts` and `src/renderer/companion/`: bounded in-process guidance requester/resolver lifecycle, explicit controls, local pointer decoration and semantic target reveal. Production shell/transport wiring remains AR-37-owned; Practical context producers remain AR-19-owned. See [companion scope](companion.md).
- `tests/e2e/companion.spec.ts` and `tests/e2e/companion/`: isolated Electron consumer journey with synthetic adapters, separate from production-connected acceptance; includes fixture TypeScript checking and daylight/evening/state captures.
- `src/renderer/FieldAtlas.tsx`: the reference arch mark and SVG control family, day/evening preference, and native modal focus/Escape behavior.
- `src/renderer/App.tsx`: approved Opening, project loading through the named learning-records bridge, account Settings entry and shared appearance preference.
- `src/renderer/Shell.tsx`, `shell.css`: persistent topic navigation, Reader/Canvas/Practical/Settings composition, automatic Canvas icon rail and thin detail-mode bar. Reader stays mounted to preserve reading position; successful Canvas moves refresh the shared workspace before remounting.
- `src/renderer/useWorkspaceFlush.ts`: serial save barrier for Reader drafts, Canvas positions and Practical attempts before navigation, project replacement, Cmd/Ctrl+S and ordinary native window close. Failed saves keep the workspace mounted; this does not protect against forced process termination.
- `src/renderer/shell-records.ts`: resolves the exact selected path revision into Practical activity context and searches saved source/entry text without inventing origins.
- `src/renderer/shell/ui/`: the shared `.ui-*` component layer every surface draws its controls from, plus the `EmptyState` and `StatusRegion` React primitives. Its `README.md` owns the authoring contract and the public class list.
- `src/renderer/reader/`: durable pasted-source reading, exact highlights, human notes/questions/insights and revision-aware draft saves. Reader accepts optional shell navigation/explanation slots and reports selected path changes.
- `src/renderer/canvas/`: supported React Flow infinite map, Distilled/Expanded projections, exact origin links and per-view placement saves from the shared learning workspace.
- `src/renderer/practical/`: existing activity/checkpoint consumer plus the new `PracticalWorkspace` load/save wrapper and explicit tool/guidance adapters. The declared desktop bridge and Shell still await AR-37 wiring; empty/unavailable states remain real and unsaved drafts block navigation/close. [Practical integration handoff](practical-work.md).
- `src/renderer/practical/context-resolver.ts`: mounted producer-owned explicit context resolution, full attempt/tool binding, saved-versus-draft human provenance and trusted evidence cancellation. `save-session.ts` owns the detached current/acknowledged snapshots and generation. Companion types/runtime remain an explicitly pending AR-25 dependency; no duplicate contract is installed.
- `src/contracts/practical-work.ts`, `practical-records.ts`, `practical-tools.ts`: compatible activity/draft/commit shapes, bounded load/native-selection operations and the explicit compatible-tool list.
- `src/main/practical-records.ts`, `practical-schema.ts`, `practical-validation.ts`: transaction-backed attempt/revision producer and validated reads on the store-owned connection. `context/practical-work-migration.sql` is the additive SQL handoff; production migration registration belongs to AR-37.
- `src/main/practical-files.ts`, `practical-file-selection.ts`, `practical-cancellation.ts`: bounded native-selected byte retention, hashes, ownership and cancellation without accepting late imports. Paths and bytes never enter the renderer bridge.
- `src/renderer/settings/`: account state/subscription operations and controlled Light/Dark appearance. No key importer or model picker is exposed by the new shell.
- `src/renderer/ReaderExplanations.tsx`: explicit session-local assembly/arm examples inline in Reader; graphics deactivate outside Reader and are never assigned a source origin automatically.
- `src/renderer/research/`: project-scoped research question/results UI consuming the frozen sourcing contract through explicit renderer callbacks. It separates catalog/abstract/readable/acquiring/acquired/partial states, rejects cancelled or mismatched responses, retains question/topic origins and opens only acknowledged local source revisions. `context/research-entry.md` owns the AR-37 integration handoff; Shell/bridge wiring is not included in this component checkpoint. Adjacent tests and `tests/e2e/research.spec.ts` use explicitly synthetic adapters and do not establish connected sourcing or persistence.
- `src/renderer/Opening.tsx`: approved topic-entry scene, actual saved-project rows, duplicate-submit prevention, retryable failure and keyboard focus. App normalizes bridge failures and owns project creation/navigation.
- `src/renderer/styles.css`: scoped application layouts and components; declares the `@layer reset, ui` order and imports renderer-owned `shell/ui/ui.css` into the `ui` layer plus unlayered `tokens.css` and `fonts.css`. The approved `apple-landscape.webp` is bundled by Vite. Opening focus/motion and shared typography follow the accepted portable reference.
- `src/renderer/ToolPanel.tsx`: native guest layout requests, external fallback controls and browser/assembly/arm mode selection. A local scene hides the native guest surface without granting it new capabilities.
- `src/renderer/MatrixLab.tsx`, `math.ts`: a reusable deterministic linear transformation and captured results.
- `src/contracts/explanations.ts`: bounded versioned original-geometry recipes, explicit nullable origin and app-measured session capture contracts.
- `src/renderer/explanations/`: lazy Three.js/React Three Fiber selectable assembly and measured two-link arm; maintained OrbitControls, demand rendering, lifecycle/context-loss fallback, draft-preserving numeric controls and accessible scene interaction. `RetainedClipPlayer` plays an opaque retained Manim clip (play/pause, immediate scrub, named stages, enlarge/resume, captions/notation/provenance, reduced-motion start-paused, one active playback). Captures remain session-only; Reader/Canvas persistence and export are pending coordinator registration. First-load scene chunk is approximately 1.39 MB. `NOTICES.md` records original asset and upstream MIT provenance; consolidated distribution notices remain a release integration requirement.
- `src/renderer/assets/`: bundled approved artwork and Familjen Grotesk, Fraunces, Martian Mono and Newsreader fonts with their OFL notices, verified against the reference manifest.

Window/guest/credential lifecycle and IPC registration live in `src/main/index.ts`; real Electron tests exercise that wiring. Domain behavior has adjacent unit tests. No application imports the pinned Effect reference. Durable pasted plain-text sources and path records now have local contracts and persistence; Reader/Canvas now consume those records. Broad ingestion, generated curricula, durable practical results, sync and durable background jobs remain separate integration work.

`tests/integration/workspace-migration.test.ts` exercises legacy bytes, schema-1 upgrade, WAL-inclusive backups, rollback, stale-backup recovery and migration refusal. `tests/integration/learning-records.test.ts` covers the connected source/highlight/note/question/insight flow, immutable supports and source versions, typed conflicts, cross-project refusal, Unicode locators, stable path identities and independent placements. Native-module commands in `package.json` select the Node or Electron ABI before their corresponding test/runtime command; packaged migration coverage lives in `scripts/test-packaged.mjs`.

## Portable design review

`context/design-handoff/prototype/` is a separate, temporary browser specimen, not shipped Electron code. `app.js` owns the topic sidebar and automatic Canvas icon-rail state, separate note/insight composers, source-highlight note capture, saved note/question support selection and Playbook/export; `workspace.js` owns Distilled/Expanded Canvas presentation, an unbounded dotted camera, topic/chapter origin edges, temporary positions, contextual back/forward navigation, saved exploration questions, pasted-source reading and exact-highlight navigation; `index.html` owns the shell and native dialogs; `styles.css` owns specimen layout. Pasted-text sources work only for the current page session. File/URL extraction, provider retrieval, exploration responses and durable anchors are not implemented here. `prototype-manifest.json` records the exact specimen files; the design contract records founder decisions and review gates.

## Original animation render worker

`src/contracts/animation-recipes.ts` owns bounded serializable clip recipes. `src/render-worker/` owns the isolated Manim preset renderer, cancellation/queue limits, media verification, explicit trusted Docker/FFmpeg/FFprobe argv for evidence, and its synthetic playback/evidence harness. `src/backend/render-delivery/` owns authenticated render orchestration, account-owned artifact retention and bounded artifact HTTP (not registered until the AR-48 coordinator patch). `src/main/retained-media-*.ts` owns desktop copy/hash retention and the `ar-media:` protocol module (registration is a coordinator patch). `src/renderer/explanations/RetainedClipPlayer.tsx` is the production clip consumer around an opaque media identity. See [the worker boundary](../src/render-worker/README.md), [render delivery](../src/backend/render-delivery/README.md) and [deployment requirements](../src/backend/render-delivery/DEPLOYMENT.md). Cloud/OrbStack fixtures are not Electron-connected acceptance. Proposed GitHub-hosted ARM evidence is an AR-41 workflow patch, not an active job in this slice.

`tests/e2e/shell.spec.ts` exercises the assembled source → note → Canvas → Settings → restart journey with temporary synthetic data. `desktop.spec.ts` covers current Opening typography/focus, Reader edits and Canvas placement across restart. It also exercises the retained guest and development tutor named bridges directly, since their MVP controls are no longer shell destinations. `explanations.spec.ts` enters scenes from Reader and preserves numerical, picking/orbit, draft, responsive, idle-render, context-loss and focus checks. `electron-lifecycle.ts` handles Electron beforeunload protocol differences and forced cleanup of temporary test windows; save-on-close remains explicitly asserted in the shell journey.

## Delivery workflow

`.github/lanes.json` maps lane labels to owned paths and `scripts/lane-guard.mjs` (run by `lane-guard.yml`) enforces it on pull requests. `claude-review.yml` posts the pinned independent review. `scripts/linear-seed.mjs` creates the tickets in `.github/next-run-tickets.json`. `context/next-run.md` describes roles, gates and the cloud verification prompt.

## AR-37 production integration repair

See [the exact producer and external-contract handoff](source-adoption-integration.md). `source-desktop.ts` owns bounded main requests, source-selection identity and cancellation; `source-learning-adoption.ts` adapts AR-36 into one transactional source/lesson/path bundle. Main and preload register the source and Practical operations. `PracticalRecords` uses the existing store connection after migration `0003_practical_records.sql`. Shell mounts ResearchEntry and `shell/PracticalSession`, with exact Reader navigation, loaded-attempt consent and flush/close barriers. Portable acquisition parsers live in the source contracts with host-supplied hashing. Producer modules are unmerged dependencies, not files owned by this PR.
