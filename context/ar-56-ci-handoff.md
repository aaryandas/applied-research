# AR56 — first shared application CI checkpoint

Coordinator-owned `lane:integration` checkpoint. Execution: Cursor Cloud Grok 4.6 Extra High. This page owns the frozen App/Reader lifecycle CI repair only. It does not accept the rest of AR56 product work.

## Frozen revisions

| Role             | SHA                                                         | Notes                                                         |
| ---------------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| Integration base | `8d0a8154ade3ede7302f6595789aea1e31663707`                  | `codex/ar-walkthrough-integration` at dispatch                |
| This checkpoint  | `dca9dc7` plus this handoff on `codex/ar-56-integration-ci` | Lifecycle fix `dca9dc7`; PR head after this page is published |
| PR base          | `codex/ar-walkthrough-integration`                          | Draft only; no merge to `main`, no deployment                 |

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

Run on Node 24 with the committed lockfile. Record exact commands and outcomes on the PR.

- Focused green: `src/renderer/App.test.tsx`, `Reader.walkthrough.test.tsx`, `Shell.integration.test.tsx`, `useWorkspaceFlush.test.tsx`.
- Prescribed: `npm run format:check`, `npm run lint`, `npm run typecheck`, then `npm run check`.
- This family must be reported green separately. Remaining `npm run check` failures belong to other leased workers; list them by exact test name and count. Do not wait on macOS Electron/packaged CI, Cloud desktop recordings, or hosted-main Sonar, and do not claim those succeeded from this machine.

Known parallel families **not** owned here:

- AR50: Practical tests executing `context/practical-work-migration.sql` after `WorkspaceStore` already applies `practical_attempts`.
- AR48: expected-red source routes and source budget defects (PR 47 already has real routes, under repair). Never change source tests to 404, skip/only, or weaken CI to hide a fixture problem.
- AR49 Canvas implementation `36d7f340` failed independent review (late `onWorkspace` after unmount; toolbar insight selects first two records without selection). Do not apply that Shell mount.
- AR52/AR53 shared contracts still need re-review before consumers. Do not fake onboarding or generated courses.

## Remaining AR56 work after review

Search/Find exact reveal, chrome cleanup, producer mounts, entry-origin persistence, artifact/companion composition, resume joins, and W42 adaptation stay queued. See [journey integration handoff](journey-integration-handoff.md) and [current delivery](current-delivery.md).
