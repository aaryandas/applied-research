# Authenticated sourced backend — AR-48

This page owns the authenticated HTTP composition for discovery, guarded
acquisition, live turbopuffer retrieval and sourced first-useful-step generation.
Shared contracts stay frozen. Main, preload, renderer and public UI contracts
have another owner; interface changes go through AR-48 coordination, not silent
desktop edits in this lane.

Production AI remains disabled (`AI_ENABLED=false`). The company OpenRouter key
never ships in Electron. Turbopuffer and embedding credentials are backend-only.
This revision does **not** deploy, self-merge or enable live paid embedding.

## Endpoints and status contract

All three routes are `POST`, JSON, UTF-8, `Cache-Control: no-store`. Bodies are
strictly parsed before session lookup. Caller `accountId`, source-policy, URL or
`evidenceContext` fields are refused (`400`). The Better Auth database session is
the only account authority.

| Route                  | Request → response                                                 | Success                                | Auth  | Invalid | Forbidden | Busy/conflict                            | Budget                                 | Timeout                | Unavailable                                                                         |
| ---------------------- | ------------------------------------------------------------------ | -------------------------------------- | ----- | ------- | --------- | ---------------------------------------- | -------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| `/v1/sources/discover` | `DiscoverSourcesRequest` → `DiscoverSourcesResponse`               | `200` success/partial/no-results       | `401` | `400`   | `403`     | `409` cancelled                          | `429`                                  | `504`                  | `503`                                                                               |
| `/v1/sources/acquire`  | `AcquireCanonicalSourceRequest` → `AcquireCanonicalSourceResponse` | `200` success                          | `401` | `400`   | `403`     | `409` cancelled                          | `429`                                  | `504`                  | `503`                                                                               |
| `/v1/learning/sourced` | `LearningRequest` → `SourcedLearningResponse`                      | `200` sourced/partial/coverage-pending | `401` | `400`   | n/a       | `409` disconnect/cancel before execution | existing quota `429` on inner learning | `504` pre-auth timeout | `200` coverage-pending for retrieval/generation gaps; `503` only for oversized JSON |

Generic `POST /v1/learning/requests` is unchanged. Unsupported sourced operations
are a **generation gap** (`200` `coverage-pending`, `gaps[].kind = generation`),
not HTTP `422`. Invalid `requestId` values are omitted (`requestId: null`). Empty
review paragraphs are omitted.

Route timeouts: 30s discover/acquire, 230s sourced. Disconnect aborts the
combined signal. Response UTF-8 size is capped; oversized JSON becomes a safe
`503` no-store body. Discovery metadata is not full text and is not grounding
evidence.

## Persistence and migrations

Reviewed SQL `src/backend/migrations/0002_sourced_backend.sql` is applied after
`0001_authenticated_backend`. Readiness requires both names in
`backend_migration`.

| Table                                         | Role                                                                                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source_descriptor`                           | Account-owned discovery descriptors. Acquisition reads this stored row, never renderer policy.                                                          |
| `source_revision`                             | Immutable acquired revisions (content-addressed).                                                                                                       |
| `source_index_state`                          | Canonical revision + embedding-generation dedup for turbopuffer writes.                                                                                 |
| `source_operation`                            | Durable outer idempotency: account + client `requestId` + client-visible input hash. States: in-progress, completed, uncertain.                         |
| `provider_budget` / `provider_budget_request` | Per-account monthly OpenAlex reservations. Missing allowance fails closed.                                                                              |
| `shared_budget` / `shared_budget_request`     | Shared `embedding-eval` ledger: original ceiling 250000 µUSD, coordinator probe settled 4 µUSD, **remaining 249996**. Never re-seeded as a fresh $0.25. |

No database transaction is held across remote I/O. Uncertain paid embedding or
sourced requests are retained; they are not blindly retried. Concurrent duplicate
in-progress requests return a public in-progress/unavailable outcome. Changed
input with the same `requestId` is a conflict.

Paid inner learning hashes ignore volatile `retrievedAt` / `rank` / `evidenceId`.
Hashing source IDs alone is not the idempotency key.

## Retrieval and embeddings

Founder-approved live configuration (coordinator provisions secrets/region
separately; no keys in this repository or chat):

- turbopuffer Launch, Oregon **`aws-us-west-2`** (allowlist also includes `gcp-us-west1`)
- OpenRouter request model `qwen/qwen3-embedding-8b` pinned to route `deepinfra`
- Response model must be **exactly** `Qwen/Qwen3-Embedding-8B` (reviewed alias only)
- `dimensions: 1024`, `encoding_format: float`, `require_parameters: true`, no fallbacks
- `max_price.prompt = 0.01`, `max_price.request = 0`; no truncation
- Query instruction: Instruct/Query prefix in `policy.ts`; document instruction is empty
- Live query and document embeddings reserve the exact serialized final inputs (including the query instruction prefix) against the original `embedding-eval` remaining allowance, never a fresh per-run 250000 µUSD ceiling
- Paid adapter outcomes are `not-dispatched`, `settled`, or `uncertain`. Unknown outcomes after physical dispatch retain their reservation and are non-retryable until reconciled. Settlement uses provider-reported `usage.cost` only; prompt-token guesses are forbidden
- L2-normalized vectors; generation identity is provider + model + modelVersion + dimensions + schema + corpus + chunking
- Mixed fixture/live transports reject. Missing live config fails closed (`live-configuration-required`)
- Hybrid ANN+BM25 runs only after a real finite vector; there is no keyword-only fallback
- Original embedding ceiling **$0.25 TOTAL** (`EMBEDDING_EVAL_LIMIT_USD` cannot be raised)
- Durable remaining after coordinator probe: **249996 µUSD**. Prior operations `fba2defc-8bdf-4482-a779-15b7e8359449` and `e4dec66c-5cdc-47c4-84c8-bede89b7db18` are imported as settled. Do not reset to 250000 remaining.

`SOURCE_INDEX_LIVE=true` requires `TURBOPUFFER_API_KEY` and Oregon `aws-us-west-2`.
Default remains false. Generation quota and `MAX_PROVIDER_REQUEST_PRICE_USD = 0`
are unchanged. `IndexOperationError.reason` stays typed, including `not-eligible`.

Operator configuration proof lives on the integration candidate as
`context/turbopuffer-configuration-acceptance.md`. That document is not this
lane's HTTP/authority acceptance.

## Starter corpus

Permission-verified metadata in `src/backend/sourcing/catalog.ts`:

- Python 3.14.7 floating-point chapter (existing curated PSF HTML)
- Official MIT OCW 6.006 / 18.06 and OpenStax University Physics links remain discoverable as link-only; current notices do not grant commercial/AI indexing or transcripts
- University extractors (MIT/Delft, later Stanford/Berkeley/Harvard grants) are **not** default catalog rows here. AR-57 injects `MetadataOnlySource[]` through `composeCatalogSources` / `bindUniversityLane`. This lane does not copy `src/backend/university-acquisition/` or invent that catalog
- BCcampus starter acquisition grants are not shared catalog defaults

HTML text extraction remains for the PSF chapter. PDFs and images are not acquired. Metadata is not treated as retrieved evidence. `discoverStarterCatalog` accepts an optional injected catalog. Do not silently add MIT OCW/OpenStax indexing rights here.

`POST /v1/learning/onboarding` is **not** this checkpoint. AR-52 owns that
sibling contract (draft PR #45). Do not consume it until independent review
PASS. Do not register onboarding on `/v1/learning/sourced`. Do not implement
Practical attempt storage.

## Eval smoke (paid path blocked)

Live `source-index-eval` is **not** part of `npm run check` and is **not**
authorized on this head. Query and document embeddings must both admit against
the original `embedding-eval` remaining allowance (249996 µUSD after the seeded
4 µUSD settlement). A per-run fresh 250000 µUSD ceiling, or reporting document
cost while excluding query cost, is a spend-boundary defect. Cleanup must run in
`finally` and be independently confirmed. This agent did not run paid calls.

The smoke, when later authorized, embeds one original eval-only sentence,
writes/queries/deletes the named eval namespace, and reports combined query plus
document spend from the durable ledger. It is not starter-index content and does
not enable production AI.

## Desktop and sibling coordination

The backend returns **pure HTTP JSON**: syllabus + first lesson
(`scope: first-useful-step`) only. It does not save to Electron, project
workspace state, or generate later lessons up front. Main-owned explicit
acceptance remains required (AR-37/AR-26). Onboarding/profile UI is another
owner. App nav expectations belong to AR-47/AR-56. Practical double-migration
fixtures belong to AR-50.

Published security tests in `src/backend/source-routes.test.ts` expect **401**
for valid unauthenticated POSTs and **400** for caller `accountId` /
`evidenceContext`. Those tests failed with **404** before this checkpoint
because the routes were unregistered. Do not change the expectations to 404.
