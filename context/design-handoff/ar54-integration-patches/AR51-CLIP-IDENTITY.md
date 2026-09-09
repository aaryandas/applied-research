# AR-51 clip identity patch

AR-51 `ef94badf53d5ee509cda09ea01240e3d1ec1871c` already reserves
`explanationId` + `attemptId` (status `rendering`) **before** calling:

```ts
requestClip({ explanationId, attemptId, origin, plan, signal });
```

Do **not** edit `contextual-help-*.ts` / planner modules in this lane. AR-51
already injects `options.requestClip` (`ContextualHelpOperationsOptions`). Keep
that call shape. The previous useful ready attempt stays via `usefulAttemptId`
when the clip result is unavailable.

## Producer (AR-54, already on this branch)

```ts
import { createClipOperations } from './clip-operations';
import { makeClipApiTransport } from './clip-transport';
import type { RetainedClipRequestContext } from './clip-operations';

const clipOps = createClipOperations({
  accountId: () => authenticatedAccountId, // never renderer input
  projectId: () => activeProjectId, // never renderer input
  transport: makeClipApiTransport({
    request: sessionFetch,
    sessionCookie: () => authenticatedCookie, // never renderer input
    store: retainedMedia,
  }),
  isCurrent: (context) =>
    !context.signal.aborted && context.explanationId === reservedExplanationId,
});
```

`clipOps.request(context)` is the `requestClip` implementation:

- `context.plan` — validated supported clip plan (linear-transform /
  weighted-combination only)
- `context.explanationId` / `context.attemptId` — already reserved; this
  adapter uses `attemptId` as the authenticated render `requestId`
- `context.origin` — complete revision-bearing `LearningOrigin`
- `context.signal` — caller cancellation

`.revoke()` aborts in-flight adapter calls so a late A cannot publish after B.

Account cookie and session identity stay on the injected transport, not on the
AR-51 context object.

## Exact constructor join (AR-56 / main owner of `src/main/index.ts`)

```ts
new ContextualHelpOperations({
  records,
  authenticated: () => Boolean(accountId),
  transport: learningTransport,
  requestClip: (context: RetainedClipRequestContext) =>
    clipOps.request(context),
});
```

Leave the default `requestClip` stub in `contextual-help-clip.ts` as the
unavailable fallback. Do not mint a new explanation or attempt ID inside the
adapter. `commit` the same `explanationId` / `attemptId` AR-51 reserved.

On `{ kind: 'unavailable' }` keep the previous useful retained result (AR-51
already does this when `ready` is false). Persist `LearningOrigin` as supplied.
The recipe JSON origin is a UUID projection (`projectId` / `sourceVersionId` /
`questionId: null` / `lessonId`) and **must not** replace `path` / `entry`.

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

## Tests AR-51 already owns

- Reserved IDs on the adapter call equal committed IDs
- Previous useful clip remains after a cancelled or failed newer request
- Signal abort does not submit, or cancels an in-flight request

No AR-51 module edit is required for this join once main injects `requestClip`.
