# AR56 — connected shared-desktop assembly

Coordinator-owned `lane:integration` checkpoint on `codex/ar-56-connected-integration`. Execution: Cursor Cloud Grok 4.6 Extra High. Shared application PR is **GitHub PR 64** (draft, base `codex/ar-walkthrough-integration`). Do **not** open a second AR-56 PR. Root batches this branch into candidate/main. This page does **not** accept the full walkthrough journey, claim producer independent acceptance, or replace macOS/Cloud desktop evidence.

No competing AR56 PR. Do not push `codex/ar-walkthrough-integration`. Root alone merges candidate/main. PR 55 is a narrower AR-59 foundation checkpoint, not a second AR-56 PR.

## Frozen inputs (exact heads; no later tips)

| Input                                                             | SHA                                                                      |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| First published assembly                                          | `66f74f4f9700ae3f67f59558b23b4bbc0234fa42`                               |
| Candidate same-id guest + main 388 (merged here)                  | `38237efc9950c084623c9851e180b15c59a26f77`                               |
| AR47 independently reviewed (merged; not the old `7fd` tip alone) | `fe8bbefc1f9e80fce3d930315ecb1fa927a7effa`                               |
| AR49 Canvas/sidebar (already in 66f)                              | `55b7ec4e46f271e885672b8c6c923fbf9af67c02`                               |
| AR51 fetched (availability, **not** acceptance)                   | `f7f733f647954d6bd89858591306abf58c6a0b3d`                               |
| Companion available, isolated critic                              | `5fcb5cba43157d8743d598fc8c28352865c7c769` `codex/ar-55-companion-cloud` |

AR47 isolated coverage follow-up is separate; this branch does not edit its owned onboarding/profile feature tests. AR50 owns `tests/e2e/desktop.spec.ts` packaged Matrix Lab lifecycle and guest-related main blocks. AR48 owns existing backend `http.ts` / `runtime.ts`. Producer profile/paste bugs stay on AR47. Panel Ask↔Visual intent/cancel identity stays on AR51.

## Coverage policy

Restored **exact candidate `6d71d13e4f1015679932526583fe4fe73f4d653a` include/exclude**: `src/**/*.{ts,tsx}`; exclude only `*.d.ts`, `*.test.*`, `src/contracts/**`, `entrypoint.ts`, `migrate.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/main.tsx`. Thresholds remain **90%** on statements, branches, functions, and lines.

The 66f **89.11%** figure was against a **narrowed corpus** (producer internals excluded) and is **not comparable**. Root’s native correction is **29 patterns / 31 lines**. Do not re-introduce coverage exclusions for producer-owned files.

## Migration allocation

Journal and `LATEST_WORKSPACE_MIGRATION` are cumulative. `table_xinfo` is kept (generated columns are visible). Dual pre/post-0007 `entry_revision_context` allowlist removed.

| idx | tag                         | `when`            | owner |
| --- | --------------------------- | ----------------- | ----- |
| 5   | `0005_learning_onboarding`  | **1788937200000** | AR47  |
| 6   | `0006_contextual_retention` | **1788948000000** | AR51  |
| 7   | `0007_entry_origins`        | **1788951600000** | AR56  |

`LATEST_WORKSPACE_MIGRATION = 1_788_951_600_000`. Production new stores include origin columns. `applyReservedEntryOriginMigration()` remains a test-only helper for deliberately pre-0007 fixtures. `retained_explanations` expected columns include the four generated fields between `origin_json` and `useful_attempt_id`. Explanation tables stay on `ExplanationRecords` against the store-owned ORM. `explanation-test-harness.ts` uses `store.explanations` and must not re-run raw 0006.

## Shared Reader / Shell lease (this checkpoint)

No new architecture. These stay on the existing flush / Reader / context surfaces.

1. **Last-reading resume is inside the existing workspace flush barrier.** `persistReadingResume` is no longer fire-and-forget beside Home (`Shell` ~311) or outside Cmd+S / native close. Reader `registerFlush` still saves writing/import first; the Shell wrapper then awaits the live `readingLocation()` anchor. A thrown resume save uses the existing “Could not save your work…” copy, does **not** call `onHome`, and does **not** claim “Work saved.” A **fresh** selection survives chrome blur (Home/Save stealing the DOM selection); persist no longer falls back only to a restored reveal span.
2. **Exact generated-lesson citation navigation.** `SourcePane` lists retained generated citations with separate AI-generated attribution. `ReaderContext` Sources no longer opens `source.currentVersion`. Citation buttons resolve `sourceId` + `revisionId` + exact span on the retained original; a later current edition is not substituted. Missing cited revisions are an honest unavailable alert.
3. **Ask panel visibility.** The contextual slot is still after the source document. After Ask/Visual, Reader scrolls and focuses the `Contextual explanation response` region without remounting `ContextualHelpPanel`, so the human draft stays.

Not in this lease: AR47 `ensureLesson` stale-after-profile-revision and profile/paste; AR51 `selectionIdentity` including `selection.kind` (Ask↔Visual hides a saved retained result); clip request→render→retain; companion mount; durable Canvas explanations; W42.

`ensurePendingLesson` is an AR-56 Shell/App lease: completion is bound to mounted Shell, `requestId`/selection epoch, and project id. Stale results (Home, project B, ready lesson B while A is in flight) are rejected before `onWorkspace` / `openOrigin`. The generated origin is queued until the returned workspace is installed.

## Mounted seams

- **Database:** AR47 six onboarding tables + accessor `store.onboardingRecords()`; AR51 five explanation tables + `store.explanations`; AR56 origin columns on `entryRevisionContext`.
- **Contracts / preload / main:** ten onboarding channels, five resume channels (pure `contracts/learning-onboarding.ts`), eight contextual channels including `loadTrustedSceneCapture`. `window.desktop` is the exposed bridge. `activateSourceWorkspace` uses `planWorkspaceActivate`: true workspace change revokes in-flight onboarding, replaces Practical, and closes the guest; same-id returns existing contextual generation counters and does not kill guest. `DesktopInfo.testEnvironment` is the opt-in `desktop-e2e` seam.
- **App:** Opening gets the real onboarding bridge and `createDraftProject` in production. Transition only from `onAccepted(workspace, firstLesson)`. Unaccepted interview/proposal reopens via `resumeDraft`. Continue learning card from `getContinueLearning`. `APPLIED_RESEARCH_TEST_ENVIRONMENT=desktop-e2e` uses `createProject` for Start learning so desktop e2e can set up a fresh project without claiming a real user completed propose/accept.
- **Settings:** `LearnerProfile` after Appearance, separate from Account.
- **Shell / Reader:** first-lesson/resume payload; `restoreReading` + `readingLocation`; resume in the workspace/view flush barrier; generated citation retained-revision navigation; Ask region reveal/focus; `ensureLesson` on pending accepted lessons with `acquire-learning-evidence`, request/selection/project lifetime, queued open after the returned workspace is installed, and honest retry on rejection. Canvas: `records={bridge}`, `onWorkspace`, `registerBoundCanvasFlush`, `collapsed={isCanvas}`. Contextual: `useContextualSelection` + `ContextualHelpPanel` with activation counters, `active={destination === 'reader'}`. `SourceLearningEntry` is not mounted next to onboarding.
- **Retained media:** combined `registerSchemesAsPrivileged` (auth + `ar-media`) **before** `app.whenReady`. CSP `media-src 'self' ar-media:`. Protocol/CSP is not playback acceptance.

## Activate revoke (landed)

Candidate `38237efc` same-id guest guard is merged. True workspace **change** calls `onboardingOperations.revoke()` plus Practical replace and `closeTool`. Same-id activate preserves the embedded guest and returns existing contextual generation counters. Named `assertTrustedRendererEvent` frame guards stay. Do not treat Shell tests as main-authority proof of guest lifetime.

## Producer findings (handoff only)

1. **AR47** `src/main/learning-onboarding.ts` ~548–554 / `humanContext` ~632–639: `ensureLesson` returns stale when `interview.profileRevision !== profile.revision` — pending lessons fail after a learner-profile revision. Profile/paste bugs stay on AR47.
2. **AR51** `ContextualHelpPanel.tsx` `selectionIdentity` / `selectionMatches`: identity includes `selection.kind`; switching Ask/Visual hides a successfully saved retained result.
3. Clip request→render→retain→open is still unconnected (`requestClip(plan)` vs `retainReadyClip` for already-ready jobs). Named open must resolve ownership in main. Leave AR54 leases alone.
4. W42 course adjustment remains AR47/AR48. Pass AR51 planner patch to AR48: `POST /v1/learning/explanation-plans`.

## Validation

Node 24. Format/lint/types pass. Delivery 108/108 pass. Focused Shell/App/RetainedScene/contextual/validation/preload pass. Full corpus **194 files / 1976 tests** pass on a clean rerun (`PracticalSession` “selected context is unavailable” failed once under the first `npm run check` parallel run and passed isolation + the coverage rerun — AR50 flake, not masked). Build pass. `npm run check` still fails the **branch** gate only.

`vitest run --coverage` on the **restored full candidate corpus** (thresholds unchanged at 90%; include/exclude unchanged):

| Metric     | d5 `d5ca0a2`            | this head               | Gate | Candidate `38237efc` claim |
| ---------- | ----------------------- | ----------------------- | ---- | -------------------------- |
| Statements | 90.94%                  | 90.92% (13380/14715)    | 90%  | —                          |
| Branches   | **85.83%** (9467/11029) | **85.76%** (9507/11085) | 90%  | 90.29% on that corpus      |
| Functions  | 93.99%                  | 93.92% (3077/3276)      | 90%  | —                          |
| Lines      | 92.62%                  | 92.61% (12482/13477)    | 90%  | —                          |

d5’s **85.83%** is real and is not hidden. This head added covered branches (9467→9507) and more corpus branches (11029→11085), so the percentage is slightly lower. Candidate **90.29% / 1806 tests** is not comparable to this full producer-internal corpus. Thresholds were not lowered. No policy exclusions.

### Top 10 uncovered modules by LCOV branch miss count

| #   | Module                                              | Hit/Found | Miss | Owner / concrete gap                                                                                                           |
| --- | --------------------------------------------------- | --------- | ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `src/backend/explanations/plan-decode.ts`           | 7/118     | 111  | AR51 planner decode + AR48 unregistered `POST /v1/learning/explanation-plans`. Almost unexecuted in the desktop corpus.        |
| 2   | `src/main/explanation-records.ts`                   | 46/135    | 89   | AR51 retained SQLite read/write paths (grounding, origin decode, capture rows) beyond the harness happy path.                  |
| 3   | `src/main/contextual-help-operations.ts`            | 117/200   | 83   | AR51 tutor/planner/cancel/quota; AR56 owns only the signed-out `desktop-e2e` visual persist seam.                              |
| 4   | `src/main/contextual-help-learning.ts`              | 75/137    | 62   | AR51 remote plan/tutor response decode.                                                                                        |
| 5   | `src/renderer/explanations/ContextualHelpPanel.tsx` | 77/133    | 56   | AR51 Ask↔Visual `selectionIdentity` (including `selection.kind`); next panel producer is active — do not merge that head here. |
| 6   | `src/renderer/canvas/use-canvas-authoring.tsx`      | 111/147   | 36   | AR49 Canvas authoring edge states.                                                                                             |
| 7   | `src/backend/sourcing/composition.ts`               | 76/111    | 35   | AR48 OpenAlex/catalog composition.                                                                                             |
| 8   | `src/backend/explanations/service.ts`               | 11/46     | 35   | AR51/AR48 planner service; route still unregistered.                                                                           |
| 9   | `src/main/learning-onboarding.ts`                   | 196/229   | 33   | AR47 `ensureLesson` stale-after-`profileRevision`, profile/paste. Reviewed `fe8bbefc` is already merged.                       |
| 10  | `src/renderer/reader/Reader.tsx`                    | 138/166   | 28   | Shared Reader remaining branches (import/edit/restore). Resume/citation/reveal stay on this assembly.                          |

Also zero-hit: `src/backend/explanations/http.ts` 0/27 (AR48 unregistered HTTP), `src/renderer/ReaderExplanations.tsx` 0/4 (unmounted demo). AR56-owned remainders: `Shell.tsx` 159/182 (23), `App.tsx` 40/48 (8), `RetainedScene.tsx` 18/46 (28, capture/error UI). `validation.ts` 31/31.

`tests/e2e/explanations.spec.ts` drives the mounted contextual help / `RetainedScene` path. Production Opening still requires propose/accept. Automated desktop setup uses the explicit `desktop-e2e` test environment seam. Cloud may run these tests; it does not claim MP4 acceptance. Darwin GPU capture tests skip on this Linux VM. Isolated SceneCanvas tests stay.

Not run here (root-owned): hosted macOS CI, packaged smoke, live auth/provider, Sonar, desktop recording, connected Cloud acceptance. Do not self-PASS or mark Done.

## Unconnected producers (exact adapter requests)

### 1. Clip request → render → retain → open (AR51 + AR54 + AR48)

Do not assume this path exists. `ContextualHelpOperations.requestClip(plan)` receives only a validated plan, without request/project/attempt/cancellation, and defaults to honest unavailable. The available downloader is `makeRetainedMediaTransport(..., store).retainReadyClip(requestId, accountId, signal)` for an **already-ready** render job; it does not submit a plan. The player is `RetainedClipPlayer` with `RetainedClipMediaAccess.open(mediaId)` → opaque `ar-media://clip/<uuid>`. A named open adapter must resolve retained explanation/project ownership in **main** and return a projection, not caller paths or account IDs.

Needed isolated producer adapter:

1. Main-owned target/attempt identity and cancellation signal (not a mutable current-project global).
2. Real render **submission** operation (not only retain-ready).
3. Retained result identity after a successful job.
4. Correct AR53 clip result projection into the player.

Protocol/CSP wiring alone is not playback acceptance. Do not invent successful clip results or launch a provider/render job merely to test wiring.

### 2. Retained explanation → Canvas node (AR51 + AR49)

AR51 tables do not create a Canvas movable record. AR49 authoring enables notes/questions/branch/link/move, not explanation nodes. Root/AR51/AR49 must supply the exact retained-explanation-to-Canvas projection/placement seam. Do not disguise an AI artifact as a human note or create a second explanation identity/runtime.

### 3. AR48 planner / runtime registration

Pass [the supplied AR51 planner patch](design-handoff/ar51-integration-patches/ar48-planner-registration.patch.md) to AR48: `POST /v1/learning/explanation-plans` → `handleExplanationPlanRoute`; `makeExplanationPlannerProvider` / service reuse authenticated accounting and provider admission. Text Ask uses existing `/v1/learning/requests`; onboarding uses `/v1/learning/onboarding`. Missing real route/runtime is unavailable, never a UI fixture PASS.

### 4. W42 course adjustment

Reviewed course adjustment from later Practical/diagnostic evidence remains a separate AR47/AR48 contract/API requirement. Initial personalization and `ensureLesson` do not implement it.

## Ownership reminders

- AR47: isolated onboarding/profile feature-test coverage follow-up; profile/paste; `ensureLesson` stale-after-profile-revision.
- AR51: panel intent/cancel identity; clip submission.
- AR50: packaged Matrix Lab e2e and guest main blocks; activate guest-guard.
- AR48: backend `http.ts` / `runtime.ts` and planner registration.
- Root: candidate/main, PR 64 update (not a new PR), macOS CI, connected Cloud acceptance.
