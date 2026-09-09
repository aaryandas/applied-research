# AR56 — finish shared navigation, record authority and feature mounts

Run as **Cursor CLOUD Grok 4.6 Extra High** only. This is a read-only handoff, prepared against **7c68a6833ca41d7fb38d013a825547037e680483** on `codex/ar-walkthrough-integration`. Coordinator supplies the actual frozen starting SHA and reviewed producer checkpoints. No application changes were made to prepare this document.

The founder authorized implementation and project branch/PR publication. Create `codex/ar-56-shared-integration-cloud`, one `lane:integration` draft PR against `codex/ar-walkthrough-integration`; do not self-merge. The current `.github/lanes.json` has **no integration lane**, despite older prose referring to one. Coordinator must add the narrow lane below before dispatch or keep dependent changes as isolated patches until it exists. No new foundation/dependency, arbitrary IPC, legacy direct-provider fallback, provider spend or production deployment is implied. Follow latest AR41 cloud verification; no local Mac Playwright, packaging, screenshots/video/traces or Sonar, and no local/headless Cursor/Fable.

Read `context/walkthrough-2026-09-09.md`, `product.md`, `domain.md`, `workbench-contract.md`, `source-adoption-integration.md`, and the current AR47/49/50/51/52/53/54/55 handoffs. The completion ledger is `/private/tmp/capstone-completion-ledger.md` on the coordinator machine. Preserve AR46's Reader mount and strict Home/native-close barrier, including view→close escalation.

## Deliverable and boundaries

AR56 completes **shared integration** left outside feature lanes:

1. Search saved lesson/title/source/writing and open the exact record, including originless notes; source origin and record identity are distinct targets.
2. Apply coherent Reader/Shell chrome and the already-requested feature mounts, using actual producer callbacks and shared workspace refresh.
3. After AR53 review, retain exact entry-parent origins through current save operations and read model. Integrate actual retained explanation/artifact and companion modules through the one store/IPC/project lifetime.
4. Broker additive SQLite/schema/bridge registration once, coordinated with AR47 profile/onboarding/resume and AR50 Practical migrations.

**AR47 owns durable recent lesson/read-position storage and Opening resume UI**, using the seam below. AR56 owns the corresponding shared Reader/Shell adapter, not a second resume database. **AR47/48 must explicitly own W42 evidence-driven course adaptation**; selected-lesson generation does not close it. AR56 records/tests the integration target but does not invent an assessment backend.

Do not implement source generation, profile/interview screens, Canvas authoring, Practical UI, recipe engines, the explanation planner, retained-media engine or Companion controller again. Those owners supply reviewed modules and exact signatures. AR52/53 contracts are still in progress: none of the proposed APIs below may be described as already exported or implemented.

## Current operations and integration points — verified existing

| Existing file / operation                                                | What it actually does / constraint                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/contracts/learning-records.ts`: `getLearningWorkspace(projectId)`   | Returns project, entries with immutable revisions, sources/versions, highlights, paths/revisions, placements and diagnostics. No resume or explanation/artifact collection in current `LearningWorkspace`.                                                                          |
| Same contract: `saveReadingNote`, `saveQuestion`                         | Input `{projectId,entryId?,expectedRevision,title,body,origin}`; commit/acknowledgement or revision-conflict result. Human attribution, original kind and exact bytes retained.                                                                                                     |
| Same contract: `saveInsight`                                             | Same input plus exact `{entryId,revision}[]` supports; at least two distinct saved human notes/questions. Origin is not a support or citation.                                                                                                                                      |
| Same contract: `moveLearningRecord({projectId,recordId,view,x,y})`       | Saves placement, returns void. `workspace_records` currently permits only entry/source/path/topic/lesson; no artifact record type exists.                                                                                                                                           |
| Same contract: `saveHighlight`                                           | Exact immutable source/version/start/end/quote; `savePathRevision` is a human path writer, not acceptance authority for model output.                                                                                                                                               |
| `src/renderer/shell-records.ts`: `searchWorkspace`                       | Searches current source title/text and entry title/body. Returns `{id,label,kind,origin}`. No path/lesson search; identity alone not routed; originless result is noninteractive.                                                                                                   |
| `src/renderer/Shell.tsx`: `openOrigin`, `editEntry`, `selectLesson`      | Use `navigate(...,'view')` into mounted Reader. `editEntry` starts human editing, so it must not be reused as a read-only search reveal. Current `selectLesson` does not generate pending content.                                                                                  |
| `src/renderer/reader/Reader.tsx`: `ReaderNavigationControls`             | Existing methods are `flushViewNavigation()`, `openOrigin(origin)`, `editEntry(reference)`. No read-only entry reveal, location report/restore or retained-artifact open method.                                                                                                    |
| `ReaderProps.onExplainSelection`                                         | Optional real seam `(request:{kind:'text'                                                                                                                                                                                                                                           | 'visual',origin:LearningOrigin,quote:string})=>Promise<void>`. Reader first retains exact highlight, then invokes. Shell currently supplies none; buttons omitted. |
| `src/renderer/reader/ReaderContext.tsx`                                  | React Aria Notes/Insights/Sources tabs, current human note/question cards, exact supports and source controls. Tabs uncontrolled, cards have no external reveal target. AI assistant entries are not all represented here.                                                          |
| `src/renderer/shell/research-callbacks.ts`: `WorkspaceOperationLifetime` | Project activation, pending origin and one Practical stop registration. It does not yet revoke help/render/download/companion operations. Do not turn a source-only pending origin into a generic unvalidated data bus.                                                             |
| `src/renderer/useWorkspaceFlush.ts`                                      | Reader strict/view, Canvas and Practical save registrations. Same-project view flush preserves dirty import while Reader mounted; Home/native close uses strict. Pending view→workspace flush queues strict check.                                                                  |
| `src/main/index.ts`: `handle(channel,operation)`                         | Validates sender webContents and mainFrame for every registered channel; must remain the single named IPC gateway. `SOURCE_CHANNELS.activate` owns selected workspace; `revokeWorkspaceOperations` currently revokes sources/files/tool. Handler cleanup occurs on window `closed`. |
| `src/main/workspace-store.ts`                                            | Sole better-sqlite3/Drizzle connection and transactions; delegates Practical records via `PracticalRecords`; provides main-internal `readPracticalFile(scope,selectionId)` and trusted source/adoption methods. Never open another local database.                                  |
| `src/preload/index.ts`, `src/contracts/desktop.ts`                       | Named IPC wrappers; `window.desktop` currently intersects DesktopBridge, LearningRecordsBridge, PracticalWorkspaceBridge and SourceDesktopBridge. New imported bridge interfaces need explicit composition plus test fixtures/types, not raw invoke.                                |
| `src/main/source-transport.ts`                                           | Main-owned fixed-origin cookie transport for exactly three source endpoints. Reuse constraints, not a public arbitrary endpoint/URL operation. AR48 owns backend HTTP/runtime and source producer changes.                                                                          |
| `src/renderer/shell/PracticalSession.tsx`, `practical-session.ts`        | Real Companion requester/controller mounted, optional `requestGuidance` currently absent, unavailable fallback. AR50 owns actual Practical target/tool/evidence adapter; AR55 owns authenticated guidance.                                                                          |

## Chunk A — local exact-target search and Reader reveal (ready now)

This chunk is independent of AR52/53 and can be reviewed while those contracts mature. No remote search engine, embeddings, second index or database migration is needed.

Create a small renderer-internal **proposed** navigation union, e.g. in `src/renderer/shell/record-navigation.ts`:

```ts
type WorkspaceRecordTarget =
  | { kind: 'source'; sourceRevisionId: string }
  | { kind: 'topic'; path: PathOrigin }
  | { kind: 'lesson'; path: PathOrigin & { lessonId: string } }
  | { kind: 'entry'; reference: EntryRevisionReference };
```

This is a local UI value derived from `LearningWorkspace`, not an IPC contract or source authority. Add a retained-explanation target only when the reviewed artifact read model supplies its real ID/revision. Do not prematurely add arbitrary record kinds.

- Make `searchWorkspace` return a stable keyed result with exact target, label/kind and bounded useful match excerpt. Include current path/topic/lesson title and lesson objective/activity, source titles/canonical text and saved writing title/body. Avoid duplicate matches representing the exact same target; do not deduplicate distinct notes just because their text is identical. Preserve actual source and AI/human labels.
- Every returned result is actionable, including `origin:null` notes/questions. Opening a note selects its actual read-only record, optionally exposes its separate origin link, and does not silently create/edit content. A note with a source origin must reveal the note, not only the source. A retained historical support link reveals that revision without replacing it with current wording.
- Proposed Reader navigation addition: `revealEntry(reference: EntryRevisionReference): void` after Shell flush succeeds. Reader/ReaderContext resolve exact entry/revision from workspace, choose Notes or Insights tab, render/reveal/focus the card. Current record is not automatically editable; historical or AI remains read-only. If a searchable record kind has no existing tab, provide a focused read-only record detail within the same Reader context rather than making search result inert or mislabeling it Human.
- Use controlled React Aria selected tab plus producer-owned refs for reveal/focus. Focus a named record container/heading with `tabIndex=-1`, not its Edit button or support checkbox. Do not locate cards by arbitrary DOM text or auto-check insight support. Entry not found shows a recoverable missing-record state without changing unrelated reading text.
- Lesson target uses the **same** selected-lesson callback as the persistent sidebar. AR47 installs selected-lesson generation there after its checkpoint; search must not implement a second generation path or bypass proposal/target lifetime rules. Topic matches reveal the real saved topic/outline or first explicitly selected lesson, not a silently invented source. Do not edit AR49-owned sidebar concurrently; use the agreed callback/target adapter.
- Keep one visible Find entry and Cmd/Ctrl+K. Search result navigation stops active guidance and uses view flush; dirty import survives because Reader stays mounted, while failed writing/placement blocks data-losing transitions. Repeated activation while flush pending must not cause two opens.

Observable tests: title-only pending lesson found; originless note found and focused; sourced note reveals its own content; two same-body records remain distinct; Unicode query/long title; exact old support revision; AI record read-only; zero writes from search/open; failed flush keeps route/draft; lesson result calls single shared selection callback with exact path revision/topic/lesson. Cloud recording shows actual Find→note→origin→Find→lesson and keyboard focus.

## Chunk B — Reader/Shell chrome and feature mounts (some work ready now)

Coordinator transfers exclusive shared-file integration ownership to AR56 for the frozen merge window. Other lanes return patches for these files; they must not also edit them concurrently.

1. Remove the exact redundant Canvas `<button ...>Return to reading</button>` in Shell; preserve Reader icon, detail toggles and Canvas save barrier. Apply AR49's real writer props/callbacks and manual sidebar behavior from its reviewed patch; do not write a second Canvas composer or toggle state machine.
2. Remove the universal `ReaderExplanations` mount/import from the production Shell. Its generic assembly/arm slot currently appears after any source/import. Mount AR51's retained/contextual consumer only when a real selected origin/request/artifact exists. Keep unsupported capability truthful; unrelated demo removal cannot be reported as completed visual integration.
3. Replace the globally prepended legacy `SourceLearningEntry` path-generation form with AR47's accepted onboarding/on-demand flow when available. Do not leave a second bypass that immediately saves a final path while the product labels another screen a preview. Standalone source research remains functional, but should have one coherent contextual source entry rather than a permanent generation banner above every destination.
4. Place actual save/error/draft status near the work it describes. Remove/reposition detached global “Save work” duplication only with preserved Cmd/Ctrl+S/native-close barrier and discoverable retry on failed draft. Retain exact input/error cause states; do not replace useful messages with generic “Work saved” after permissive view navigation.
5. Mount actual AR51 `onExplainSelection` controller and retained player/scene surface, AR55 requestGuidance/selected-target controls, AR50 Practical chooser/attempt/brief adapters, and AR47 exact lesson activation as their reviewed checkpoints arrive. Required production bridge operations must be explicitly assembled; fake success adapters or casting unknown bodies into a capability are prohibited.
6. Refresh `onWorkspace` only from accepted store reads after saves; source/entry/artifact identity must remain consistent across Reader/Canvas. Preserve main project activation and reject late response after project switch/signout. Keep Reader project-keyed and mounted through same-project routes; only the active explanation surface plays/renders.

Do not spread all feature state into Shell. Keep it an assembly component, with narrow project-keyed controllers/modules that accept exact existing/new reviewed adapters. Avoid overlapping generic “manager” layers with each feature's existing cancellation/retention session.

## Chunk C — exact entry origin persistence (gated on reviewed AR53)

At this base, `LearningOrigin` has only sourceRevisionId/highlightId/path. **No entry-parent field exists yet.** The expected AR53 additive shape is `entry?: EntryRevisionReference`, but its reviewed contract is authoritative. Do not independently edit contract exports while AR53 runs.

After checkpoint, retain entry origin through existing `saveReadingNote` / `saveQuestion` / `saveInsight`; no `createGraphEdge` or `saveCanvasLink` operation. Concrete integration files:

- `learning-record-validation.ts`: its private `origin(value)` decoder and `decodeHumanEntry` accept/validate exact parent reference with bounded revision, according to reviewed contract.
- `learning-entry-writer.ts`: `assertOrigin` verifies saved exact same-project revision; `insertEntryContext` writes it; **`sameOrigin` must compare it** or a parent-only change will be incorrectly returned as unchanged. Apply the contract's self-reference/cycle policy. Preserve `copyLegacyLearningEditContext`, no-op equality and immutable support revisions.
- `workspace-schema.ts` + allocated SQL migration: add paired parent entry/revision columns or exact approved normalized relation, with referential constraints and same-project main checks. No rewriting older source/path origin or overloading insight_supports/citations.
- `learning-record-reader.ts`: `originFromContext` must include parent-only origins in its non-null test and decode exact revision. Otherwise stored parent links disappear on reload despite successful writes. Expose through the existing `getLearningWorkspace` path.
- `reader/EntryOrigin.tsx`: render an explicit parent-entry link and route through read-only exact reveal, distinct from source citation or insight support. Unavailable retained parent is explicit, not inferred from current selected lesson.
- AR49 owns `canvas/graph.ts` and node UI: give it this reviewed populated read model/checkpoint so it can draw exact origin edge and branch via existing saves. AR56 may apply its isolated final consumer patch only after ownership release, not race its live branch.

Tests: current save→new revision changing only parent→reopen retains exact parent; origin-only note with no source/path survives; parent updated later still resolves old revision; foreign/nonexistent/malformed parent refused; unchanged save no extra revision; exact old source/highlight/path/support bytes unchanged; legacy edit retains context; branch rendered using stored relationship after restart. Existing `tests/integration/learning-records.test.ts` is the real store seam; add focused adjacent integration cases rather than only graph fixtures.

## Chunk D — retained artifacts and companion composition (gated on AR53 + producers)

AR53 supplies validated named request/reply/artifact/guidance contracts. AR51 supplies context/planner/retained scene/answer services; AR54 render delivery and `retained-media-*`; AR55 authenticated guidance. AR56 owns the **shared registration and transaction/readmodel joins**, not substitute domain implementations.

Checkpoint packet required from each producer: exact exported types/functions, accepted/rejected inputs, constructor dependencies, transactional acceptance hook and read projection, cancellation/disposal hook, required named IPC channels, SQL/schema changes, UI callback props, tested head and independent review. If absent, deliver Chunk A/B/C and explicitly keep D open; do not fabricate a handler returning “saved.”

- Wire module services using the existing `WorkspaceStore` connection/transaction authority. Retained trusted AI/artifact acceptance stays main-only after producer validation; renderer sends intent or opaque retained IDs, never trusted AI/source/artifact bodies, filesystem paths, media URL, measured results or account ID. Follow exact AR53 exports, not names guessed from this handoff.
- Decide once whether approved artifact summaries enter `LearningWorkspace` or a sibling named read operation. Current workspace has no artifact collection. Both Reader and Canvas must consume the same retained identity; separately manufactured scene IDs per mount are not integration. A movable artifact also requires a valid shared placement identity: current `workspace_records.record_type` SQL CHECK rejects anything outside five types. Extend it through reviewed migration if needed; never label explanation as a human note to avoid that constraint.
- Apply AR54 opaque retained-media protocol/CSP registration in the actual owning file. Current renderer CSP is injected by `electron.vite.config.ts`, not the playback harness's permissive file: policy. Add only the exact reviewed app-owned media source/protocol and ownership checks; never widen to arbitrary file/http URLs or copy harness globals into production.
- Compose named bridges in `contracts/desktop.ts` and `preload/index.ts`, main validated handlers and window-close removals. New main operations must verify currently activated project/request lifetime and saved source/entry/artifact ownership. Existing `selectedWorkspaceId` is established by source activation: do not accidentally let unrelated cancellation clear a new project's state or make all local offline reads require authentication.
- Extend `revokeWorkspaceOperations` and Shell lifecycle adapters with producer-owned cancellation for help/render/download/guidance. Stop/revoke synchronously before signout/project replacement/native guest handoff/window destruction, then allow physical requests to drain under their own bounded slots. No late accepted result attaches to next project or restores guidance consent.
- AR50 owns PracticalSession/ToolHost/requester target production; AR55 supplies the authenticated requester. Apply their isolated adapter patch once. Existing `CompanionGuidanceInput` is explicitly **in-process, not a validated IPC schema**. Do not expose it directly. Pass exact saved/draft provenance, selected opaque evidence references and real semantic controls; no ambient/page/outside-app reading, automatic action, AI selectors or synthesized measured evidence.
- AR48 owns backend `http.ts`, `runtime.ts`, provider/accounting/policy modules. AR56 returns/applies only agreed registration patches against reviewed producer exports; it must not race AR48 or build alternate unauthenticated routes. Keep real provider accounting and original source resolution.

Integration tests: IPC rejects wrong frame/foreign source/project/entry/artifact; missing/forged context cannot hit backend; route switch cancels and ignores late success; retained answer/scene/clip identity survives Reader→Canvas→restart/offline; only active player/scene runs; corrupt retained asset shows safe retry preserving previous useful artifact; main rejects false app-measured capture; selected guidance target is actually resolved, useful authenticated answer displayed and Stop/signout revokes. Cloud evidence needs real producer output, not unavailable-state tests alone.

## One migration owner and collision protocol

Current committed journal ends at `0003_practical_records`, index3, timestamp **1788922800000**. `LATEST_WORKSPACE_MIGRATION` is the same number. `workspace-migration.ts` validates **exact table and column sets**, so adding SQL without updating expected schema fails on startup; do not weaken that validation to accommodate multiple branches.

AR50 has already proposed `0004_practical_journey.sql`. AR47 needs profile/interview/proposal/step mapping/resume tables. AR51/54 need artifact metadata; AR53 parent origins need storage. All of them may assume “next migration.” Avoid four conflicting 0004 files or journal merges that silently omit changes.

1. Coordinator/AR56 reserves journal number and monotonically increasing timestamp **when each reviewed checkpoint is integrated**, records allocation in the ticket/PR, and rebases the next owner on that checkpoint. Prefer honoring AR50's already-announced 0004 if still unshipped/unconflicted; do not treat suggested 0005/0006 as allocated by this document.
2. Domain owners send exact DDL/schema/table/projection/tests as an isolated patch; AR56 applies schema/store/journal/main/preload registration serially. AR47 may own new profile/resume module implementation but yields shared store/schema/journal files during this window. No parallel writes to them.
3. Never renumber or edit a migration already applied by a shipped/published accepted build. For unpublished cloud branch migration collisions, coordinate safe renumber/rebase before integration and update all test expectations together. SQLite journal/schema upgrades must preserve source/hash/entry/support/placement/Practical revisions and exact human bytes.
4. Add schema maps/timestamp/package inclusion together. Foreign key checks and migration rollback/verified backups remain enabled. Test new database, upgrade from0003 with sources/notes/insights/positions/attempts, already-upgraded rerun, malformed/foreign data refusal and failure rollback; no destructive reset or fresh-only passing proof.
5. Validate the cumulative schema after AR47+AR50+origin+artifact integration, not just each module's private fixture. Captured result bytes remain main-owned and not duplicated as huge renderer JSON. Unchanged old records retain hashes and provenance.

## Durable exact resume seam — AR47 owner, AR56 adapter

Current Reader initializes `initial.sources[0]` and keeps path/version/span in local React state. Existing source DOM mount preserves a view excursion, not A→B→A/restart. There is no `getRecentLesson`, `saveReadingPosition` or resume table. These names below are **proposed for AR47/52 review**, not current operations.

Use one AR47-owned bounded local location record, separate from content revision/mastery:

```ts
interface LearningReadingLocation {
  projectId: string;
  path: PathOrigin & { lessonId: string };
  sourceRevisionId: string | null; // pending lesson has no readable source
  textOffset: number | null; // valid UTF-16 scalar boundary in that exact edition
  viewportOffset: number | null; // bounded local visual offset, never citation authority
}
// Proposed named operations; AR47/52 freezes actual exports:
getRecentLearningLocation(): Promise<LearningReadingLocation | null>;
getLearningLocation(target: { projectId: string; path: PathOrigin & { lessonId: string } }): Promise<LearningReadingLocation | null>;
saveLearningLocation(input: { location: LearningReadingLocation; expectedRevision: number }): Promise</* reviewed acknowledgement/conflict */ unknown>;
```

The final stored/read projection should include version/acknowledgement needed by expectedRevision; do not literally expose `unknown` above. Prefer the reviewed common commit/conflict vocabulary. Main resolves same-project path/lesson/source and bounded offset, stores latest-per-lesson plus explicit most-recent-lesson pointer atomically, and refuses stale writes. Source-only browsing must not erase the most-recent course lesson or cause Continue learning to become “first imported source.” Path revision changes retain historical location or use a reviewed stable-lesson mapping with explicit stale-source handling; never quote-search a similar new edition and call it exact.

AR47 owns new resume module/schema patch, durable recent access ordering, App/Opening card and request lifecycle. AR56 adds narrow Reader `initialLocation`/`onLocationChange`/`restoreLocation` adapter using the reviewed type, reports only actual active content, restores after exact source text mounts, and saves pending location before transitions that replace that lesson/project. Track per-project/request generation so late A save cannot replace B's latest pointer. A passive resume save must not count as new human content, mastery, or provider activity. Flush/retry visibility joins existing ordinary-close behavior; do not leave unsaved human drafts behind because a location save succeeded.

If AR47 already implements a different reviewed narrow location interface, use it and delete this proposed duplicate. Acceptance: read lessonA halfway → lessonB →A same position; Home/reopen, app restart, updated source/path edition, pending later lesson, viewport resize; exact most-recent card and older project access. No provider request just from restoring already-generated lesson.

## W42 adaptation remains a separate explicit requirement

AR52's initial propose/revise/accept + ensure selected lesson cannot by itself implement **evidence from later learning → safe proposed curriculum adjustment**. AR56 must keep W42 open unless AR47/48 publish this real extension.

Required (proposed) sibling contract: a request references current accepted course/path revision and exact saved diagnostic/Practical attempt or selected answer/evidence revisions plus optional human intent. Main resolves ownership and bounded provenance; backend returns a rationale-linked proposal identifying affected prerequisites/depth/deeper source branch. Explicit learner acceptance then applies a new path revision while retaining old lessons/notes/supports/origins and stable identity. Raw renderer strings marked “verified mastery” or a silently replaced syllabus are not acceptable evidence. New assessment/propose-course-adjustment operation name/HTTP discriminator must be frozen with AR52/AR48, not invented in Shell or smuggled into `savePathRevision`.

Assign **AR47 UI/storage + AR48 backend**; AR50 supplies exact attempt/evidence producer, AR51 diagnostic/answer references. AR56 only mounts the reviewed action and verifies shared lifecycle. Minimal observable scenario: a saved explanation or practical result reveals a prerequisite gap → app proposes a named prerequisite/deeper branch with actual reason → learner rejects/accepts → history and current work survive. Initial self-report personalization does not count as this scenario.

## Narrow path ownership

Coordinator should add an explicit integration lane allowing the following shared integration surfaces, not `src/**`, `src/main/**`, all Reader or all renderer. The list is an integration lease; feature-domain ownership remains as above.

**AR56 direct work:**

- `src/renderer/Shell.tsx`, `src/renderer/shell.css`, `src/renderer/shell-records.ts`, `src/renderer/shell-records.test.ts`, `src/renderer/shell/Shell.integration.test.tsx`.
- New `src/renderer/shell/record-navigation.ts`/`.test.ts` and small named shared-integration controller modules/tests agreed before creation; existing `src/renderer/shell/research-callbacks.ts`/`.test.ts` if project lifetime wiring needs it.
- `src/renderer/reader/Reader.tsx`, `ReaderContext.tsx`, `EntryOrigin.tsx`, `SourcePane.tsx` only for exact reveal/location/consumer wiring; their adjacent tests and new targeted integration tests. `reader.css` only for those read-only reveal states, not a broad redesign.
- `src/renderer/useWorkspaceFlush.ts`/`.test.tsx` only for actually added producers, preserving current semantics.
- Shared `src/main/index.ts`, `workspace-store.ts`, `workspace-schema.ts`, `workspace-migration.ts`, `learning-record-validation.ts`, `learning-entry-writer.ts`, `learning-record-reader.ts`; adjacent touched-file tests, `tests/integration/learning-records.test.ts`, `workspace-migration.test.ts`, and new named integration tests for origins/bridge/lifetime.
- `src/preload/index.ts`; `src/contracts/desktop.ts` composition only; reviewed amendments to `learning-records.ts` only after AR53 owns/releases them. SQL migrations and `drizzle/meta/_journal.json` allocated by the coordinator; never wildcard permission to change old history.
- `electron.vite.config.ts` only for the reviewed retained-media CSP integration if AR54 needs it; exact associated policy/packaging smoke fixture paths only after identifying their real owner.

**Keep out of AR56 domain edits:** App/Opening/Settings (AR47); onboarding contracts (AR52); new help/artifact/guidance contracts (AR53); Canvas/** and ReaderSidebar files (AR49); Practical/**/PracticalSession/ToolHost/domain files (AR50); explanations/**/retained explanation domain files (AR51/54); render-worker/backend render-delivery/retained-media (AR54); companion/** and guidance modules (AR55); backend HTTP/runtime/provider/source domain (AR48). Apply each owner's isolated shared registration patch, do not recreate its module. If a checkpoint requires an unlisted file, record exact purpose/owner and narrow lane adjustment; no blanket scope widening.

## Reviewable completion chunks and exit criteria

Keep one AR56 PR with small reviewable commits/checkpoint heads if repository workflow requires one ticket/PR. Do not wait idle for every feature before completing the independent first chunk.

| Chunk                                 | Can begin                                                  | Observable exit / independent review                                                                                                                                                                                           |
| ------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A Search/read-only exact reveal       | Now                                                        | Saved lesson and originless/sourced/AI records findable and correctly focused; no writes/editing; keyboard/draft tests.                                                                                                        |
| B Shell chrome + ready mounts         | Now for removal; feature mounts after reviewed owner patch | No duplicate Canvas return/universal demos/permanent generation banner; real callbacks only, preserved source drafts and strict close.                                                                                         |
| C Entry origin                        | Reviewed AR53 shape + allocated migration                  | Existing saves persist exact parent revision; reload/readmodel/Reader/Canvas edge correct; current/legacy/no-op/foreign tests.                                                                                                 |
| D Artifact/companion shared authority | Reviewed AR51/53/54/55 modules + AR50 producer adapter     | Trusted result retained and shared; named authenticated requests, exact ownership and cancellation; real useful output/offline reopen.                                                                                         |
| E Resume and accepted-course joins    | AR47/52 reviewed record/controller                         | One exact recent lesson and A→B→A/restart position; no stale overwrite, fake preview or duplicated generated lesson.                                                                                                           |
| F Cumulative migration/frozen journey | All prior integrated                                       | Upgrade existing data through all allocated migrations, full shared bridge/type/build checks; actual cloud recorded learning→search/branch→explanation→Practical→restart. W42 either demonstrated or explicitly assigned/open. |

Run meaningful focused Node/renderer/storage tests and TypeScript with Node24/npm exact lock. Required hosted macOS/build/package/independent standards/spec/actual cloud walkthrough + current hosted Sonar evidence belong to latest AR41. Recheck frozen head and attach actual recording provenance; incomplete producer checkpoint, synthetic adapter or unavailable-only UI is not full acceptance. Return exact commit/PR, integrated producer SHAs, migration allocation, checks, remaining named dependencies and root-only deployment/verification needs. No product-complete claim until remaining required journeys pass.
