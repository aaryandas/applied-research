# Planner render grant (AR-48)

Owner: AR-48 backend composition. This is the authoritative join between the
AR-51 planner row and AR-54 remote clip submit. Do not invent a second token,
signing, budget, or job-recovery system. Independent review of planner SHA
`329a34376424ec0d8d2a7c9fba9642f1f2808394` is separate. Frozen AR-54 producer
`99300cf22aa7f30d8e295f52e51024d46f2dccd9` is assembly input, not a claimed PASS.

Production AI stays off. No host purchase, mTLS secret generation, or paid
provider calls are authorized by this page.

## Why this grant exists

Durable planner identity is `learning_request(accountId, requestId)` plus
`public_response` JSONB. That row is account-owned. It is not a project ACL
and it is not a full origin bind until `renderContext` is present.

AR-51 `runPlanner` echo-verifies `request.requestId`, then must keep that
**planner request id** through the desktop callback and local retention. Local
`attemptId` / `providerRequestId` are not the render receipt.

AR-54 public submit is **reference-only**. The backend has no global project
ACL. Never `allowAll`, never project-UUID pretend-ownership, never client
plan/recipe/origin trust.

## 1. Planner `renderContext` (metadata, not prompt)

Optional sibling on `POST /v1/learning/explanation-plans`. MAIN constructs it
from resolved workspace authority. It is not model input.

When omitted or `null`, the request remains an ordinary non-render plan. No
fake grant is minted.

When present, `requestId` must be a UUID (the stable render id). The server
freezes **full** origin/path/revision into `plannerInputHash` and, on a
validated supported clip plan, writes a versioned receipt beside the plan and
the exact admitted source locators.

```http
POST /v1/learning/explanation-plans
Content-Type: application/json
Cookie: session=<better-auth-session>
```

```json
{
  "apiVersion": "2026-09-09",
  "requestId": "11111111-1111-4111-8111-111111111111",
  "model": "google/gemini-3.8-flash",
  "renderContext": {
    "projectId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "origin": {
      "sourceRevisionId": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "path": {
        "pathId": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        "pathRevision": 1,
        "topicId": "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        "lessonId": "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
      }
    }
  },
  "operation": {
    "kind": "explanation-planner",
    "question": "Show the cited weighted combination.",
    "sources": [],
    "learnerContext": []
  }
}
```

`buildPlannerBody` still sends only `{ apiVersion, requestId, operation }` to
the model. `renderContext` is hashed, never prompted.

Required frozen origin for a grant: `sourceRevisionId` plus `path` with
`pathId`, `pathRevision`, `topicId`, and `lessonId`. Optional `highlightId` /
`entry` freeze when present. Extra authority keys (`accountId`, `projectId`
inside origin, recipe, URLs) are rejected.

## 2. Versioned render receipt (`public_response`)

Minted only for retained planner **success** whose plan family is
`linear-transform` or `weighted-combination`. Unsupported families, failures,
and missing context produce no receipt.

```json
{
  "outcome": "success",
  "requestId": "11111111-1111-4111-8111-111111111111",
  "plan": { "status": "supported", "family": "weighted-combination" },
  "provenance": { "sourceRevisions": [] },
  "quota": {},
  "renderReceipt": {
    "version": "render-receipt-v1-2026-09-09",
    "plannerRequestId": "11111111-1111-4111-8111-111111111111",
    "projectId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "origin": {
      "sourceRevisionId": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "path": {
        "pathId": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        "pathRevision": 1,
        "topicId": "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        "lessonId": "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
      }
    },
    "sourceLocators": [
      {
        "sourceId": "10000000-0000-4000-8000-000000000001",
        "revisionId": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
      }
    ],
    "family": "weighted-combination"
  }
}
```

Legacy success rows without `renderReceipt` remain readable planner results.
They cannot start a new remote render.

Changing `renderContext` / origin / source / lesson under the same
`requestId` is a planner input-hash conflict. Prior success is kept.

## 3. Clip POST is reference-only

```http
POST /v1/render/jobs
Content-Type: application/json
Cookie: session=<better-auth-session>
```

```json
{ "requestId": "11111111-1111-4111-8111-111111111111" }
```

Exact keys: `requestId` only, and it **is** the planner request id. Extra
`recipeJson`, `recipe`, `origin`, `plan`, `account`, `accountId`, or
`artifactPath` fields are denied before the engine.

The account-scoped reader loads that account’s planner row, requires retained
success + supported clip + valid receipt, and derives installed recipe / title
/ params / recipe origin **server-side** from the stored plan. Source and
local context are bound to that prior request, not a new global project ACL.

Recipe `id` = planner `requestId`. Recipe origin maps frozen
`sourceRevisionId` → `sourceVersionId` and `path.lessonId` → `lessonId`;
`questionId` is always `null`. AR-51 remaps excerpt citations to parent
offsets: do **not** compare whole local plan JSON or excerpt SHA to a parent
canonical SHA. Excerpt-origin and full-source-origin grants are both valid
when the frozen `sourceRevisionId` is the revision the planner actually used.

Missing, foreign, failed, unsupported, legacy, or malformed receipts fail
before the engine. Same id + same grant replays one concurrent dispatch.
Same id + changed bound origin/recipe conflicts and does not attach the old
clip to the mismatched origin. Desktop `attemptId` stays AR-54/main-owned and
separate from this stable render id.

`GET /v1/render/jobs/:requestId`, `POST /v1/render/jobs/:requestId/cancel`,
and `GET /v1/render/artifacts/:mediaId` keep existing account guards.

## 4. AR-51 / AR-54 consumer obligations

- **AR-51:** send `renderContext` constructed by MAIN’s resolved authority;
  preserve `plannerRequestId` (`request.requestId`) through the callback and
  local retention; do not drop it before clip submit.
- **AR-54:** submit `{ requestId: plannerRequestId }` only; keep desktop
  `attemptId` separate; validate published media against the current origin /
  attempt, not a newly minted render identity.
- Main will stop submitting recipe JSON once this grant is mounted. Do not
  import `src/main/clip-projection.ts` into the backend. The authoritative
  installed plan → recipe projection lives in `src/backend/explanations/installed-recipe.ts`.

## 5. Runtime composition

Authenticated HTTP mounts the AR-54 routes. Missing worker host configuration
(`AR_RENDER_WORKER_ORIGIN` plus operator-supplied TLS path names and staging /
artifact directories) fail closed; the API process still serves learning.
Present configuration uses `createRemoteRenderEngine` and closes the engine
on shutdown. This lane does not generate certificates, purchase a host, or
reset `$2/10` generation-eval or embedding-eval `4/250000`.
