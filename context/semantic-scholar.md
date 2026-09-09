# Semantic Scholar enrichment — AR-32

This is an adapter implementation checkpoint, not connected application acceptance. The September 8 dispatch permits `src/backend/sourcing/semantic-scholar/**` and documentation. It forbids common contract, other adapter and backend composition changes. AR-30's frozen contract at `94340203891406d012028d4762ae15fbfe04e04a` admits OpenAlex and course providers, but no Semantic Scholar provider identity, field attribution or paper-to-paper relationships. Those contracts remain unchanged. A reviewed additive contract and authenticated producer composition are required before this enrichment can cross the sourcing wire or appear in the desktop.

## Public backend seam

`makeSemanticScholarAdapter` exposes:

- `discoverCandidates`: consumes the frozen `DiscoverSourcesRequest`, uses relevance search for paper requests and returns adapter-local metadata.
- `lookupPapers`: accepts at most 50 DOI, arXiv, S2 paper-hash or CorpusId identifiers; normalizes and deduplicates requests, then uses batches of at most 10. Versioned arXiv lookup identifiers retain their suffixes. Missing batch items are explicit `not-found` issues.
- `relatedPapers`: requests citations, references or recommendations for a resolved S2 paper hash. It returns directed `cites` or `recommended` relationships; these are not prerequisites or acquired source passages.

All operations receive the existing `SourcingInvocation`. The backend caller must obtain its account from authoritative session authentication; the adapter's account-context check does not authenticate a caller-supplied account ID. Construct one long-lived adapter per backend provider access configuration. Its queue, pacing and cooldown are local to that instance, not distributed enforcement across replicas. Production composition and shared per-credential admission across replicas remain integration responsibilities.

`joinSemanticScholarSources` returns the original discovery sources alongside enrichment groups. It never replaces a title, source ID, content revision, access policy or provider identity on an existing source. DOI matches use lowercase bare identifiers; arXiv groups ignore version suffixes only for association. Every S2 observation retains its original versioned arXiv identifier. Exact provider observations are deduplicated by snapshot hash; different metadata observations remain separate, including differing values for the same S2 paper ID. Snapshot hashes identify a normalized observation including observation time, not a claim that the provider supplies immutable document revisions. Matches never use title similarity. Conflicts with existing source title, abstract/summary, date and authored creators name the source and snapshot that retain both values. Course results and unrelated works remain intact when S2 fails.

`types.ts` deliberately defines an adapter-local result. Do not cast it to `DiscoverSourcesResponse`, add S2 IDs disguised as OpenAlex IDs, discard attribution to fit the old wire, or treat this sidecar as a frozen AR-30 extension.

## Metadata and access

Every selected descriptive field carries provider, paper ID, API field and observation time. DOI, arXiv and CorpusId each have field-level attribution. Missing fields use `not-provided`; malformed optional values use `invalid` and produce a partial `invalid-response` issue while retaining usable metadata. Retraction status is explicitly `not-supported` by this adapter's documented Graph field selection, never inferred as false. Year-only dates do not become January 1.

All records have `content.state = metadata-only`: no full text is downloaded, extracted or readable in the app. An HTTPS `openAccessPdf.url` becomes an untrusted acquisition candidate. A provider's open-access indication is preserved independently of the presence of a PDF URL. Missing URLs do not imply subscription access. Credential-bearing, insecure or invalid PDF URLs are rejected; no candidate URL is fetched by this adapter. Reported PDF license text remains attributed provider metadata. Acquisition and indexing permissions, and the canonical shared license decision, stay unknown pending policy verification. Nothing is uploaded to an index.

## Application bounds and degradation

These are conservative application limits, not claims about a customer's provider quota:

| Boundary                             | Implementation                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Discovery input/results              | Frozen maximum of 50                                                                                         |
| Related input/results                | Frozen relationship maximum of 32                                                                            |
| Search/citation/reference pagination | 10 records per page; at most three pages; strictly advancing contiguous offsets                              |
| Lookup batches                       | At most 10 IDs per batch and 50 input IDs per operation                                                      |
| Requests                             | At most six HTTP attempts per operation, including retries                                                   |
| Retries                              | At most one retry for HTTP 429 or server errors; 100 ms fallback; no inline wait above 2 seconds             |
| Admission                            | One active operation plus four queued callers per adapter; overflow is `queue-full`                          |
| Deadline                             | 10 seconds by default; backend may select 1–30,000 ms; covers queueing, pacing, HTTP, body reads and retries |
| Response                             | At most 4 MiB, including streamed responses; JSON media type, valid JSON and UTF-8 required                  |
| Origin                               | Fixed `api.semanticscholar.org`; redirects are disabled and foreign response origins rejected                |

Backend configuration must explicitly provide verified access (`access: null` disables the adapter). `apiKey: null` inside an access configuration permits a coordinator-verified unauthenticated mode; it is not an automatic fallback after a key fails. A nonempty key is sent only in `x-api-key` to the fixed API origin, never in a URL or response. Required `minimumIntervalMilliseconds` comes from verified backend access configuration; no remembered rate quota is embedded. Invalid configuration prevents I/O.

HTTP 401/403 yields a provider-specific `authentication-required` issue, not loss of the application's session. HTTP 429 parses delta-seconds and HTTP-date Retry-After, respects bounded retry waits and retains a provider cooldown across later calls, including when the original caller cancels. Errors contain allowlisted reason codes, never response bodies or caught exception messages. Earlier pages/batches remain available with typed partial issues. Abort resolves `cancelled`; the finite deadline resolves `timed-out`; both retain already collected metadata. No new requests start after abort. Body readers and queued callers are released, and late transport responses are cancelled best effort.

## Official provider evidence

Retrieved the current first-party API schemas on September 9, 2026 at 00:42 UTC. These are documentation responses, not live paper-discovery evidence:

| Source                                                                                                                                                                  | Response evidence                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [Academic Graph documentation](https://api.semanticscholar.org/api-docs/graph) and its linked [schema](https://api.semanticscholar.org/graph/v1/swagger.json)           | Schema downloaded successfully; 123,200 bytes; SHA-256 `00d7302bcb07414971a0b483d332e57c01344e037ce878d5baab3c312df039ae` |
| [Recommendations documentation](https://api.semanticscholar.org/api-docs/recommendations) and [schema](https://api.semanticscholar.org/recommendations/v1/swagger.json) | Schema downloaded successfully; 11,926 bytes; SHA-256 `4c91cebb324773e3145643b1b64ca4e5818cbe2bb631d527cdff00c2c49eb8fc`  |

Implemented endpoints are Graph `GET /paper/search`, `POST /paper/batch`, `GET /paper/{paper_id}/citations`, `GET /paper/{paper_id}/references` and Recommendations `GET /papers/forpaper/{paper_id}`. Graph search and related edges have offset/data envelopes; batch responses contain positional paper/null entries; recommendations use `recommendedPapers`. The adapter checks those shapes and bounds instead of following provider-supplied URLs. The Graph schema supports DOI, ARXIV, paper hash and CorpusId lookup. Citation/reference metadata fields are requested without a `citingPaper.`/`citedPaper.` prefix, as the documented examples specify. Recommendations is a separate API; it is not represented as a Graph field.

The selected fields are `title,externalIds,corpusId,authors,abstract,publicationDate,year,isOpenAccess,openAccessPdf`. Both schemas expose these paper fields. Embedded unbounded `citations`/`references` fields, bulk search, dataset downloads, snippets and full-text fetching are unused.

`adapter.test.ts` contains synthetic response fixtures for each envelope and public operation. They use invented paper IDs, titles, author names, DOI/arXiv identifiers and a synthetic API key. No real vault, private experiment or credential data is included. The source-schema downloads are retained temporarily under `/private/tmp/ar32-graph.json` and `/private/tmp/ar32-recommendations.json`; these hashes make the exact checked documentation identifiable without vendoring it.

## Delivery evidence and remaining gates

TDD used the authorized observable seams: public adapter methods with an injected HTTP boundary, and the join function consuming real adapter outputs and frozen source records. Each implementation slice first failed at that seam: missing search adapter; unhandled provider error responses; absent pagination; stalled cancellation; missing lookup; missing relationships; missing join; unconfigured access still dispatching; unbounded concurrent admission; lost rate-limit cooldown; accepted malformed responses; and incorrect absent/invalid metadata. Focused red/green receipts are retained in `/private/tmp/ar32-evidence/`.

Live paper API evidence remains blocked on coordinator-supplied verified access configuration. No live search, batch or related-paper probe has been performed. Fixture passes do not establish live authentication, quotas, availability, relevance, latency or permission to acquire content.

The local Sonar HTTP readiness check failed with connection refused both inside and outside the network sandbox. This worktree has no ignored Sonar configuration. No scan ran and no analysis is claimed. The coordinator owns restoration, scan serialization and exact-revision integrated Sonar evidence. Independent Fable 5.1 review, Cursor's recorded connected walkthrough and real producer integration remain acceptance requirements. The implementer does not move Linear, merge the PR or accept this ticket.

Local verification on macOS arm64 with Node 24.19.0:

- `npm run check`: passed; 835 tests in 71 files; overall statement/branch/function/line coverage 94.86% / 91.25% / 96.77% / 96.39%; lint, strict types, formatting and desktop/backend builds passed. S2's 72 fixture cases passed with 97.92% / 94.64% / 96.47% / 99.13% coverage in that combined run.
- `npm run test:e2e`: exited 0; nine actual passing journeys plus the base's explicitly expected AR-40 authentication failure (`test.fail` at `tests/e2e/auth.spec.ts`). Playwright reports ten expected outcomes and `.last-run.json` has no failed tests. This does not prove working sign-in. The unchanged AR-40 expected-failure marker was neither added nor weakened here.
- Required Node/Electron native rebuilds used this worktree's independent seeded dependencies. Package and lockfile are unchanged. No `npm ci` or shared `node_modules` symlink was used. Initial check attempts encountered sandbox cache-write and localhost-bind restrictions; rerunning with the necessary environment access passed.
- Packaging checks do not apply: no packaging configuration or shipped desktop code changed.
- Logs: `/private/tmp/ar32-evidence/check.log`, `e2e.log`, `focused-coverage.log` and the red/green slice receipts. `git diff --check` passed.

AR-41 lane dependency was inspected: [PR #21](https://github.com/aaryandas/applied-research/pull/21), HEAD `deefc9e1ac37ff02d4b0487d9a6cad83610a30c7`, was open/mergeable with macOS verification in progress. Its changes include `.github/lanes.json`; `main` still lacked `semantic-scholar`, although the GitHub label existed. This assignment's expanded scope was used without modifying the shared catalog.

Disk headroom fell from 7.9 GiB at startup to approximately 256 MiB after verification during concurrent dispatch work. Further installation or native rebuild work is blocked until headroom is restored; no shared files or other worktrees were deleted. The adapter candidate remains a draft until required evidence and integration blockers are resolved.
