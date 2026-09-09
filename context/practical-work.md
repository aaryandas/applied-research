# Practical Work — AR-19 producer and integration handoff

## AR-50 local journey (current)

AR-19 PR28 and AR-37 PR33 already connected local SQLite Practical records (`0003`), main/preload record/load/select/cancel, and Shell → PracticalSession → PracticalWorkspace. Documentation below that still says those modules are unconnected is historical. AR-50 reuses that flow.

This lane adds:

- Migration `0004_practical_journey.sql` for retained binding snapshots, per-attempt work choice/human plan, and per-milestone progress bound to the exact brief or plan revision. **0004 is reserved to AR-50.** Exact journal entry:

  `{ "idx": 4, "version": "6", "when": 1788930000000, "tag": "0004_practical_journey", "breakpoints": true }`

  `LATEST_WORKSPACE_MIGRATION` is `1_788_930_000_000`. Do not reuse idx 4 or this timestamp.

- A **narrow adapter** in `src/contracts/practical-brief.ts` for a reviewed `CoursePracticeActivityBinding`. AR-52 PR #45 (`b912ebc6`) **failed independent review** and is not accepted producer input. Local type copies are a seam only. Checkpoints are `string[]`; this lane projects stable `checkpoint:${index}` ids for per-attempt progress. Optional capstone is `CourseCapstoneDesignation` (`substantial: true`), not a second brief schema. Missing snapshots use the saved lesson activity plus an optional human-authored plan and **must not** claim a generated capstone exists. Do not parse lesson `activity` prose as milestones.
- Named preview/export operations: opaque `selectionId` + activity/attempt scope only. Main reuses `WorkspaceStore.readPracticalFile` (project/activity/attempt ownership and stored hash). txt/csv/json preview is inert UTF-8 with completeness; PNG/JPEG/PDF start as unsupported-preview. Exact-byte export uses a main-owned save dialog. Limits remain 5 MiB/file, 20 files, 20 MiB/attempt, no-follow import.
- Selected-workspace/lifetime guards on **every** Practical operation, including import. Cancellation drops late dialog/read/export; import and export cannot stack native dialogs.
- Restored Desmos/GeoGebra as optional supported tools, plus explicit external work. No default math tool. Guest closes on switch/navigation/disposal/sign-out/external handoff. No guest-page reading.
- Context resolver wiring: `toolSessionId`, host controls (`pageAccess: none`), and `resolveEvidence` from retained text preview. Authenticated companion/`requestGuidance` is AR-48 and stays a truthful unavailable state with **no** `askTutor` fallback.
- Hosted macOS `practical-tools.spec.ts` guest `capturePage()`: wait for load/visibility/nonzero bounds and retry only the identified transient `UnknownVizError`, requiring a real nonempty PNG. Do not skip that test.

**Capstone is not complete.** A reviewed AR-52-produced accepted brief does not yet drive the persisted local journey. Tests may retain a labelled synthetic binding snapshot. That is not live producer proof.

User-reported checkpoint completion is not mastery. Imported files remain user-selected evidence, never app-measured results or source citations. LocalExplanations `onCapture` objects stay untrusted.

### Shared-file integration (coordinator-owned)

`lane:practical` owns `src/renderer/practical/**`, `src/main/practical-*.ts`, `src/contracts/practical*.ts`, PracticalSession/PracticalToolHost/practical-session, `tests/integration/source-practical-wiring.test.ts`, and `tests/integration/practical-course.test.ts`.

These files remain coordinator-owned. They are in this checkpoint so the journey is testable; they are not claimed as a practical-lane merge:

1. `src/main/index.ts` — named channels, dialogs, workspace guard, guest `setVisible`/`invalidate` on nonzero resize
2. `src/main/workspace-store.ts` — delegates for journey/preview/progress/plan/work-choice/`retainAcceptedBrief` (main-internal; not a renderer-submitted brief body)
3. `src/main/workspace-migration.ts` — `EXPECTED_TABLE_COLUMNS` + `LATEST_WORKSPACE_MIGRATION` so 0004 actually applies
4. `src/preload/index.ts` — named invokes only
5. `src/renderer/Shell.tsx` — chooser/resume/new attempt, full bridge, export cancellation
6. `src/renderer/shell-records.ts` — `listPracticalActivities`

`drizzle/0004_practical_journey.sql` and the journal idx-4 entry are reserved to this ticket. `src/backend/**` is AR-48. No lockfile, styling-foundation, or workflow changes.

---

This checkpoint implements the result producer and adapters beside the existing Practical Work UI, on base `94340203891406d012028d4762ae15fbfe04e04a`. The current assignment reserves shared store/migration/main/preload/desktop wiring to AR-37. These modules are not yet connected to the shipped Shell. Passing their tests does not establish full connected acceptance or mark AR-19 Done.

The founder's September 8 delegation in [the build handoff](design-handoff/README.md) supplies design authority. The current AR-19 repair explicitly authorizes the bounded context producer; its dispatch lists no approved prerequisite checkpoints. AR-25's published contract is an explicitly pending dependency, not an available dependency on main or accepted connected behavior. The existing Practical screen and styles are retained. The reference manifest remains `34edd8b4cd365afb1160ef2883fa76df547a1f122ec4a7ba8a9aabf06ec27556` (SHA-256 of `design-handoff/prototype-manifest.json`).

## Record behavior

`PracticalRecords` receives the existing store-owned Drizzle connection. It never opens another database or owns its lifetime. All writes run in an immediate transaction on that connection, with the existing WAL, FULL synchronous and foreign-key settings retained by the store.

- Activity identity is the exact project/path/revision/topic/lesson plus optional source revision/highlight. Main compares title, instructions and objective with that immutable lesson revision. A source must be the lesson's actual source; a highlight must belong to that source in that project.
- An attempt has a stable UUID and immutable activity. Prediction, attempted setup, user-reported result and human reflection remain separate fields. Each accepts at most 12,000 UTF-16 code units; accepted text is never trimmed, normalized or clipped.
- A changed draft creates an immutable revision and advances the current pointer atomically. A stale different draft conflicts. An unchanged retry at the current or immediately preceding expected revision replays the durable acknowledgement with `changed: false`. A future expected revision conflicts even when text matches.
- A native file return can create an attempt at revision zero before any human draft is committed. Loading it returns an empty human draft plus retained file metadata. The load operation can request an exact attempt or reopen the most recently used attempt for the exact activity. File return updates that recency without revising human writing.
- Returned evidence never becomes a source citation or an AI-authored conclusion. The record retains its original activity origin so returning to learning can reopen that lesson. Canvas projection of these separate records is not implemented by this lane.

The [SQL handoff](practical-work-migration.sql) adds `practical_attempts`, `practical_attempt_revisions` and `practical_files`. No existing table is rewritten. Foreign keys retain the exact lesson/topic/source/highlight and current revision; selected-file references are also constrained to their owning project/attempt. Generated columns derive those references from the validated JSON snapshots, preventing a second writable copy of the origin. SQLite supports generated-column foreign keys; `PRAGMA table_xinfo` includes generated columns whereas `table_info` omits them. [SQLite documentation](https://www.sqlite.org/gencol.html).

This is migration source for AR-37 to register in the checked-in Drizzle journal, startup schema checks, backup/migration path and package. It is deliberately not executed by a renderer command or an ad hoc second production migration runner. The adjacent real SQLite tests apply this exact handoff to an isolated database after creating genuine project/path/source records through `WorkspaceStore`. Production migration/reopen remains an AR-37 integration gate.

## Returned files and locators

The native selection service accepts a single file chosen by a main-owned dialog. IPC accepts activity/attempt identity only. A path, file bytes, MIME assertion, measurement or SQL command is never accepted from renderer input.

| Format                          | Retention policy                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| `.txt`, `.csv`                  | Exact nonempty UTF-8 bytes, no NUL; no CSV interpretation or normalization         |
| `.json`                         | Exact UTF-8 bytes after JSON syntax validation; no object execution                |
| `.png`, `.jpg`, `.jpeg`, `.pdf` | Inert bytes with a matching basic file signature; no parsing, preview or execution |

Each file is bounded to 5 MiB, each attempt to 20 files and 20 MiB total. Names are bounded display basenames without separators, control characters or malformed Unicode. A selected regular file is opened without following a symlink, read through a bounded buffer, and checked for size/time changes during the read. Directories, empty files, unsupported formats and changed files fail without creating a provisional attempt.

The authoritative locator is a random `selectionId` scoped to project and attempt. The local record also stores SHA-256, bytes, media type, length and import time. Only display metadata crosses the bridge. Reopen verifies the retained bytes against their hash; the original file can be moved or deleted without losing the import. `readPracticalFile` is a main-internal, scoped byte-return operation for a future explicit export consumer; it is not a filesystem or execution bridge.

File return has a 60-second waiting bound. `cancel()` revokes import permission synchronously and settles the caller without accepting a late dialog/read result. The physical dialog slot remains occupied until its native promise settles, so cancellation cannot stack another OS sheet. The adapter does not claim it can programmatically dismiss an OS sheet; main must handle parent-window disposal. Cancellation/refusal/storage errors never clear the learner's draft.

The existing `app-measured` public union is preserved for consumers. This producer refuses capture references until a trusted measured-result producer is integrated; it never promotes renderer measurements, an uploaded file or reported text to app-measured evidence. No general project execution or generated-code runtime is introduced.

## Compatible tools and fallback

`PRACTICAL_TOOLS` is an explicit choice list, not a topic classifier or fixed curriculum:

| Tool ID             | Native guest destination                                          |
| ------------------- | ----------------------------------------------------------------- |
| `desmos-graphing`   | [Desmos Graphing Calculator](https://www.desmos.com/calculator)   |
| `geogebra-graphing` | [GeoGebra Graphing Calculator](https://www.geogebra.org/graphing) |

Both destinations loaded and plotted a keyboard-entered `y=x²` in fresh isolated Electron guest sessions on September 9 at approximately 01:39 UTC. The captured graph and equation were visually inspected for each tool. Neither guest exposed Node or `window.desktop`. This is a bounded compatibility observation; sign-in, popups, downloads and every third-party feature are not certified. Real tool captures and the exact receipt are retained in `/private/tmp/ar19-live-tool-evidence/` for the review handoff.

`createPracticalToolAdapter` calls the existing named `openTool`, `closeTool`, `openExternal` and `onToolState` operations. It requires both command completion and an observed successful native load, refuses failed loads, and cancels stalled opens on close or after 30 seconds. External fallback opens only the chosen catalog URL after guidance has stopped and the guest has closed. There is no automatic external launch on failure. Other tools remain the learner's external work; results can return through the same file/text route.

Main retains the real `WebContentsView` policy: separate `persist:learning-tools` session, no preload/Node/application bridge, context isolation, sandbox and web security enabled, denied permissions/popups/downloads, and restricted URL schemes. The adapter never reads page text, clicks inside a guest, calls the tutor or grants observation. The host must hide/close the guest before its Practical surface becomes hidden or unmounts, and keep the existing bounds validation. Tool accounts and web state remain separate from learning records. [Electron WebContentsView documentation](https://www.electronjs.org/docs/latest/api/web-contents-view).

## Explicit guidance

`createPracticalActivityGuidance` structurally adapts the AR-25 session's `getState`, `startActivity(request)` and synchronous `stop('user-stop')` methods to the existing Practical UI. It adds no companion context or target enum. The adapter's status reads the actual session; its owner must rerender on companion state changes and keep this adapter stable per mounted attempt.

Starting sends only the existing explicit-action request and its exact activity/attempt/target. The companion invokes the registered Practical producer for selected context and owns authenticated guidance and observation triggers. This checkpoint does not authorize guest-page reads or outside-app observation; the AR-25 contract uses `pageAccess: 'none'`. Merely mounting a tool or moving the cursor does not invoke guidance.

Stop is invoked synchronously before awaiting anything. Existing navigation flush, Return to learning and external handoff await it before proceeding. Unexpected activity disposal also invokes stop; the named file-selection operation is cancelled when its workspace is disposed. A failed deliberate stop blocks navigation and preserves the draft. Main/companion owners must additionally revoke on window/renderer loss, project/attempt replacement, sign-out and guest disposal; renderer cleanup cannot substitute for those lifecycle boundaries. Live backend assistance and connected companion observation are not claimed by the adapter's synthetic session tests.

## Exact AR-37 integration changes

1. Register the SQL handoff as the next additive migration. Update the authoritative migration timestamp, normalized-schema checks, backup/reopen tests and packaged migration evidence. Keep generated columns in mind when selecting `table_info` versus `table_xinfo`. Do not run this SQL as a fallback after a schema error.
2. Construct `new PracticalRecords(this.orm)` after the existing store has migrated and configured its sole connection. Expose named store methods delegating `recordPracticalResult(value)`, `loadPracticalAttempt(value)`, main-internal `importPracticalFile(scope, file)` and `readPracticalFile(scope, selectionId)`. No raw connection getter is needed.
3. Create one `PracticalFileSelection` per main window with `{ records: store, chooseFile(signal) }`. `records` is a structural pick of only the load/import operations. The dialog callback checks cancellation/window lifetime, calls `dialog.showOpenDialog(window, { properties: ['openFile'], filters: [{ name: 'Returned evidence', extensions: [...PRACTICAL_FILE_EXTENSIONS] }] })`, and returns its single path or null to the service, never to IPC. Do not infer a path from user text or a guest download.
4. Register the following through the existing sender/main-frame-validating `handle` helper and remove them on window disposal. The services already validate unknown inputs and return safe outcomes. Invoke file-selection cancellation before a quit/navigation flush that is waiting on that selection, and on renderer/window loss.

| Named bridge method              | Channel                           | Handler                              |
| -------------------------------- | --------------------------------- | ------------------------------------ |
| `recordPracticalResult(input)`   | `RECORD_PRACTICAL_RESULT_CHANNEL` | `store.recordPracticalResult(input)` |
| `loadPracticalAttempt(input)`    | `LOAD_PRACTICAL_ATTEMPT_CHANNEL`  | `store.loadPracticalAttempt(input)`  |
| `selectPracticalFile(scope)`     | `SELECT_PRACTICAL_FILE_CHANNEL`   | `fileSelection.select(scope)`        |
| `cancelPracticalFileSelection()` | `CANCEL_PRACTICAL_FILE_CHANNEL`   | `fileSelection.cancel()`             |

5. Extend the actual preload object with only those named invocations. `PracticalWorkspaceBridge` is additive; retain existing `DesktopBridge` consumers. A separate optional Practical bridge prop in Shell can preserve older test/consumer objects until all producers are supplied. Do not create a legacy `saveEntry` fallback or manufacture a committed acknowledgement.
6. Mount `PracticalWorkspace` in place of the existing `PracticalWork` call only when the real bridge is supplied. Pass the existing activity, shell-owned fresh attempt UUID, flush registration and `onReturnToLearning`. It loads the most recent durable attempt and uses its actual UUID/revision; it has real empty/loading/failure/retry states and retains existing Practical composition. The shell must still flush before changing activity or project.
7. Supply the stable guidance adapter from the actual AR-25 session. For a learner-selected supported tool, compose the existing `PracticalTool` prop with `{ label: adapter.label, embedded: { open: adapter.openEmbedded, content: host }, openExternal: adapter.openExternal }`. The host owns guest bounds/subscription and visible load errors. Route every host external/close action through the adapter, and await `adapter.close()` when leaving the surface. No default math tool is inferred for arbitrary topics.
8. Verify the connected source/lesson → attempt → native tool/external work → retained result/reflection → original lesson journey in the real app, across offline restart and cancellation, before connected acceptance or Done. Add Canvas projection only through its owner. Keep measured capture unavailable until its actual producer exists.

## Producer-owned companion context — September 9 repair

`context-resolver.ts` now implements `resolveTarget`, mounted through the optional stable `PracticalWork.companionContext.registerResolver` prop. The wrapper passes it through without copying state. Registration reads no writing or tool metadata. A request must be explicit, name an existing app-scoped Practical target, and match the exact project, path/revision/topic/lesson, source/highlight, attempt and immutable activity text. Extra target payload fields are refused. Context comes from the mounted save session, never DOM attributes or the target enum.

`save-session.getContextSnapshot()` returns detached current writing, a generation, evidence availability and the exact last acknowledged draft/revision. Revision zero has no saved draft. Edits during a pending save never become part of that save's acknowledgement. Failed/conflicting saves cannot advance the acknowledged snapshot. Reflection stays human-authored; reported result stays user-reported. A draft is labelled saved only when its complete contents match the acknowledged snapshot; otherwise it carries `unsaved-draft` with the last acknowledged revision (or null for new work). Text is not normalized or clipped; oversized selected context fails safely.

Selecting a retained evidence reference takes precedence over human-reported text for the selected-result target. The optional `resolveEvidence(scope, reference, signal)` must be an ownership-validating producer of retained content. Its result includes exact scope/reference, bounded text and a provenance ID; the resolver rechecks them. Display names, measured-offer summaries and human reports never stand in for trusted evidence. Missing adapter, metadata refresh, missing selection, unsupported content or invalid provenance returns unavailable. AR-19 does not introduce an evidence-content IPC channel in this repair; AR-37 must keep that adapter absent until an actual named, validated producer is connected. App-measured references remain unavailable through the existing persistence producer.

Tool context requires a fixed host subscription/session ID and a supplied `getToolState()` with that identity, catalog-origin URL, title, loading/error state and **app host** controls. Convert the native bridge's empty error string to null. Loading/failure state is explicit and errors use safe wording. These are host metadata and actions, not observed third-party controls or page content. Foreign sessions, malformed/credentialed URLs and noncatalog origins are refused. No DOM, guest-page or OS observation APIs are called. Host changes during resolution invalidate the result. Tool replacement requires a new binding/registration; navigation events still belong to the AR-25 session.

Caller abort and resolver disposal propagate cancellation to the evidence producer and settle even if it ignores cancellation. Late results after draft edits, save acknowledgements or evidence refresh are refused by the producer generation check. Disposal revokes the resolver before unregistering it. The AR-25 requester then stops its session through its own registration cleanup. Deliberate navigation retains the existing stop/flush ordering. Main renderer-loss/sign-out/window-loss revocation still belongs to integration; React cleanup cannot cover a dead process.

### Pending public contract and registration handoff

The inspected public dependency is AR-25 PR [#25](https://github.com/aaryandas/applied-research/pull/25), revision `59f71fdaf3d6c80887a642f45a0d27d4e28b1eae`, `src/contracts/companion.ts` blob `98b19b87a1c30c9c50166e70c68a3da931a5d41c`. The contract is unchanged at the subsequently observed PR head `93c22fc63362adf550a4523142cc6c19a8fdf3b0`. Neither its implementation nor a duplicate Companion contract is copied into this lane. The resolver's inferred output and registration callback were checked by TypeScript against that exact public source in temporary storage: assign `resolveTarget` to `CompanionSessionOptions['resolveTarget']`, return it as `Promise<CompanionResolution>`, and assign `RegisterCompanionResolver` to the Practical registration prop. All assignments pass. Once AR-25 is reviewed/integrated, AR-37 should retain these checks using direct imports from the authoritative contract.

1. Resolve the durable attempt UUID before constructing the companion requester. A fresh Shell seed is not the identity of a reopened saved attempt; both the requester and mounted `PracticalWorkspace` must use the actual resolved attempt. The existing bridge allows an exact or latest-attempt load.
2. Create one AR-25 requester for that immutable scope and one stable `companionContext` object containing its `registerResolver`. Add a fixed `toolSessionId` and `getToolState` only when a real host exists. Add `resolveEvidence` only for a real trusted producer; absence remains unavailable. Do not wrap `registerResolver` in a fresh function on every render.
3. Pass `companionContext` through `PracticalWorkspace` to `PracticalWork`; the component registers the actual save-session getter and disposes/unregisters on scope replacement, registration replacement or unmount. Pass `requester.session.askOnce` through the existing one-shot request prop and use `createPracticalActivityGuidance(requester.session)` for explicit start/stop. Rerender from actual session state.
4. On tool/session replacement, stop the old companion and replace its host binding/registration together. On project/attempt change, stop and flush first, then dispose the old requester; on sign-out, renderer/window loss or external handoff, revoke through the owner's lifecycle. Never retarget an old requester to new writing.

Cursor must execute the existing `practical-tools.spec.ts` at the new frozen head; its added scenario connects this resolver to observed native guest state and verifies disposal without interpreting guest content. Also exercise the connected saved reflection → edit → ask → save acknowledgement → ask journey, edits during save, tool navigation/close, evidence selection/refusal and project/attempt replacement, including keyboard/focus and exact text. The isolated spec and local mounted-component tests do not establish the still-pending Shell/backend journey.

## Verification and outstanding acceptance

Adjacent main tests exercise genuine SQLite transactions, close/reopen, immutable origins, revisions, ambiguous retry, source/highlight checks, file bytes/hashes/limits, cancellation and failure. Renderer tests exercise the unchanged UI plus its load/save/guidance/tool adapters. `tests/e2e/practical-tools.spec.ts` uses the actual built desktop bridge and native guest, with explicitly synthetic HTTPS responses to make isolation, blocked URLs, failed loads and cancellation deterministic. Those intercepted responses are not live compatibility evidence.

The founder's latest dispatch supersedes older local desktop/Sonar instructions: run focused unit/renderer tests and `npm run check` locally; never run local Playwright, `test:e2e`, Playwright-backed packaged tests, local Sonar server or scanner, or create local traces/videos. Cursor cloud owns targeted Playwright and the hands-on recording at the exact PR SHA. macOS GitHub CI owns the blocking full Electron/packaged suite. The hosted GitHub Sonar workflow serializes scans against Railway after successful CI and publishes the exact-revision gate. Hosted Sonar is pending; no local scan receipt is acceptance evidence. Keep all gates intact.

Historical checkpoint `409666c` verification on Node 24.19.0/macOS: `npm run check` passed 814 tests in 74 files; the then-authorized local Electron suite passed 11 tests. Those receipts predate the prohibition and this repair and do not attest the new revision. No local desktop test or Sonar run is permitted for this repair. No production packaging change was made by this lane, and packaged migration acceptance remains with the integration owner.

The context-resolver repair passes `npm run check` on Node 24.19.0/macOS: 848 tests across 75 files, formatting, lint, types, coverage and build. Coverage is 94.71% statements, 90.99% branches, 96.64% functions and 96.27% lines. The log is `/private/tmp/ar19-resolver-check.log`. The desktop spec is typechecked but unexecuted locally; Cursor/cloud CI must supply new exact-revision results. Hosted Sonar is pending.

AR-41 PR [#21](https://github.com/aaryandas/applied-research/pull/21) owns the expanded `lane:practical` catalog. At this repair it is open (observed head `53d5e25cef785ddd412e9116ee153103b3b1d8b4`), and this branch intentionally leaves `.github/lanes.json` unchanged. The current dispatch says to mark the PR ready after permitted local checks pass, with remote verification explicitly pending. Ready is not Done or accepted connected behavior. The dispatcher owns In Testing; do not change Linear status or merge.
