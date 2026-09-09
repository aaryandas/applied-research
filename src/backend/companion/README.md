# AR-55 companion backend producer

Owned by the Companion lane. AR48 (`run-49b`) owns `src/backend/http.ts`, `runtime.ts`, provider, accounting, and the production `LearningService`. Do not register this route from AR-55.

## Why a dedicated route

`POST /v1/learning/requests` admits a `LearningRequest` (model + tutor/path operation). It cannot carry the companion main-to-backend envelope (opaque project/selection identity already resolved by main, grounding mode, excerpt, learner context). Reusing it would either trust renderer-shaped fields or collapse provenance. Export:

- `COMPANION_GUIDANCE_PATH` = `/v1/learning/companion`
- `matchCompanionGuidanceRoute(pathname, method)`
- `handleCompanionGuidanceRoute(request, response, deps)`
- `makeCompanionGuidanceService(options)`

## Exact AR48 assembly

In `createHttpHandler`, after `/v1/learning/requests` and **before** the 404, dispatch only this path:

```ts
import {
  handleCompanionGuidanceRoute,
  matchCompanionGuidanceRoute,
} from './companion/index.js';

// inside the handler, after auth/learning deps exist:
if (matchCompanionGuidanceRoute(url.pathname, request.method)) {
  await handleCompanionGuidanceRoute(request, response, {
    auth: dependencies.auth,
    learning: dependencies.learning, // production LearningService with monthly + durable aggregate admission
    runEffect: dependencies.runEffect,
    // Optional: when AR48 source operations can digest a retained source:
    // lookupAdmittedSource: ({ sourceId, revisionId }) => operations.lookupDigest(...)
  });
  return;
}
```

Do **not** construct a second OpenRouter client, budget, retry loop, or provider-enabling setting. The service calls `learning.request(account, ProviderLearningRequest)` **once**. `unavailable` / unknown provider outcomes are returned as typed failures; they are not retried.

Authenticate with `auth.authenticate(request.headers)` (Better Auth cookies). Incoming selected material is untrusted content. The envelope decoder re-hashes `canonicalText` and checks excerpt offsets. Locators must parse as `https:` URLs with no userinfo and no `@` authority ambiguity (same policy as main `httpsLocator` / `new URL`). When `lookupAdmittedSource` is injected and returns a row, a digest mismatch is `invalid-request`. A corpus miss still allows hash-verified workspace text; it is not treated as a scholarly corpus hit.

Source-poor tool/app-control envelopes use `grounding: 'app-context'` and a labelled `companion-app-context` source revision so the existing tutor schema (citations minItems 1) can cite the actual control description instead of inventing papers. The untrusted-content prefix is applied for **both** `source` and `app-context`.

HTTP success JSON (hand-off from this producer; AR48 `947bd563` join stays valid):

```ts
{
  outcome: 'success',
  requestId,
  authorKind: 'ai',
  text,
  provenance,
  nextAction, // tutor nextAction — advice only, never an automatic command
  citations,  // exact SourceCitation[] from LearningResponse
}
```

AR53 named IPC success now **requires** `nextAction` and `citations` (follow-up after 947). Main transport no longer strips those keys. Assembler/preload must pass them through `requestCompanionGuidance`. Extra keys still fail the strict decoder.

Reply JSON otherwise matches the AR53 success/failure shape (no `stale`/`offline` from HTTP; those are desktop outcomes).
