# AR56 — connected integration checkpoint (entry origin + Find)

Coordinator-owned `lane:integration` checkpoint on `codex/ar-56-connected-integration`. Execution: Cursor Cloud Grok 4.6 Extra High. Root batches this branch into main-target PR 55. This page does **not** accept the full walkthrough journey.

Frozen candidate `6eef07aca471409f60c8e11eb5e1d856be2b6da1` was the start of this branch. Do **not** push `codex/ar-walkthrough-integration`. No competing AR56 PR.

## What this checkpoint implements

1. **Durable `LearningOrigin.entry`** in the existing SQLite authority: optional exact `entryId`+`revision` persist/readback, main validation, same-project existence and origin-cycle rejection. Originless / source / highlight / path behavior, human bytes and immutable revision history are unchanged. Entry origin is not source authority or insight support.
2. **Exact Find navigation** to the retained lesson / title / source / human record, including originless notes. Results carry stable record/revision identity. Selecting a result opens that object; a sourced note reveals the note, not only its source. Cmd/Ctrl+K still opens Find. Home/native-close remain the strict flush; same-project Reader/Practical navigation stays permissive with exact drafts.
3. **AR49 Canvas mount is prepared, not applied.** Independent critic PASS for repair SHA `55b7ec4e46f271e885672b8c6c923fbf9af67c02` was not present. PR 48 still only has the FAIL of frozen `36d7f340aceb02b8990875df3dbd797f3d68bb91`. Linear implementer notes 78 canvas/sidebar tests on `55b7ec4`. Cloud agent `bc-b5405cc3` is an AR41/PR44 reviewer, not an AR49 PASS receipt. Exact Shell patch below.

## Changed scope (this branch)

- Reserved `drizzle/0007_entry_origins.sql` (not journaled)
- `src/main/entry-origin-persistence.ts`
- Writer/reader/validation/store/schema-verification wiring: `learning-entry-writer.ts`, `learning-record-reader.ts`, `learning-record-validation.ts`, `workspace-store.ts`, `workspace-migration.ts`
- Find: `src/renderer/shell/record-navigation.ts`, `shell-records.ts`, `Shell.tsx`, Reader `revealEntry` / `ReaderContext` / `EntryOrigin`
- Focused tests listed below
- This handoff plus `context/README.md`, `code-map.md`, `contextual-help-contracts.md`

Not edited: AR47 Opening/onboarding/`0005`, AR51 contextual/`0006`, AR50 Practical source/tests, AR58 new backend boundary tests, AR48 backend runtime/http/providers, AR54 clip/media/render-worker, AR55 companion, AR49 Canvas implementation.

Practical live origin still rejects `entry` (`practical-validation.ts`). That remains AR50.

## Migration / journal patch (root serializes)

`drizzle/0007_entry_origins.sql` is reserved and **not** in `_journal.json`. `LATEST_WORKSPACE_MIGRATION` remains `1788930000000` (`0004_practical_journey`). AR47 owns `0005_learning_onboarding`; AR51 owns `0006_contextual_retention`.

Tests call `WorkspaceStore.applyReservedEntryOriginMigration()` on a disposable already-migrated store. The helper is not IPC. Production DBs without 0007 still refuse `origin.entry` at the writer (`origin.entry is not persisted yet`). Validation accepts the additive shape so live saves can persist once columns exist.

Schema validation allows `entry_revision_context` either as the 0004 column set **or** that set plus trailing `origin_entry_id`, `origin_entry_revision` so a test DB can reopen after reserved 0007. Do not treat that dual allowlist as a general extra-column weakening.

When 0005 and 0006 are journaled, append **only** this journal entry (assign `when` monotonically after 0006; do not invent 0005/0006 timestamps here):

```json
{
  "idx": 7,
  "version": "6",
  "when": "<coordinator: after 0006.when>",
  "tag": "0007_entry_origins",
  "breakpoints": true
}
```

Then, in the same root serialization:

- Set `LATEST_WORKSPACE_MIGRATION` to that `when`.
- Require the extra columns (remove the dual 0004 / 0004+origin allowlist in `assertColumns`).
- Add to `src/main/workspace-schema.ts` `entryRevisionContext`:

```ts
originEntryId: text('origin_entry_id'),
originEntryRevision: integer('origin_entry_revision'),
```

- `EXPECTED_TABLE_COLUMNS.entry_revision_context` gains `origin_entry_id`, `origin_entry_revision` at the end.
- Drizzle INSERT can then include those columns; the post-insert raw UPDATE in `persistEntryOrigin` can stay or be folded once the mapping is authoritative.

Do not register 0007 ahead of pending 0005/0006. Do not duplicate an already-registered migration.

## AR49 prepared Shell patch (do not claim mount)

Checked 2026-09-09: GitHub PR 48 head `55b7ec4e46f271e885672b8c6c923fbf9af67c02`, draft, mergeable dirty, one issue comment — independent **FAIL** of `36d7f340`. No GitHub review and no PASS comment. Do not merge the owner branch or apply this patch until an independent Cloud critic PASS names `55b7ec4` (or a later released SHA).

Current candidate `WorkspaceCanvasProps` still lacks `records` / `onWorkspace`. This candidate uses `registerBoundCanvasFlush`, not `registerCanvasFlush`. Apply only after independent PASS **and** after merging the owner branch so those props exist. Also retarget `src/renderer/App.test.tsx` from “Return to reading” to the Reading sidebar control.

Prepared against this candidate’s `src/renderer/Shell.tsx`:

```diff
--- a/src/renderer/Shell.tsx
+++ b/src/renderer/Shell.tsx
@@ -459,7 +459,6 @@
                 </button>
               ))}
             </div>
-            <button onClick={() => go('reader')}>Return to reading</button>
           </header>
         )}
         {message && (
@@ -494,6 +493,8 @@
             onMove={moveRecord}
             registerFlush={registerBoundCanvasFlush}
             onShellControls={setCanvasControls}
+            records={bridge}
+            onWorkspace={onWorkspace}
           />
         )}
         {attempt && (
```

Preserve owner Canvas code; merge its branch only after release.

## Tests

Public storage and navigation behavior, not helper internals:

- `tests/integration/learning-records.test.ts` — refuse until reserved 0007; persist exact parent revision; no-op identical parent; parent-only new revision; later parent body change keeps the stored parent revision; sourced+entry origin; self/missing/missing-revision/foreign/cycle; legacy `saveEntry` copies origin; reopen `new WorkspaceStore(path)`; reserved apply is idempotent
- `src/main/learning-record-validation.test.ts` — entry-only and path+entry decode; empty origin message; highlight still requires source
- `src/renderer/shell/record-navigation.test.ts`, `shell-records.test.ts` — lesson/title/source/human/originless/historical/identical-body targets
- `src/renderer/App.test.tsx` — originless note, sourced note, pending lesson, distinct twins, draft kept under Find, existing Home/native-close copy
- Reader / ReaderContext / EntryOrigin — reveal without changing reading text; parent-entry control distinct from Open origin

## Remaining owner dependencies

- AR47: Opening / onboarding / `0005` / resume
- AR51: contextual / `0006`
- AR50: Practical source/tests (still rejects `origin.entry`)
- AR58: new backend boundary tests
- AR48: backend runtime/http/providers
- AR54: clip/media/render-worker
- AR55: companion
- AR49: Canvas mount after independent PASS of the released SHA
- W42: next integration phase once real onboarding/Practical evidence exists

This checkpoint does not self-PASS, mark Done, or claim a full journey from fixture-only checks. macOS CI / Cloud desktop own packaged acceptance. No Sonar here. Global coverage thresholds remain 90%; AR50/58 own the existing deficit — do not weaken gates.

## Check evidence (Cloud, Node 24.20.0)

Recorded on `1918f1c9f1464288a8ac7dad568f8a898e8fc415` (code tip before this note):

- `format:check`, `lint`, `typecheck`: pass
- Vitest with coverage: **1504 passed**, 0 failed
- Coverage: statements **89.95%**, branches **84.74%**, functions **90.06%**, lines **91.43%**. Thresholds remain 90% all. `npm run check` failed only on statements/branches vs those gates. Candidate had previously cited 84.79% branches.
- Production `electron-vite` + backend build: pass when run separately; `npm run check` did not reach build after the coverage gate.
