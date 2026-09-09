# Versioned passage index — AR-34

## Implemented boundary

`src/backend/sourcing/index/adapter.ts` exposes `indexBatch`, `deleteRevision`, `search`, and the shared-contract-compatible `retrieveEvidence`. This is a backend adapter checkpoint with synthetic vectors and injected HTTP responses. It is not wired into backend routes, desktop entry flows, acquisition jobs, or a live corpus. AR-30 owns shared sourcing contracts; AR-33 owns acquisition, extraction and chunk production. Their contracts remain unchanged.

Construction accepts a backend-owned corpus ID, a generation manifest and a `CorpusAuthority`. There is deliberately no production key, region setting, default network transport or native embedding path. Omitting `fixture` returns `live-configuration-required` without network access. The fixture URL uses `gcp-us-central1`; this is an API-shape specimen, not an approved deployment region. The only Authorization value is a synthetic fixture marker. Do not pass a live HTTP client to the fixture seam.

The manifest pins external embedding provider, model, model version and dimensions together with schema, corpus and chunking versions. Configuration is copied at construction. Query embeddings return the same manifest; write batches carry it alongside caller-produced passage vectors. Any mismatch rejects. A changed manifest or corpus ID derives a new namespace rather than rewriting a prior generation. Vector validation requires a dense, finite, nonzero f32-representable vector of the exact dimension (at most 4,096). Tests use three-dimensional synthetic vectors; no embedding quality is established.

## Acquisition and access authority

`CorpusAuthority.resolve(accountId, sourceVersion)` returns the producer's snapshot of the current acquired revision, reviewed indexing permission, approved corpus version and access grant. The seam is synchronous in this checkpoint: the producer must refresh that snapshot from its durable store before each adapter call, and the adapter only observes grant changes the resolver reflects. An asynchronous resolver that receives the operation signal, and a tombstone shape without full content, are required before producer integration (AR-43). The account comes from `SourcingInvocation`, not request JSON. The resolver may return `eligible`, `excluded`, `deleted`, or no record. Public scope requires public source access; account scope must exactly match the authenticated account. The adapter reuses AR-30's acquisition decoder and canonical hash validation before uploading text. It never acquires or chunks sources itself.

Each passage carries an exact scalar-safe UTF-16 locator into canonical text, including its document, page or timestamp position. A deterministic 64-character SHA-256 row ID binds generation, access scope, exact source identity/hash/canonicalization version, range and position. Position identity is independent of object property order. Duplicate passages collapse; conflicting vectors for the same ID reject the batch. Exact retries send the same serialized body. Source quality remains `unknown`; retrieval rank does not establish source quality or mastery.

Both ANN and BM25 branches receive identical filters for generation, eligibility, tombstone state and the authorized source-revision/scope pairs. The adapter performs an atomic multi-query with strong consistency, then client-side reciprocal rank fusion (rank constant 60). Every candidate is checked against those same constraints and current canonical authority before fusion. Unexpected rows cannot become evidence merely because the index returned them. Each result roundtrips through AR-30's exact-citation decoder. Valid results can be returned as `partial` when other rows are invalid; all-invalid results are unavailable. Both learning and research intent are preserved.

Revocation must be persisted by the authoritative producer **before** calling `deleteRevision`. Excluded/deleted revisions immediately stop qualifying for queries and writes, including across adapter recreation. A bounded delete-by-filter purges only that generation, revision and scope. The producer must retain enough tombstone identity/scope to retry deletion. An in-flight pre-revocation write can still race a remote purge; authoritative reads suppress its results, but durable purge reconciliation belongs to producer integration. There is no local in-memory tombstone substitute or claimed durable job system here.

## Resource and failure bounds

- At most 100 passage inputs per batch; at most 1 MiB of serialized request bytes. Oversized batches reject atomically before HTTP rather than uploading a prefix.
- At most 50 requested source revisions and 50 returned passages under AR-30's limits; at most 100 candidates per query branch.
- At most 2 MiB of actual response bytes, including streams without Content-Length. Redirects, malformed JSON, invalid UTF-8 and malformed acknowledgements fail closed.
- At most three HTTP attempts; only network errors and 5xx responses retry, after 50 ms then 100 ms. 429 is returned immediately, avoiding early retries against server backpressure.
- One operation deadline includes embeddings, HTTP, streaming and retry waits: 10 seconds by default, configurable from 1 ms through 30 seconds. Cancellation starts no further I/O and also settles when an injected operation ignores abort.
- The resolver is re-read before each upsert, delete and query attempt and for each returned row; those rechecks compare state, corpus version, scope and exact identity only. The AR-30 canonical decode and hash validation run once per distinct source revision per operation, so a batch of many passages from one large source does not re-hash it per passage. Duplicate rows within one branch do not inflate fusion scores.

`search` returns a per-operation status alongside the unchanged public retrieval response. `index-lag` maps to a retryable public `unavailable`; cancellation, timeout and rate limiting keep their existing shared outcomes. `indexBatch` and `deleteRevision` return bounded reasons directly. A provider `rows_remaining` acknowledgement never means deletion completed. These statuses are available to future backend/UI composition; no desktop status view is implemented by this ticket.

## Live acceptance remains blocked

Before enabling live calls, the founder must select and verify an external embedding provider/model/version/dimension, backend-aligned turbopuffer region, approved initial corpus and monthly/per-operation embedding/index budgets. The existing provider-development allowance does not authorize a turbopuffer subscription. No account was created, service purchased, provider credential read, corpus uploaded or live query made by this implementation.

Recommendation for the next decision checkpoint: evaluate one explicitly pinned external embedding model against a small founder-approved, publicly indexable educational/scholarly corpus; compare lexical-only, vector-only and fused relevance before increasing scope. Confirm the actual backend location and account plan first. The published Launch plan currently has a $16/month minimum, which needs separate approval; per-operation ceilings and retry reservations must be implemented and verified before enabling a live transport. This recommendation is not a model, region or spending decision. Real write/query failures, cost accounting, latency, retrieval quality, connected entry flows, Cursor recording and independent Fable review remain acceptance work.

## Official API references

Verified September 9, 2026 UTC: [write/schema and 64-byte document IDs](https://turbopuffer.com/docs/write), [multi-query, filters and strong consistency](https://turbopuffer.com/docs/query), [hybrid search and client fusion](https://turbopuffer.com/docs/hybrid), [native embedding private beta](https://turbopuffer.com/docs/embedding), [permissions](https://turbopuffer.com/docs/permissions), [regions](https://turbopuffer.com/docs/regions), [service limits](https://turbopuffer.com/docs/limits), [pricing](https://turbopuffer.com/pricing). The adapter uses Node's existing fetch-compatible HTTP seam and the documented REST API; it adds no dependencies or SDK retry layer.

## Verification handoff

The founder’s recovery instruction supersedes older local desktop/Sonar guidance: focused unit tests and `npm run check` run locally; Cursor cloud owns targeted Playwright and hands-on video, blocking macOS GitHub CI owns full desktop verification, and Railway/GitHub owns hosted Sonar. Remote checks remain pending until their actual revision-specific results arrive. Implementers must not produce Cursor attestations on its behalf or move Linear statuses.

AR-34 has 49 synthetic public-boundary tests. The preserved local `npm run check` passed 813 tests in 71 files, formatting, lint, all TypeScript checks, coverage thresholds and desktop/backend builds. Its source files are unchanged by infrastructure recovery; the focused suite passed again on recovery under Node 24. Live corpus quality, costs, latency and connected producer/entry-flow acceptance are still unverified. Passing fixtures establish the adapter checkpoint only.
