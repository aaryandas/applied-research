# Sourced learning backend — AR-36

The additive backend API in `src/backend/learning-api.ts` prepares a sequenced
path and its first readable lesson from retrieved evidence. It is a backend
integration seam, not a registered HTTP route or an accepted desktop journey.
Existing learning/tutor contracts and their consumers remain compatible.

## Invocation and producer connection

`makeSourcedLearningApi({ learning, selectEvidence })` returns
`request(sessionAccount, learningRequest): Effect<SourcedLearningResponse>`.
Composition must derive the account from the authoritative authenticated session
and run the effect in the HTTP request's existing cancellation scope. The API
validates and snapshots the request and copies its account before asynchronous
work. It does not accept a body-supplied account or select sources from the
caller's `operation.sources` as retrieval authority.

The mandatory `selectEvidence` dependency accepts `{ requestId, query, intent, maxPassages }` (currently 12 passages)
and `{ account, signal }`. It returns `{ sources: AcquiredSource[], retrieval:
RetrieveEvidenceResponse }` using the frozen AR-30 contract. The producer must
perform server-authorized discovery/acquisition/retrieval; client-supplied
permission declarations are not authority. The AR-35 producer and backend HTTP
composition are not connected in this branch. No fixture adapter ships in
application code. The producer call has a ten-second bound, with its signal
aborted on timeout or cancellation. The response is validated against that same
passage bound. Valid no-evidence/failure outcomes retain their public retrieval
message even when no acquired sources are returned.

The API validates acquired-source shapes and permissions, the exact requested
query/intent/request identity, canonical hashes, revision identities and
scalar-safe UTF-16 quotations using the existing sourcing validators. It takes
only authored sources with selected evidence, in retrieval rank order, within
the existing four-source/48,000-character generation budget. It never truncates
an immutable source to fit the budget. Exclusions (once per source), partial retrieval and partial
extraction become coverage gaps. Full source descriptors and immutable revisions
remain in the response, including original URLs and discovered provenance.

## Generation and support

The supplied `LearningService` continues to own account-scoped idempotency,
quota reservation/settlement, model allowlisting, provider concurrency,
cancellation and provider timeout. The final serialized provider body includes
the selected evidence and source extraction scopes through the backend-only
`ProviderLearningRequest`/`EvidenceContext` types before its reservation is
calculated. An HTTP regression pins rejection of client-supplied `evidenceContext`.
Learner context keeps its original attribution. Source and metadata
instructions remain untrusted data; no tool/code execution is enabled.

The default sequence uses four bounded model requests:

1. Generate the proposed path using retrieved canonical revisions/passages.
2. Separately assess the factual assertions, objectives and activities in each
   path step against its cited passages.
3. Generate a readable lesson for the first supported step.
4. Separately assess each lesson paragraph and omit unsupported/unknown parts.

Review is another authenticated, quota-controlled learning request, with a
stable derived request ID. A generated verification packet contains the claims,
only cited retrieved quotations, immutable source identities and extraction scope.
The serialized packet must fit the unchanged 48,000-character source limit;
packets that remain too large are declined before reservation or provider dispatch.
A review that cannot run, or whose learning request fails, has method `not-run`
and an explicit support-checking-unavailable gap, with any failure receipt
preserved. This is not a negative verdict about the source.
It is explicitly attributed as generated context, never a discovered primary
source or human note. Review receipts remain separate from lesson-generation
provenance and primary source descriptors. Unknown charges preserve the existing
accounting policy. Malformed review payloads retain their paid receipt but
cannot authorize lesson text.

A semantic verdict must name the exact claim once, give a nonempty bounded
reason and identify actual evidence within that claim's selected citations.
Supported lesson paragraphs retain only citations within the evidence IDs named
by their own validated assessment; the public reviews expose typed
`SupportAssessment[]`.
Citation shape, matching quotations, retriever scores and source venue do not
alone establish support. This separate model evaluation can still be wrong;
fixture checks do not establish model factuality or live teaching quality.
There is an optional non-billable external evaluator seam for an independently
provided assessment service, bounded to ten seconds; paid evaluations use the
existing learning service by default.

`scope: first-useful-step` explicitly limits the result. `sourced` means the
returned path steps and first lesson passed the configured checks without a
reported gap. `partial` retains supported work alongside gaps and can have a
path but no readable lesson. `coverage-pending` has no supported path/lesson.
These states never certify a finished curriculum or learner mastery. Exact
source evidence, AI explanation and AI-proposed activity have separate fields;
unsupported central text is withheld. Activity metadata explicitly says that
mastery has not been established.

## Trusted desktop adoption

The result carries the original request ID and stable opaque backend step IDs.
Its first lesson also carries an immutable generated `SourceRevisionInput`:
canonical supported text, SHA-256, a stable source identity, content-addressed
revision identity and generated attribution. Original source IDs/revisions,
quotes, offsets and original URLs are preserved separately. The backend performs
no local save, project selection, navigation, arbitrary file access or execution.

AR-37/AR-26 and composition must map backend identities to project-scoped local
UUIDs through trusted main-only acceptance, save exact acquired sources and the
generated lesson, preserve citation mappings, and check the original pending
request/project generation before adoption. Never resolve a late result against
whichever project happens to be selected. Remaining steps need explicit pending
lesson sources. The backend's immutable lesson revision is not proof that local
Reader/Canvas persistence or stale-project rejection has been exercised.

## Timing and acceptance limits

Responses measure retrieval, generation (including accounting), verification,
backend total and first-useful-backend milliseconds. The last field is null when
no readable supported lesson exists. Desktop loading and complete
request-to-first-useful-step are deliberately null: the backend cannot measure
those stages. The recorded target is 20,000 ms. A synthetic clock check validates
phase accounting; it is not a live latency result. Four sequential model calls
may miss the target and require measurement/optimization after connection.

Focused tests exercise the public API with the real learning/provider services
and synthetic external retrieval, model and ledger boundaries. The connected
AR-33/34/35 corpus journey, authenticated deployment, main-only adoption, live
quality/latency, Cursor recording, independent Fable review and hosted Sonar
remain separate acceptance gates. Under the latest September 9 founder
instruction, local `npm run check` is required; local Playwright, desktop
recordings/traces and local Sonar execution are prohibited. Cursor/macOS CI own
desktop acceptance, and Railway/GitHub own Sonar. Ready for review does not mean
those pending gates or the full ticket are accepted.

## Review follow-up and ownership

The coordinator authorized the two adjacent Fable fixes in `policy.ts` and
`learning.ts` under the existing `lane:backend` label (AR-36 comment
`58117fb5-f1da-4040-9c2a-243daf40495d`). The shared `PROMPT_VERSION` is now
`learning-v2-2026-09-09`, used by both accounting ledger rows and AI provenance.
A public API regression first observed the old version, then passed for both
content-generation and paid support-review receipts after the bump.
`LearningService.request` now declares `ProviderLearningRequest`; its optional
evidence context preserves existing callers while making the backend seam
explicit. The HTTP boundary still rejects client-supplied evidence context.
These ownership fixes do not authorize changes to other backend adapters,
HTTP/runtime composition, shared contracts or delivery gates.
