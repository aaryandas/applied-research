# Practical Work — AR-19 producer and integration handoff

This checkpoint implements the result producer and adapters beside the existing Practical Work UI, on base `94340203891406d012028d4762ae15fbfe04e04a`. The current assignment reserves shared store/migration/main/preload/desktop wiring to AR-37. These modules are not yet connected to the shipped Shell. Passing their tests does not establish full connected acceptance or mark AR-19 Done.

The founder's September 8 delegation in [the build handoff](design-handoff/README.md) supplies design authority. The approved AR-26/15/12/5 checkpoint releases bounded implementation; it does not waive real producer integration. The existing Practical screen and styles are retained. The reference manifest remains `34edd8b4cd365afb1160ef2883fa76df547a1f122ec4a7ba8a9aabf06ec27556` (SHA-256 of `design-handoff/prototype-manifest.json`).

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

Starting sends only the existing explicit-action request and its exact activity/attempt/target. The companion owns context resolution, authenticated guidance and observation triggers. This checkpoint does not authorize guest-page reads or outside-app observation; the AR-25 contract uses `pageAccess: 'none'`. Merely mounting a tool or moving the cursor does not invoke guidance.

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
8. Verify the connected source/lesson → attempt → native tool/external work → retained result/reflection → original lesson journey in the real app, across offline restart and cancellation, before ready/Done acceptance. Add Canvas projection only through its owner. Keep measured capture unavailable until its actual producer exists.

## Verification and outstanding acceptance

Adjacent main tests exercise genuine SQLite transactions, close/reopen, immutable origins, revisions, ambiguous retry, source/highlight checks, file bytes/hashes/limits, cancellation and failure. Renderer tests exercise the unchanged UI plus its load/save/guidance/tool adapters. `tests/e2e/practical-tools.spec.ts` uses the actual built desktop bridge and native guest, with explicitly synthetic HTTPS responses to make isolation, blocked URLs, failed loads and cancellation deterministic. Those intercepted responses are not live compatibility evidence.

The full repository check and applicable Electron suite remain mandatory. The isolated producer tests do not replace AR-37's registered production migration/IPC journey, matched full-screen evidence, Cursor recording or independent Fable visual/function/TypeScript review. Sonar at `127.0.0.1:9000` remains unreachable, confirmed outside the network sandbox; no passing scan is claimed. The coordinator owns the serialized integrated scan and issue triage.

Local checkpoint verification on Node 24.19.0/macOS: `npm run check` passed 814 tests in 74 files, formatting, lint, types, coverage and build; `npm run test:e2e` passed all 11 real Electron tests. The Playwright report records 11 expected, zero unexpected/flaky/skipped outcomes and no errors. Logs are `/private/tmp/ar19-final-check.log` and `/private/tmp/ar19-final-e2e.log`; rendered reports and attachments remain in the ignored `playwright-report/` and `test-results/` directories. No production packaging change was made by this lane, and packaged migration acceptance remains with the integration owner.

AR-41 PR [#21](https://github.com/aaryandas/applied-research/pull/21) owns the expanded `lane:practical` catalog. At this handoff it is open, and this branch intentionally leaves `.github/lanes.json` unchanged. Keep the PR draft while required integration/evidence is missing; the dispatcher owns the In Testing transition. Never merge or mark this checkpoint Done based on local helper tests.
