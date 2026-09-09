# AR-48 — explanation planner registration

Do not add a second unbounded OpenRouter caller. AR-51 already implements:

- `src/backend/explanations/provider.ts` — `makeExplanationPlannerProvider({ apiKey, request })` using `MODEL_ADMISSION`, structured `explanation_planner` schema, planner system prompt
- `src/backend/explanations/service.ts` — `makeExplanationPlannerService({ accounting, provider, config, now })` reserves/settles through the existing `AccountingStore`
- `src/backend/explanations/http.ts` — `handleExplanationPlanRoute`

Main posts to `POST /v1/learning/explanation-plans` with the session cookie. Tutor remains `POST /v1/learning/requests` (`source-grounded-tutor` only).

## 1. `src/backend/http.ts`

```ts
import { handleExplanationPlanRoute } from './explanations/http.js';
import type { ExplanationPlannerService } from './explanations/service.js';

export interface HttpDependencies {
  // existing fields
  readonly explanationPlanner?: ExplanationPlannerService;
}
```

After `/v1/learning/requests` (and alongside `handleSourceRoute`):

```ts
const planned = await handleExplanationPlanRoute(
  url.pathname,
  request,
  response,
  dependencies,
  disconnect.signal,
);
if (planned) return;
```

Use the same disconnect observer. Do not parse planner bodies with `parseLearningRequest`.

## 2. `src/backend/runtime.ts`

In the existing Effect composition, construct the planner with the same admitted key/fetch/accounting as the tutor:

```text
const explanationPlanner = yield* makeExplanationPlannerService({
  accounting: makePostgresAccounting(database),
  provider: makeExplanationPlannerProvider({
    apiKey: config.openRouterApiKey,
    request,
  }),
  config,
  now: () => new Date(),
  diagnostics,
});
```

Import `makeExplanationPlannerProvider` / `makeExplanationPlannerService` from `./explanations/index.js`. Pass `explanationPlanner` into `HttpDependencies`. Same admitted model. No provider/model swap.

## 3. Accounting operation kind (optional but recommended)

`learning_request.operation` is unconstrained text. AR-51 hashes a structurally compatible `LearningRequest` with `operation.kind: 'explanation-planner'` via assertion so tutor and planner idempotency do not collide.

Please add `'explanation-planner'` to `LearningOperation` / `parseLearningRequest` when you next touch `src/contracts/learning-api.ts` and `src/backend/validation.ts`. Until then the cast remains.

Accounting rows currently store policy `PROMPT_VERSION` (`learning-v2-2026-09-09`). Returned planner provenance uses `explanation-planner-v1-2026-09-09`. Prefer storing the planner prompt version on planner reservations when you extend the schema.

**Do not** reuse `buildProviderBody` / tutor `reservationMicrousdFor` for planner reservation: unknown kinds are treated as learning-path JSON. AR-51 uses `reservationMicrousdForPlannerBody(buildPlannerBody(request))`.

## 4. Desktop paste canonicalizer alias

Local human-imported sources store `canonicalizationVersion: '1'`, which fails `IDENTIFIER_PATTERN` (8–100). Main maps **only the outbound tutor/planner envelope** `'1'` → `workspace-plain-v1` and keeps stored `'1'` plus exact bytes/hash.

Admit `workspace-plain-v1` as that alias (or allow stored `'1'` on the desktop paste path). Do not rewrite stored hashes or forge canonical revisions.

## 5. Contract import for NodeNext

`src/contracts/explanation-artifacts.ts` uses extensionless relative imports, so `tsc -p tsconfig.backend.json` (moduleResolution: NodeNext) cannot compile it. AR-51 therefore ships `src/backend/explanations/plan-decode.ts`, a NodeNext-safe decoder aligned with `decodeExplanationPlan`. Prefer switching the backend to the reviewed contract decoder once that file (or tsconfig.backend include/paths) admits `.js` specifiers. Do not add a second decode with looser families or executable fields.

## 6. Out of scope for AR-48 here

- No company key in Electron
- No `askTutor` for contextual Ask
- No planner JSON smuggled in tutor `body`
- Clip/render-delivery remains AR-54
