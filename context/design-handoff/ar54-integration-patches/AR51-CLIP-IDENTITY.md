# AR-51 clip identity patch

AR-54 exposes `createClipOperations(dependencies)` from
`src/main/clip-operations.ts`. It does **not** edit contextual/planner modules.
`requestClip(plan)` on the inspected AR-51 base still defaults to unavailable
and creates explanation identity at final `commit`. Apply this there.

## Producer contract (internal, not IPC)

```ts
import { createClipOperations } from './clip-operations';
import { makeClipApiTransport } from './clip-transport';

const operations = createClipOperations({
  accountId: () => authenticatedAccountId, // never renderer input
  transport: makeClipApiTransport({
    request: sessionFetch,
    sessionCookie: () => authenticatedCookie, // never renderer input
    store: retainedMedia,
  }),
  isCurrent: (input) =>
    input.identities.projectGeneration === currentProjectGeneration &&
    input.identities.requestGeneration === currentRequestGeneration,
});
```

`operations.request(input, signal): Promise<ClipPlaybackResult>`

`input.plan` is a validated supported clip plan. `input.identities` is
main-owned:

- `requestId`, `projectId`, `explanationId`, `explanationAttemptId`
- `origin: LearningOrigin` (complete revision-bearing origin)
- `projectGeneration`, `requestGeneration`

`.revoke()` aborts in-flight adapter calls so a late result cannot publish.

## Required identity change

1. Reserve or reuse the exact `explanationId` and `explanationAttemptId`
   **before** `operations.request`.
2. Call the adapter with those same IDs.
3. `commit` that same identity. Do not mint a new ID at final commit.
4. On `{ kind: 'unavailable' }` or cancellation, keep the previous useful
   retained result. Do not replace it with a failed/cancelled attempt's empty
   result.
5. Persist `LearningOrigin` as supplied. The recipe JSON origin is a UUID
   projection (`projectId` / `sourceVersionId` / `questionId: null` /
   `lessonId`) and **must not** replace `path` / `entry` revisions.

## Result

Ready results are only existing `RetainedExplanationResult` clip fields:

```ts
{
  kind: 'clip',
  family: 'linear-transform' | 'weighted-combination',
  assetVersion: 'original-manim-1',
  media: { kind: 'app-retained-media', artifactId },
  verified: { sha256, mediaType, bytes, width, height, durationSeconds, stages, renderer }
}
```

Never return worker paths, account IDs, arbitrary URLs, synthetic MP4s, or a
ready clip when the adapter did not retain verified bytes.

Planner caption/copy stay on the plan. Recipe titles/labels may use the fixed
ASCII app strings (`Linear transform`, `Weighted combination`, `v1`/`v2`)
when planner copy cannot enter `decodeAnimationRecipe`. Out-of-bounds math is
rejected, not clamped.

## Tests AR-51 should add

- Reserved IDs on the adapter call equal committed IDs
- Previous useful clip remains after a cancelled or failed newer request
- Signal abort does not submit, or cancels an in-flight request
