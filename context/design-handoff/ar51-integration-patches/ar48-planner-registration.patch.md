# AR-48 — explanation planner registration

Do not add a second unbounded OpenRouter caller. AR-51 already implements:

- `src/backend/explanations/provider.ts` — `makeExplanationPlannerProvider({ apiKey, request })` using `MODEL_ADMISSION`, structured `explanation_planner` schema, planner system prompt
- `src/backend/explanations/service.ts` — `makeExplanationPlannerService({ accounting, generation, provider, config, now })` persists the **validated plan** on settle (not a tutor contribution or `'Planner settlement placeholder.'`)
- `src/backend/explanations/http.ts` — `handleExplanationPlanRoute`
- `src/backend/explanations/planner-accounting.ts` — `PlannerAccountingStore` / `plannerInputHash`
- `src/backend/explanations/generation-eval.ts` — injected `GenerationEvalLedger` seam for the **same** $2 / 10 physical generation allowance

Main posts to `POST /v1/learning/explanation-plans` with the session cookie. Tutor remains `POST /v1/learning/requests` (`source-grounded-tutor` only).

Do **not** merge a second OpenRouter client. Do **not** create another money/dispatch cap.

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

## 2. Typed accounting extension (required)

`AccountingStore.settle` currently requires `LearningResponse`, whose success arm is a tutor/path `contribution`. Storing planner success as `unavailable` + `'Planner settlement placeholder.'` loses the paid plan on duplicate replay.

Widen these types in `src/backend/accounting.ts` and `src/backend/schema.ts` (no unknown casts, no unvalidated JSON):

```ts
import type { ExplanationPlanHttpResponse } from './explanations/types.js';

export type PublicPaidResponse =
  LearningResponse | ExplanationPlanHttpResponse;

export interface SettlementInput {
  // ...
  readonly response: PublicPaidResponse;
}

export type ReservationResult =
  | { readonly kind: 'reserved'; readonly quota: MonthlyQuota }
  | { readonly kind: 'duplicate'; readonly response: PublicPaidResponse }
  | // existing arms unchanged
```

```ts
publicResponse: jsonb('public_response').$type<PublicPaidResponse>(),
```

Provide a thin adapter (AR-48 owns postgres):

```ts
import type { PlannerAccountingStore } from './explanations/planner-accounting.js';
import { plannerInputHash } from './explanations/planner-accounting.js';

function makePlannerAccounting(store: AccountingStore): PlannerAccountingStore {
  return {
    reserve(input) {
      return store.reserve({
        accountId: input.accountId,
        request: {
          apiVersion: input.request.apiVersion,
          requestId: input.request.requestId,
          model: input.request.model,
          operation: input.request.operation,
        },
        monthStart: input.monthStart,
        now: input.now,
        limitMicrousd: input.limitMicrousd,
        reservationMicrousd: input.reservationMicrousd,
      });
    },
    settle(input) {
      return store.settle(input);
    },
  };
}
```

Hash must be `plannerInputHash(request)` / the same canonical `{ apiVersion, requestId, model, operation }` JSON. Duplicate same account+requestId+hash **replays the stored plan** with no second charge. Conflicting input stays `conflict`. After widening, `LearningRequest.operation` should include `'explanation-planner'` so this adapter needs no assertion.

On duplicate, AR-51 runtime-validates with `decodePlannerHttpResponse` and rejects placeholders.

A later cancelled or failed settle for the same account+requestId **must keep a stored success plan** (`keepUsefulPlannerResponse`). Do not overwrite a useful paid plan with cancelled/unavailable.

Prefer storing planner `promptVersion` `explanation-planner-v1-2026-09-09` on planner rows.

**Do not** reuse tutor `buildProviderBody` / `reservationMicrousdFor`. AR-51 uses `reservationMicrousdForPlannerBody(buildPlannerBody(request))`.

## 3. Same generation-eval ledger (required)

Every planner **physical** OpenRouter call must admit against AR-48's durable global generation evaluation allowance: **2,000,000 µUSD and 10 physical dispatches** (`GENERATION_EVAL_ALLOWANCE_NAME = 'generation-eval'`). Replay of a settled requestId+inputHash is **zero additional dispatch**. Known / unknown / zero-charge / cancel-after-dispatch all count. Cancel before dispatch does not.

AR-51 injects `GenerationEvalLedger` from `src/backend/explanations/generation-eval.ts`. Implement that interface on the **existing** shared budget (do not add a second ledger). If your landed types already match, pass them through; if they differ, keep one adapter.

```text
const explanationPlanner = yield* makeExplanationPlannerService({
  accounting: makePlannerAccounting(makePostgresAccounting(database)),
  generation: generationEvalLedger,
  provider: makeExplanationPlannerProvider({
    apiKey: config.openRouterApiKey,
    request,
  }),
  config,
  now: () => new Date(),
  diagnostics,
});
```

`generationEvalLedger` is the same object tutor/path generation uses. Constructor seam is `accounting` + `generation` + admitted `provider`. No provider/model swap.

a3fda5d on origin is an onboarding wire-parser commit, not generation-eval types. Do not require AR-51 to merge it. If generation-eval types land under a different SHA, switch the import; do not fork limits.

## 4. Desktop paste canonicalizer alias

Local human-imported sources store `canonicalizationVersion: '1'`, which fails `IDENTIFIER_PATTERN` (8–100). Main maps **only the outbound tutor/planner envelope** `'1'` → `workspace-plain-v1` and keeps stored `'1'` plus exact bytes/hash.

Admit `workspace-plain-v1` as that alias (or allow stored `'1'` on the desktop paste path). Do not rewrite stored hashes or forge canonical revisions.

## 5. Contract import for NodeNext

`src/contracts/explanation-artifacts.ts` uses extensionless relative imports, so `tsc -p tsconfig.backend.json` (moduleResolution: NodeNext) cannot compile it. AR-51 therefore ships `src/backend/explanations/plan-decode.ts`. Prefer switching the backend to the reviewed contract decoder once that file admits `.js` specifiers. Do not add a second decode with looser families or executable fields.

## 6. Out of scope for AR-48 here

- No company key in Electron
- No `askTutor` for contextual Ask
- No planner JSON smuggled in tutor `body`
- Clip/render-delivery remains AR-54
- Do not edit AR-51 `backend/explanations/**` while applying this patch except to wire the constructor
