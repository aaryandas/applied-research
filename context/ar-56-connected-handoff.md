# AR56 — connected shared-desktop assembly

Coordinator-owned `lane:integration` checkpoint on `codex/ar-56-connected-integration`. Execution: Cursor Cloud Grok 4.6 Extra High. Shared application PR is **GitHub PR 64** (draft, base `codex/ar-walkthrough-integration`, title `Linear: AR-56`). Do **not** open a second AR-56 PR. Root batches this branch into candidate/main. This page does **not** accept the full walkthrough journey, claim producer independent acceptance, or replace macOS/Cloud desktop evidence.

Stay **In Development** until root independently reviews the assembled journey, macOS CI, and Cloud recording.

No competing AR56 PR. Do not push `codex/ar-walkthrough-integration`. Root alone merges candidate/main. PR 55 is a narrower AR-59 foundation checkpoint, not a second AR-56 PR. Never `598bece69` skips. Do not skip PR 69 (root closed that automation). Practical real fix is PR 70 (`82c2d68`), now an ancestor via origin/main.

## Frozen inputs (exact heads; no later tips)

| Input                                | SHA                                                                                                 | Status                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| This assembly head                   | `3d0c2fb682a2588bd4f16069cc7dfb313dee31e6`                                                          | Measured format/lint/types/delivery/2250 tests/build on this SHA. Follow-up docs commits do not rerun that packet. Resume was `c4b65392f538690f5416b2492e7af58a8f8b3ad2`.                                                                                                                                                          |
| origin/main at merge                 | `cf2086c60fd4657e0a8a2503c22876e1fe9adfb7`                                                          | Includes f158 (`f15880480ef428b5f7016173c4f8dcbcb23f3c61`) + Practical `82c2d68ca07e3a6345b0a355e2a162f6adfd216e` (PR 70). Primary CI passed on main; hosted Sonar remains a separate main-only prerequisite.                                                                                                                      |
| AR47 independently PASS              | review `9c325f590494c4f86dd5ef6ae1d68473a33cf100` / code `a70cc0d76f16431a436509858ef1af1abe74c04b` | Live intended profile vs retained history; required `human.pastedSeedText: string \| null`; exact Back reopen. Do **not** consume W42 / adaptive follow-up head.                                                                                                                                                                   |
| AR51 independently PASS              | `cef3311b947b96e46d074db4dd9f21a2dce8eef0`                                                          | Journal `0008` after `0005/6/7`; Canvas same explanation ID, AI attribution, no hidden active runtime. Maintain 9b exact citations / late clip authority. Root owns contract combination.                                                                                                                                          |
| AR48 **FROZEN, critic still active** | `329a34376424ec0d8d2a7c9fba9642f1f2808394`                                                          | Dev assembly only. **Do not claim critic PASS.** Registered planner/companion HTTP, typed $2/10 accounting, paste/profile join, account-scoped admitted-source lookup. Producer 13/13 real PG receipt is AR48 evidence, not this assembler’s. No backend production edits beyond this SHA. Root AR48 owns next media-receipt join. |
| AR55 bounded producer PASS           | `947bd5637a1a6a0ca54f0fecdb0882e673750d17`                                                          | Named Guidance mounted with auth/project/revoke. Do **not** invent lookups or consume AR55-next.                                                                                                                                                                                                                                   |

AR47 isolated coverage follow-up is separate. AR50 owns packaged Matrix Lab lifecycle and guest-related main blocks. Source/math/UI polish remain later lease.

## Coverage policy

Restored **exact candidate include/exclude**: `src/**/*.{ts,tsx}`; exclude only `*.d.ts`, `*.test.*`, `src/contracts/**`, `entrypoint.ts`, `migrate.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/main.tsx`. Thresholds remain **90%** on statements, branches, functions, and lines. Do not re-introduce coverage exclusions for producer-owned files. Do not write coverage padding.

## Migration allocation

Journal and `LATEST_WORKSPACE_MIGRATION` are cumulative. `table_xinfo` is kept (generated columns are visible).

| idx | tag                                  | `when`            | owner                        |
| --- | ------------------------------------ | ----------------- | ---------------------------- |
| 5   | `0005_learning_onboarding`           | **1788937200000** | AR47                         |
| 6   | `0006_contextual_retention`          | **1788948000000** | AR51                         |
| 7   | `0007_entry_origins`                 | **1788951600000** | AR56                         |
| 8   | `0008_explanation_canvas_placements` | **1788955200000** | AR51 producer / AR56 journal |

`LATEST_WORKSPACE_MIGRATION = 1_788_955_200_000`. `EXPECTED_TABLE_COLUMNS.explanation_canvas_placements` is present. Explanation tables stay on `ExplanationRecords` against the store-owned ORM.

## CORE findings closed on this assembly (Linear comment `3b7ba977`)

1. **Reader lease.** `nextReaderLease` invalidates Home / project / sidebar `selectLesson` **and** `openOrigin` / `revealEntry` / `editEntry` / `openSavedResearch`. Queued generated origin rechecks the current lease before `openOrigin`. Rejected `ensureLesson` Promise uses `guardedEnsureLessonFailure` (honest failure, not only resolved-unavailable). Tests in `src/renderer/shell/Shell.connected.test.tsx`.
2. **RetainedScene capture binding.** Capture generation is bound to `capture.explanationId` plus the current attempt; delayed A is a no-op after B. Invalidation on change/unmount. Tests in `RetainedScene.test.tsx`. No forged model measurements.
3. **desktop-e2e isolation.** `admitDesktopTestEnvironment({ isPackaged, envValue })` is null when packaged. Preload reads argv, not env. Production packaged builds cannot enable the fixture by renderer/environment alone. `.github/workflows/verify.yml` was **not** edited. If a future packaged test-build must carry desktop-e2e, prepare an exact AR-41 patch only: production `build` → package → `test:packaged`, **then** `build:desktop-e2e` → unpackaged `test:e2e`. Do not package after the test-build. No auth/provider calls in CI; no synthetic journey as actual acceptance.

## Mounted seams (this checkpoint)

- **AR47:** Opening draft persist/exact reopen; selected-lesson sends live intended profile without rewriting stored history; `human.pastedSeedText`.
- **AR51 Canvas:** `projectRetainedExplanationToCanvas`; overlay nodes use the same `explanationId`, `authorKind: 'assistant'`, `activeRuntime: false`. Shell keys overlay lists by `projectId`; a delayed previous-project list cannot steal Canvas; a rejected list stays empty.
- **AR48 backend (dev assembly):** registered `POST /v1/learning/onboarding`, `/v1/learning/explanation-plans`, `/v1/learning/companion`. PSF Python default grant (BCcampus is not a default acquisition grant). Critic review still active.
- **AR55 Guidance:** named `learning:request-companion-guidance` / `learning:cancel-companion-guidance`. Host created off the render path; `activate` reads live source-workspace generations. Sign-out / project-replaced / attempt-replaced / tool-closed / teardown revoke. `SHARED_DESKTOP_OPERATION_CHANNELS` length **28**. PracticalSessionOwner still creates a local unavailable requester when named channels are absent (Ask copy can appear; that is not a paid call).
- **Explicit unavailable (AR55-next / later):** imported-file truncated preview mapping (`readImportedFile` always null); measured-capture lookup omitted; bound tool session null; reveal-registry checked in, not wired (shared wrapper patch will follow); real clip backend grant / remote host pending. Existing `RetainedClipPlayer` / `openClip` / `RetainedMediaStore` stay without fake bytes.
- **Practical 82c2d68:** `onRequestGuidance` gated on a live requester; resolver bind in layout. Ancestor of this head.

## Validation

Node **24.20.0**. Format, lint, types, delivery **108/108**, unit/renderer/integration **232 files / 2250 tests**, and `npm run build` pass on `3d0c2fb682a2588bd4f16069cc7dfb313dee31e6`. `npm run check` still fails the **branch** gate only. Thresholds were not lowered. No policy exclusions. No paid calls, deploy, Sonar, or fixture-as-acceptance.

`vitest run --coverage` on the restored full candidate corpus:

| Metric     | this head                | Gate |
| ---------- | ------------------------ | ---- |
| Statements | 92.25% (15702/17021)     | 90%  |
| Branches   | **87.51%** (11337/12955) | 90%  |
| Functions  | 94.67% (3501/3698)       | 90%  |
| Lines      | 93.90% (14643/15593)     | 90%  |

Need **323** additional branch hits to meet 90% (`ceil(0.90 * 12955) = 11660`). Producer internals after AR48 registration moved planner HTTP/decode off the old zero-hit list (`plan-decode.ts` is now 109/118). Do not pad.

### Top 10 uncovered modules by LCOV branch miss count

| #   | Module                                              | Hit/Found | Miss | Owner / concrete gap                                                                                    |
| --- | --------------------------------------------------- | --------- | ---- | ------------------------------------------------------------------------------------------------------- |
| 1   | `src/main/explanation-records.ts`                   | 57/150    | 93   | AR51 retained SQLite read/write (grounding, origin decode, capture rows) beyond the harness happy path. |
| 2   | `src/main/contextual-help-operations.ts`            | 149/232   | 83   | AR51 tutor/planner/cancel/quota; AR56 owns only the signed-out `desktop-e2e` visual persist seam.       |
| 3   | `src/main/contextual-help-learning.ts`              | 75/137    | 62   | AR51 remote plan/tutor response decode.                                                                 |
| 4   | `src/backend/onboarding/service.ts`                 | 125/176   | 51   | AR47/AR48 onboarding worker edges.                                                                      |
| 5   | `src/renderer/Shell.tsx`                            | 189/233   | 44   | AR56 remaining Guidance-host / flush / navigation branches after overlay ownership tests.               |
| 6   | `src/backend/sourcing/composition.ts`               | 96/137    | 41   | AR48 OpenAlex/catalog composition.                                                                      |
| 7   | `src/renderer/explanations/ContextualHelpPanel.tsx` | 125/165   | 40   | AR51 Ask↔Visual `selectionIdentity`; next panel producer is active — do not merge that head here.       |
| 8   | `src/renderer/canvas/use-canvas-authoring.tsx`      | 111/147   | 36   | AR49 Canvas authoring edge states.                                                                      |
| 9   | `src/main/guidance-context.ts`                      | 189/223   | 34   | AR55 Guidance context decode; AR55-next owns remaining lookups.                                         |
| 10  | `src/main/learning-onboarding.ts`                   | 212/245   | 33   | AR47 `ensureLesson` / profile remainder after `a70cc0`.                                                 |

Also: `src/renderer/ReaderExplanations.tsx` 0/4 (unmounted demo). `src/backend/explanations/http.ts` 29/30 and `plan-decode.ts` 109/118 after AR48 registration. AR56-owned remainders: `App.tsx` 40/48 (8), `RetainedScene.tsx` 33/57 (24). `desktop-test-environment.ts` 4/4.

Not run here (root-owned): hosted macOS CI, packaged smoke, live auth/provider, Sonar, desktop recording, connected Cloud acceptance. Do not self-PASS or mark Done.

## Missing UI / backend hooks (honest)

- AR55-next: private-reader attempt, truncated file preview mapping, measured-capture lookup, bound tool session, reveal-registry wrapper.
- Real clip backend grant / remote host; `requestClip` stays honest unavailable.
- AR48 critic approval; next media-receipt join.
- W42 course adjustment (AR47/AR48 later head — do not consume).
- Source/math/UI polish.
- Branch coverage to 90% is producer-internal remainder, not an AR56 padding task.

## Ownership reminders

- AR47: W42 / adaptive follow-up; isolated onboarding coverage follow-up.
- AR51: panel intent/cancel identity; clip submission; 9b citations / late clip authority.
- AR50: packaged Matrix Lab e2e and guest main blocks.
- AR48: backend `http.ts` / `runtime.ts` critic review; next media-receipt join.
- AR55-next: session citations / measured capture ↔ Practical join; shared wrapper patch.
- Root: candidate/main, PR 64 update (not a new PR), macOS CI, connected Cloud acceptance.
