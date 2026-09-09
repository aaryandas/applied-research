# AR56 — first shared application CI checkpoint

Coordinator-owned `lane:integration` checkpoint. Execution: Cursor Cloud Grok 4.6 Extra High. This page owns the frozen App/Reader lifecycle CI repair only. It does not accept the rest of AR56 product work.

## Frozen revisions

| Role             | SHA                                        | Notes                                                         |
| ---------------- | ------------------------------------------ | ------------------------------------------------------------- |
| Integration base | `8d0a8154ade3ede7302f6595789aea1e31663707` | `codex/ar-walkthrough-integration` at dispatch                |
| This checkpoint  | `b53fafd78fb2f1bd9f25c55aec799857be7be8f0` | Observed `npm run check` at this SHA; lifecycle fix `dca9dc7` |
| PR base          | `codex/ar-walkthrough-integration`         | Draft only; no merge to `main`, no deployment                 |

Root independently reviews this SHA, then propagates the shared lifecycle fix into producer branches. Do not treat this page as permission to integrate unreviewed AR47–AR55 patches.

## What this checkpoint proves

September 9 founder rule: switch Reader ↔ Canvas ↔ Practical ↔ Settings **in the same project** while the incomplete Reader draft and active Practical attempt stay mounted. Only Home, project replacement, and native close use the strict registered workspace flush. Pending permissive view work must still escalate to that separate strict check on close (`useWorkspaceFlush` already does).

Observable App tests (not copy or internals):

1. `keeps incomplete Reader drafts mounted when navigation or quit cannot save` — title-only Reader composer survives Canvas and Practical; exact title bytes restore on Reading; Home and `beforeunload` stay blocked until discard + Cmd/Ctrl+S; `"Your work is still open"` is not required.
2. `opens real lesson content and blocks replacement of an unsaved practical attempt` — real lesson text opens; exact Expected outcome bytes survive Reading, Canvas, and Settings; Home cannot replace the mounted attempt; `saveEntry` is not used as a substitute persist.

Shell `go()` no longer runs the combined view barrier for same-project destinations. It still calls `flushViewNavigation()` so a typed, saveable Reader draft commits (existing Canvas question-sharing test). Incomplete empty-body drafts remain mounted because the project-keyed Reader is not unmounted. Leaving Canvas still invokes the Canvas save callback because that surface unmounts. Lesson selection, Find origin open, and research still use view-scoped `navigate`, which continues to drain Practical — that is the unsaved-attempt replacement guard when a new lesson would clear `attempt`.

## Files in this lease

- `src/renderer/App.test.tsx`
- `src/renderer/Shell.tsx` (narrow lifecycle only; no AR49 Canvas mount, no AR52/AR53 consumers)
- `context/ar-56-ci-handoff.md`, `context/code-map.md`, `context/README.md`

`App.tsx` did not need changes. Reader `flushViewNavigation` / `registerFlush` contracts are unchanged. Do not apply AR49 `36d7f340`. Do not consume AR52/AR53 contracts. Do not alter source tests, skip/only tests, coverage gates, or production migrations.

## Checks on this checkpoint

Observed on Node 24 at `b53fafd78fb2f1bd9f25c55aec799857be7be8f0`. GitHub PR create returned 403 from this cloud token; root opens the draft PR from `codex/ar-56-integration-ci`.

**This family green (separately proved):**

- `npx vitest run --project renderer src/renderer/App.test.tsx src/renderer/reader/Reader.walkthrough.test.tsx src/renderer/shell/Shell.integration.test.tsx src/renderer/useWorkspaceFlush.test.tsx` — 4 files, 29 passed, including both rewritten App lifecycle tests and `shares saved Reader questions with both Canvas modes and restores the outline`.
- Repeat App + Reader.walkthrough after the `goRef` effect: 17 passed.
- `npm run format:check`, `npm run lint`, `npm run typecheck` — passed.
- Coverage run included `src/renderer/App.test.tsx` 12 passed (both lifecycle tests named above).

**`npm run check` is not green.** format/lint/types passed; `npm run test:coverage` stopped with 47 failed / 1292 passed / 111 files (2 failed). Build did not run. Do not treat full check as success.

AR50 family — `src/main/practical-records.test.ts`, **40 failed**, all `SqliteError: table practical_attempts already exists` while `setup` execs `context/practical-work-migration.sql` after `WorkspaceStore` already applies that table:

- `refuses unsupported evidence and rolls back its provisional attempt %#` (11 cases)
- `retains supported inert {displayName} evidence with its declared format` (5 cases: notes.txt, trial.json, image.PNG, image.jpg, output.pdf)
- `bounds imported file count and total bytes without losing already retained evidence`
- `fails safely on unavailable storage and malformed read/commit requests`
- `settles a stalled dialog at the fixed limit and accepts native cancellation without a save`
- `acknowledges exact human work only after durability and reopens the activity result offline`
- `replays an ambiguous save without duplication and rejects stale different writing`
- `refuses a forged activity %s without saving any work` (9 cases: title, instructions, objective, path, topic, lesson, revision, source, highlight)
- `compares semantic input independently of object property order`
- `rejects a renderer-supplied evidence reference that no trusted producer owns`
- `imports selected bytes once, preserves them on reopen, and binds evidence to its attempt`
- `returns only opaque metadata after a real selected file has been copied into local records`
- `settles cancelled selection promptly and never imports a late native dialog result`
- `releases a failed native dialog slot so the learner can retry`
- `the migration prevents another SQL writer from orphaning saved origins or current revisions`
- `reopens the attempt most recently used to return a file`
- `retains a real lesson/source/highlight origin while keeping reported results separately attributed`
- `fails closed when retained file bytes no longer match their stored hash`

AR48 family — `src/backend/source-routes.test.ts`, **7 failed**, describe `authenticated source route boundaries`:

- `requires a real session at '/v1/sources/discover' even when no source producer is configured`
- `requires a real session at '/v1/sources/acquire' even when no source producer is configured`
- `requires a real session at '/v1/learning/sourced' even when no source producer is configured`
- `rejects caller-supplied account ownership at '/v1/sources/discover' before dispatch`
- `rejects caller-supplied account ownership at '/v1/sources/acquire' before dispatch`
- `rejects caller-supplied account ownership at '/v1/learning/sourced' before dispatch`
- `rejects caller-supplied evidence authority at the sourced-learning endpoint`

Not run here: macOS Electron/packaged CI, Cloud desktop recordings, hosted-main Sonar. Deterministic lifecycle tests are the evidence for this checkpoint.

Known parallel families **not** owned here:

- AR50: Practical tests executing `context/practical-work-migration.sql` after `WorkspaceStore` already applies `practical_attempts`.
- AR48: expected-red source routes and source budget defects (PR 47 already has real routes, under repair). Never change source tests to 404, skip/only, or weaken CI to hide a fixture problem.
- AR49 Canvas implementation `36d7f340` failed independent review (late `onWorkspace` after unmount; toolbar insight selects first two records without selection). Do not apply that Shell mount.
- AR52/AR53 shared contracts still need re-review before consumers. Do not fake onboarding or generated courses.

## Remaining AR56 work after review

Search/Find exact reveal, chrome cleanup, producer mounts, entry-origin persistence, artifact/companion composition, resume joins, and W42 adaptation stay queued. See [journey integration handoff](journey-integration-handoff.md) and [current delivery](current-delivery.md).
