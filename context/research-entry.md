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
- `onOpenReader(ResearchReaderTarget)` flushes existing workspace drafts before
  opening the exact **local** source/revision. It receives the original question
  and `LearningOrigin`, and returns `opened`, `blocked`, `missing-source` or
  `stale-project`. Missing revisions must never fall back to the latest source.
- `onOpenOriginal(ResearchLinkTarget)` resolves a source/provider identity behind
  trusted navigation policy and returns `opened` or `unavailable`. The renderer
  never sends a raw provider URL to a navigation operation.

The shell must abort remote work when the operation signal is aborted and check
project/request identity again before committing. Renderer cancellation alone
cannot undo a transaction. Preserve Reader mounting and its save barrier while
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

Initial callback checkpoint only. TDD component adapters are synthetic and do
not establish connected sourcing. AR-37 producer/Shell wiring, the real Electron
query → acquire/save → exact Reader → highlight/human note journey, Cursor
recording, independent Fable 5.1 review and coordinator-owned serialized Sonar
analysis are required before full acceptance. The local Sonar endpoint was
unreachable during AR-38 preflight; this worktree has no `.env.sonar`.

The dispatch explicitly permits `src/renderer/research/**`, context and E2E
changes. The older lane catalog in base `9434020` has no research lane. AR-41
owns its update; AR-38 must inspect that prerequisite before marking ready and
must not edit `.github/lanes.json` itself.
