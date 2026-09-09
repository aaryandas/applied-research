# Research entry — AR-38 callback handoff

`src/renderer/research/ResearchEntry.tsx` is a renderer component for the existing
project workspace. AR-37 owns Shell, Opening, bridge and Reader integration.
The component consumes the frozen AR-30 sourcing contract on base `9434020`;
these callbacks are ordinary renderer props, not new public IPC operations.

## Concrete callbacks

The exported types live in `src/renderer/research/research-contract.ts`.

- `onDiscover(DiscoverSourcesRequest, ResearchOperation)` returns the frozen
  discovery response or `stale-project`. Operations capture project, question,
  originating `LearningOrigin` and an `AbortSignal`.
- `onAcquireAndSave(AcquireCanonicalSourceRequest, ResearchOperation)` performs
  trusted acquisition and local acceptance. Only a completed local transaction
  returns `outcome: 'saved'`, the acquired descriptor and `saved` local
  `{ projectId, sourceId, revisionId }`. Remote and local identities may differ.
  Acquisition failure, permission denial, stale project and failed local save
  remain explicit outcomes. Never return `saved` for fetched-but-unsaved text.
  When the operation signal aborts before the local commit, resolve `cancelled`,
  never `saved`. A commit that completed before the abort was observed still
  resolves `saved`; the renderer records that reference and reports it in the
  status line without opening Reader.
- `onOpenReader(ResearchReaderTarget)` flushes existing workspace drafts before
  opening the exact **local** source/revision. It receives the original question
  and `LearningOrigin`, and returns `opened`, `blocked`, `missing-source` or
  `stale-project`. Missing revisions must never fall back to the latest source.
- `onOpenOriginal(ResearchLinkTarget)` resolves a source/provider identity behind
  trusted navigation policy and returns `opened` or `unavailable`. The renderer
  never sends a raw provider URL to a navigation operation.

The shell must abort remote work when the operation signal is aborted and check
project/request identity again before committing. Renderer cancellation alone
cannot undo a transaction. Adapters resolve typed outcomes and never throw; the
component's catch branches are a last resort that show generic copy and retain
no adapter details. Preserve Reader mounting and its save barrier while
showing research. Keep research mounted when temporarily entering Reader to
retain question/results and return position; replace it only when replacing the
project. No research callback may bypass the existing draft flush.

The frozen discovery result has no verified relevance explanation. Display the
actual provider/query match, explicitly unverified, without inventing scientific
support or using retrieval rank/citation counts as correctness. Only OpenAlex's
metadata summary currently has an adapter guarantee that it is an abstract;
other summaries must remain labeled provider metadata. Discovery time is separate
from publication date. Catalog records have no acquired version or note action.

## Delivery and acceptance boundary

The component is implemented with renderer tests and an isolated Electron
contract fixture. It preserves the query and results while mounted, aborts
search/acquisition on project replacement, suppresses late/cancelled and
mismatched responses, and serializes Reader navigation while the shell flushes.
A completed save ends the cancellable acquisition phase before Reader opens.
Saved-reference UI is session state; the trusted adapter owns actual durability
and the shell owns reopening retained source records after restart.

The provider/query match is presented as unverified relevance. OpenAlex abstracts
remain provider metadata with no full-paper summary or note action. Catalog-only
and permission-denied material retain original-link actions. Related material
uses provider/source identities through the same trusted link callback. Partial
provider and extraction coverage remain visible.

TDD component adapters are synthetic and do not establish connected sourcing. AR-37 producer/Shell wiring, the real Electron
query → acquire/save → exact Reader → highlight/human note journey, Cursor
recording, independent Fable 5.1 review and coordinator-owned serialized Sonar
analysis are required before full acceptance. The local Sonar endpoint was
unreachable during AR-38 preflight; this worktree has no `.env.sonar`.

The dispatch explicitly permits `src/renderer/research/**`, context and E2E
changes. `.github/lanes.json` carries the `research` lane
(`src/renderer/research/**`), mirroring the AR-41 delivery-workflow catalog in
PR #21 so the two merge cleanly; AR-41 owns the rest of that catalog.

## Local verification

Node 24.19.0; exact seeded lockfile unchanged. No `npm ci` or shared mutable
`node_modules` symlink was used. Native SQLite rebuilds happen in this worktree.

- `npm run check`: 796 tests in 71 files; statements 94.70%, branches 90.80%,
  functions 96.82%, lines 96.28%. All formatting, lint, types, coverage and builds
  passed. Research UI: 32 focused tests, 98.69% lines, 86.80% branches; the existing
  combined coverage gate passed without changes.
- `tests/e2e/research.spec.ts`: isolated Electron contract test passed. It checks
  keyboard focus, long titles, 1100px and 520px widths, light/dark captures,
  partial results, cancellation, provider unavailable/no results, and exact
  original question/topic/local version callback data. Its visible disclosure
  states that no provider, persistence or Reader integration is exercised.
- Mechanical UI detector: no findings. Captures visually inspected against the
  existing fonts, semantic tokens and Reader reading plane; independent Fable
  review is still required.
- `npm run test:e2e`: exit 0, 11 expected outcomes in 48.1 seconds. Ten tests
  passed normally, including research and the real pasted-source → Reader →
  human note → Canvas → restart journey. The existing auth test retains its
  pre-existing `test.fail` for AR-40 (Electron transport hides Set-Cookie); the
  failure was observed, not fixed or newly waived by AR-38. This is not evidence
  of successful production sign-in.

Red/green receipts, full check logs and screenshots are retained at
`/private/tmp/ar-38-evidence`. CI uploads `desktop-tests-macos-latest` with the
Playwright report and screenshots. Fixture screenshots are evidence of component
layout/interaction only, not the required connected journey or Cursor recording.

AR-41 PR #21 (`69d02ee354567a01bbc14b5d0e9d56e779ca671b` when inspected)
publishes the expanded lane catalog and remains open. AR-38 does not replace the
catalog locally. The PR must remain draft while its connected local acceptance
or required prerequisite evidence is incomplete; the dispatcher owns Linear
transitions.
