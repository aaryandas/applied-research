# Evidence selection — AR-35

`src/backend/sourcing/retrieval/selection.ts` exports the backend-only, synchronous
`selectEvidence(request, signal?)` seam. It consumes the frozen AR-30 source and
retrieval contracts at base `94340203891406d012028d4762ae15fbfe04e04a`. Both learning
and research callers use this same policy. It is not yet composed into an HTTP
route, learning generation, or the desktop. Existing shared contracts and
consumers are unchanged.

## Inputs and authority

Composition supplies an account-authorized candidate set, completed keyword and
vector transport responses for the same query/request/intent, explicit necessary
concepts and their vocabulary, a source/passage budget, optional excluded source
IDs, and any discovery/acquisition issues. Each concept is marked goal or
prerequisite. Terms may contain caller-supplied paraphrases; this module does not
rewrite queries, infer a curriculum, call a model, or spend provider budget.

Optional `SourceAssessment` records carry an assessor and rationale, depth,
research role, publication status, foundational relevance, and acquired text
scope. These are trusted, attributed backend policy inputs, not renderer fields
or an interpretation of an embedding score. The frozen contract does not supply
these assessments automatically. Missing assessments stay unknown. Real adapter
status evidence and reviewed assessments must be supplied at composition;
synthetic assessments in tests do not establish a production evaluator.

Candidates are revalidated through the existing discovery/acquisition parsers.
Acquired text must match its hash, identity, title, location, permission and
provenance. Retrieval hits are independently revalidated through AR-30's exact
canonical-passage parser, including the four-part revision identity, requested
query/intent, current indexing permission, SHA-256, exact UTF-16 quote and Unicode
boundaries. A bad hit cannot discard another provider/channel's useful hit.
Conflicting indexing permissions on duplicate acquired identities deny citation;
conflicting text-scope assessments yield unknown scope.

## Deterministic policy

Stable source IDs, provider IDs, normalized DOI, and the arXiv work ID without its
version suffix form transitive duplicate groups. Titles alone never merge works.
All original descriptors, provider provenance, exact arXiv versions and acquired
revision identities remain in `versions`; no permission or canonical identity is
copied from a different version. Retraction or a caller exclusion applies to the
whole duplicate group. Within a group, usable body passages take precedence over
abstract-only passages, then acquired content, then catalog metadata. One
representative version is selected for citation.

Tokenized query overlap and explicit concept vocabulary supply lexical fit.
Validated keyword/vector hits can also nominate a candidate without shared title
words. The base weights are deliberately inspectable policy, not calibrated
quality estimates: query overlap 10, concept fit 4, learning prerequisite fit 5,
explanatory source kind 3, acquired deep material 2 or introductory material 1,
primary study/methods 3, survey context 1, foundational relevance 2, and status
concern -4. A caller-selected recency cutoff adds 1 for research; it never removes
older work. A usable body section adds 2. Retrieval relevance adds 10 times the
best exact-passage fusion score. Every base contribution is returned in `signals`.

Fusion uses equal-weight reciprocal ranks, `sum(1 / (60 + rank))`, over keyword
and vector channels. Each exact passage contributes at most once per channel;
repeated rows cannot inflate its score. The raw retrieval observations, identities,
quality labels and provenance are retained separately. Raw similarities and
provider quality labels are not adopted as source quality. Source quality remains
`unknown`; these ranking signals do not establish factuality, venue authority,
open-access quality, or independent corroboration.

Greedy source selection rewards newly represented concepts (16), newly supported
body concepts (16), source kinds
(2), and known research roles for research intent (3). It records the diversity
reasons separately from the base score. Passage selection prioritizes missing
concept coverage, then another source, then fused rank with stable identity tie
breaks. The result is bounded by the requested source and passage budgets.

## Coverage and failure semantics

Only selected, permitted, acquired, exactly resolved body passages whose text
matches explicit concept vocabulary fill a concept gap. This is a deterministic
vocabulary-coverage criterion, not proof that a passage adequately explains or
substantiates a concept. A vector match can nominate a source without filling a
gap. Abstract and unknown-scope passages retain `abstract-only` or `unknown-scope`
labels and fill no body-coverage gaps. Body evidence is also `passage-only`; it
never authorizes full-paper conclusions. Partial extraction provenance remains
attached to its immutable revision.

`success` means every requested concept has a selected body-text vocabulary match
and no reported upstream/validation/interruption issue. `partial` preserves useful
candidates/passages with explicit missing concept IDs and issues. `no-evidence`
means no candidate was selected, with the same explicit gaps and issues. Catalog
suggestions with no acquired passages therefore return `partial`.

This service performs no I/O, retries, or asynchronous waits. Limits are 50
candidates, 32 concepts, eight bounded terms per concept, one response per channel,
and 50 hits per response. Invalid caller budgets/configuration throw the existing
typed `SourcingContractValidationError`. A pre-aborted signal records cancellation
while preserving already completed results. Adapter/composition owners retain
responsibility for actual request cancellation, finite provider timeouts/retries,
account/indexing authority, and stopping new I/O after abort.

## Relevance review and acceptance boundary

The adjacent public-seam tests cover exact terminology, explicit conceptual
paraphrases and vector-only matches, prerequisite learning, specialized methods,
older seminal work, retraction and unknown status, provider/version duplication,
exclusion, source/role diversity, abstract scope, forged evidence, uncovered
concepts, and useful partial results after provider failure/cancellation.

These are **AI-authored synthetic fixtures**, attributable to this implementation,
not a human-authored or independently reviewed relevance benchmark. Proposed
review criteria are: explanatory/prerequisite material wins for learning;
question-relevant primary/methods material plus survey context wins for research;
useful foundations survive age; duplicates do not occupy extra source slots;
forbidden, excluded, unacquired or unresolved passages are never cited; and a
missing body passage leaves an explicit gap. Human-authored queries and review of
these relevance/coverage criteria remain acceptance work. No quality improvement
or actual corpus/provider evaluation is claimed; real evaluation belongs to AR-38.

AR-31, AR-32, AR-33 and AR-34 producer integration, coordinator composition,
connected desktop acceptance, Cursor recording, independent Fable 5.1 review and
the hosted Sonar/CI gates remain required. Passing deterministic
fixtures is an implementation checkpoint, not full AR-35 acceptance.

## Current delivery verification

The latest founder recovery instructions supersede the older local desktop and
Sonar workflow: run focused unit TDD and `npm run check` locally. Cursor cloud
owns targeted Playwright checks and hands-on recording; blocking macOS GitHub CI
owns full desktop verification; Railway and GitHub runners own hosted Sonar.
No local desktop tests, video/trace capture, Sonar server or scanner are run for
this recovery. Remote evidence is pending until the exact revision is verified,
not waived or treated as a local failure.
