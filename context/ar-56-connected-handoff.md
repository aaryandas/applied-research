# AR56 — connected shared-desktop assembly

Coordinator-owned `lane:integration` checkpoint on `codex/ar-56-connected-integration`. Execution: Cursor Cloud Grok 4.6 Extra High. Root batches this branch into main-target **PR 55**. This page does **not** accept the full walkthrough journey, claim producer independent acceptance, or replace macOS/Cloud desktop evidence.

No competing AR56 PR. Do not push `codex/ar-walkthrough-integration`. Root alone merges candidate/main.

## Frozen inputs (exact heads; no later tips)

| Input                                                                                                                                                          | SHA                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Published candidate                                                                                                                                            | `58c11f0d38f84fc842b7be2cc230a0489ddcdc31`                                                            |
| AR49 Canvas/sidebar (independent Standards/Spec PASS in critic `bc-b5405cc3` run `18e75f93`; GitHub PR48 comment `5601043529`; Linear AR49 comment `8db8d099`) | `55b7ec4e46f271e885672b8c6c923fbf9af67c02`                                                            |
| AR47 docs follow-up / implementation                                                                                                                           | `7fd21149bb8ab47bfecaeccfba09b4dcefdab00b` / `d4b7710f617bbd554d96fffd3d6dd4aeed744c89`               |
| AR51 fetched head / implementation                                                                                                                             | `f7f733f647954d6bd89858591306abf58c6a0b3d` / `cd3f5bb` — availability, **not** independent acceptance |
| Prior AR56 checkpoint (docs / code)                                                                                                                            | `5903b52428314cd191671ad96fc602fd4b175ef8` / `1918f1c9f1464288a8ac7dad568f8a898e8fc415`               |

Merge commits on this branch: candidate `8d9f7f2`, AR49 `c25f7cc`, AR47 `c16e644`, AR51 `681df72`.

AR51 `f7f` and AR48 `a3f` remain in independent review. Root relays actual findings. AR47 isolated coverage follow-up is separate; this branch does not edit its owned onboarding/profile feature tests. AR50 owns `tests/e2e/desktop.spec.ts` packaged Matrix Lab lifecycle and guest-related main blocks. AR48 owns existing backend `http.ts` / `runtime.ts`.

## Migration allocation

Journal and `LATEST_WORKSPACE_MIGRATION` are cumulative. `table_xinfo` is kept (generated columns are visible). Dual pre/post-0007 `entry_revision_context` allowlist removed.

| idx | tag                         | `when`            | owner |
| --- | --------------------------- | ----------------- | ----- |
| 5   | `0005_learning_onboarding`  | **1788937200000** | AR47  |
| 6   | `0006_contextual_retention` | **1788948000000** | AR51  |
| 7   | `0007_entry_origins`        | **1788951600000** | AR56  |

`LATEST_WORKSPACE_MIGRATION = 1_788_951_600_000`. Production new stores include origin columns. `applyReservedEntryOriginMigration()` remains a test-only helper for deliberately pre-0007 fixtures. `retained_explanations` expected columns include the four generated fields between `origin_json` and `useful_attempt_id` (`source_revision_id`, `highlight_id`, `entry_id`, `entry_revision`). Explanation tables stay on `ExplanationRecords` against the store-owned ORM; they are not merged into `workspaceSchema`. Onboarding schema is re-exported from `workspace-schema.ts` for discoverability only. `explanation-test-harness.ts` uses `store.explanations` and must not re-run raw 0006.

## Mounted seams

- **Database:** AR47 six onboarding tables + accessor `store.onboardingRecords()`; AR51 five explanation tables + `store.explanations`; AR56 origin columns on `entryRevisionContext`.
- **Contracts / preload / main:** ten onboarding channels, five resume channels (pure `contracts/learning-onboarding.ts`, not main/runtime into preload), eight contextual channels including `loadTrustedSceneCapture`. `window.desktop` is the exposed bridge. `activateSourceWorkspace` returns `{projectGeneration, requestGeneration}` from `ContextualHelpOperations.activate` after Practical replace, tool close, and source activate. Named `handle()` + window-closed removal. `revokeWorkspaceOperations` revokes source + onboarding + contextual + Practical replace + tool close; sign-out, render-process-gone, navigation, and window-close reach it. Frame guard: `assertTrustedRendererEvent`.
- **App:** Opening gets the real onboarding bridge and `createDraftProject` (create/list, no empty Reader). Transition only from `onAccepted(workspace, firstLesson)`. Unaccepted interview/proposal reopens via `resumeDraft`. Continue learning card from `getContinueLearning`; all projects stay under All saved work. Legacy tests without `proposeCourse` still use `onCreate`.
- **Settings:** `LearnerProfile` after Appearance, separate from Account.
- **Shell / Reader:** first-lesson/resume payload; `restoreReading` + `readingLocation`; span survives chrome clicks via reveal fallback; `ensureLesson` on pending accepted lessons with `acquire-learning-evidence`; pending remains on real failure. Canvas: `records={bridge}`, `onWorkspace`, `registerBoundCanvasFlush`, `collapsed={isCanvas}`; no redundant Return to reading. Contextual: `useContextualSelection` + `ContextualHelpPanel` with activation counters, `active={destination === 'reader'}`. Find originless/sourced/pending unchanged. Source-led Research remains; `SourceLearningEntry` is not mounted next to onboarding.
- **Retained media:** combined `registerSchemesAsPrivileged` (auth + `ar-media`) **before** `app.whenReady`; `RetainedMediaStore` + `installRetainedMediaProtocol` after userData. CSP `media-src 'self' ar-media:` in production and development. Protocol/CSP is not playback acceptance.

## Validation (this assembly, Node 24.20.0)

Focused unit/renderer/integration for owned paths: pass. `tsc` node/web/backend: pass. ESLint on owned files: pass. Production `electron-vite` + backend build: pass.

Combined coverage (`vitest run --coverage`) with **unchanged 90% thresholds**:

| Metric     | Actual                 | Gate |
| ---------- | ---------------------- | ---- |
| Statements | 93.29%                 | 90%  |
| Branches   | **89.11%** (7451/8361) | 90%  |
| Functions  | 95.03%                 | 90%  |
| Lines      | 94.74%                 | 90%  |

`npm run check` still fails the branch gate (~74 additional covered branches on this denominator). Candidate `58c11f0` previously recorded 88.82% branches / 104 short. Thresholds were not lowered. Coverage include excludes producer-owned internals whose isolated follow-up is AR47/AR48/AR51 (onboarding runtime/UI, explanation operations/records/panel, unmounted backend explanations and render-delivery, AR49 authoring internals, unmounted `ReaderExplanations`). Shared mounts, store/journal, contracts, App/Shell/Reader, and protocol stay in the corpus.

Shared tests added/updated: production new DB + 0004→0007 upgrade/reopen; exact retained parent revision; explanation harness reopen without duplicate 0006; named bridge mapping and frame guard; activation A→B→A and sign-in counters; accepted first lesson without `ensureLesson`; on-demand later lesson and unavailable pending; exact source/span resume including Home flush; Canvas live save and Reading return; Find empty/topic; contextual selection → retained quote → return; Continue learning + unaccepted draft reopen; Learner profile in Settings.

Not run here (root-owned): hosted macOS CI, packaged smoke, live auth/provider, Sonar, desktop recording, connected Cloud acceptance. Do not self-PASS or mark Done.

**Root must retarget** `tests/e2e/explanations.spec.ts`: it still expects the unmounted production `Interactive explanations` / two-link-arm demo. This branch does not skip or weaken that file.

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

Pass [the supplied AR51 planner patch](design-handoff/ar51-integration-patches/ar48-planner-registration.patch.md) to AR48: `POST /v1/learning/explanation-plans` → `handleExplanationPlanRoute`; `makeExplanationPlannerProvider` / service reuse authenticated accounting and provider admission. Text Ask uses existing `/v1/learning/requests`; onboarding uses `/v1/learning/onboarding`. Missing real route/runtime is unavailable, never a UI fixture PASS. Optional operation-union, desktop canonicalizer alias, and NodeNext decoder notes remain producer coordination.

### 4. W42 course adjustment

Reviewed course adjustment from later Practical/diagnostic evidence remains a separate AR47/AR48 contract/API requirement. Initial personalization and `ensureLesson` do not implement it.

## Ownership reminders

- AR47: isolated onboarding/profile feature-test coverage follow-up.
- AR50: packaged Matrix Lab e2e and guest main blocks.
- AR48: backend `http.ts` / `runtime.ts` and planner registration.
- Root: candidate/main, PR55, macOS CI, connected Cloud acceptance.
