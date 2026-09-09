# Corpus acquisition checkpoint — AR-33

This is the independently usable acquisition checkpoint recovered from
`a6127866054e7894facd9327a359b1bd412c6c31`, with TDD repairs against the
reviewed sourcing contracts on main `94340203891406d012028d4762ae15fbfe04e04a`.
It does not establish acceptance of the connected sourced-learning journey.

## Public operations

- `SourceAcquisitionAdapter.acquire` accepts a validated acquisition request,
  a **backend-owned** metadata descriptor and an AbortSignal. Descriptors and
  their permission evidence must come from the trusted catalog/discovery
  authority; a client cannot self-authorize acquisition or indexing.
- `createGuardedHttpsClient` supplies real Node DNS and HTTPS adapters. DNS
  answers and each redirect are checked before connecting, and the chosen
  public address is pinned into the actual TLS request. TLS hostname
  verification remains enabled. No cookies, authorization headers or provider
  keys are supplied.
- `curatedSourceDescriptor` exposes the operator-reviewed manifest entry as a
  metadata-only source with license evidence and its textbook relationship.
- `ingestCuratedSource` acquires that entry and checks the final URL, source
  length/hash, canonical hash, canonicalization version, parser method and
  extraction coverage against the manifest. `manifest-mismatch` returns no
  source text or passages. An edition change requires an explicit manifest
  review; it cannot silently replace the pinned source.
- `reconcileCorpusRevision`, `tombstoneCorpusRevision` and
  `activeCorpusPassages` return immutable, serializable corpus snapshots. An
  identical re-ingest retains the first revision; source/parser/content
  changes have distinct revision identities. Tombstones survive ordinary
  re-ingestion and exclude passages without destroying historical text.

`AcquisitionAdapterResult` adds local `unsupported`, `malformed-content` and
`invalid-source` outcomes to the shared acquisition contract. The composition
owner must map those to the existing public failure envelope; no shared wire
contract, HTTP route, SQLite schema or Reader component changes here.

## Bounds, provenance and eligibility

Acquisition permits HTTPS on port 443 with no userinfo, fragment, recognized
credential query parameters or private/local target. It rejects mixed
public/private DNS answers and validates redirect destinations independently.
One operation permits at most three redirects, 512,000 compressed bytes,
1,000,000 decompressed bytes and 12 seconds. Only HTTP 200 is acquired;
unsolicited ranges, truncated bodies, unsupported MIME/charset/encoding and
corrupt compression fail explicitly. Node's stream pipeline propagates errors,
interruption and resource cleanup. There are no retries or executable loads.

Supported formats are strict UTF-8 plain text and structured HTML through
production-pinned `parse5@8.0.1` (MIT). NUL-containing bytes and malformed UTF-8
are rejected. HTML parsing runs no scripts, follows no embedded links and
chooses the main/article/body reading subtree. It preserves preformatted code,
normalizes rendered-flow whitespace and partitions meaningful sections. The
canonical source is acquired primary text, never an AI summary.

Passages use exact UTF-16 spans with scalar-safe boundaries, deterministic
identities, section labels and a 2,000-unit maximum. Overlap is deliberately
zero. The original canonical source is authoritative for every quote. Code
and mathematical notation already represented as ordinary text remain text.
PDFs, page/timestamp extraction and lossless MathML extraction are unsupported
in this checkpoint. Omitted MathML/visual/media content is reported as partial;
it is not flattened into purportedly complete primary text. Larger-section
chunking is not an equation-aware parser and must not be described as one.

Acquisition and indexing decisions remain separate. Permitted reading text
can be returned with **no index passages** when indexing permission is absent.
Unknown/forbidden acquisition performs no network work; the caller retains
its metadata-only descriptor for discovery/navigation. Freely readable links,
MIT OCW and non-commercial/third-party material are not promoted to eligible
corpus text by accessibility alone. The current manifest contains one reviewed
Python chapter, not a fixed curriculum or a broad commercial-index license.

## Permitted real source

The existing single-page Python 3.14.7 capture and full license capture are
preserved with exact bytes in
`src/backend/sourcing/corpus/fixtures/`. Their README retains the PSF copyright,
license agreement location, origin, hashes and canonicalization change
summary. [Official Python license terms](https://docs.python.org/3.14/license.html)
were rechecked on September 9, 2026 UTC. No other publisher's rights are inferred.

The captured HTML produces 11,843 canonical UTF-16 units and seven passages.
The test traverses the manifest descriptor, guarded transport boundary, real
parse5 parser, canonicalizer, passage generation, revision reconciliation and
removal. Only the transport response is replayed; the content is the real
permitted capture. This is not a live vector-index upload.

A fresh acquisition through the real Node DNS/HTTPS adapter succeeded at
`2026-09-09T01:01:45.815Z`. It matched the captured 44,964 source bytes and
canonical hash exactly, with zero redirects and seven exact passages. The
[live receipt](corpus-acquisition-receipt.json) records the revision identity,
parser method and zero provider/storage/embedding spend. The single public
document fetch is live evidence; persistence, index upload and desktop
adoption remain unverified.

Local Node 24.19.0 verification passed `npm run check` with 852 tests in 78
files and 93.94% statements, 90.16% branches, 96% functions and 95.56% lines.
The 88 acquisition/corpus tests include the real captured source. TDD repairs
first reproduced unauthorized indexing passages, cross-source revision-id
collision, parser-version reconciliation, generated-source acceptance, missing
default HTML parsing, NUL content, unsolicited partial responses, an uncaught
compressed-stream error, manifest mismatch, truncated content, unsupported API
version, MathML flattening and credential query parameters.

The macOS `npm run test:e2e` command exited zero for its ten-test suite. Nine
tests completed successfully; the auth lifecycle failure is explicitly marked
as expected in the unchanged baseline under AR-40. This does not establish a
successful sign-in lifecycle. AR-40's repair is PR #23. Packaging configuration
is unchanged, so local packaging checks are not applicable to this recovery;
the repository's required remote CI gates remain intact.

## Integration dependencies and acceptance limits

The recovered checkpoint's handoff leaves persistence/job composition with
integration. These pure snapshots are **not durable storage**. Backend
manifest/job persistence, resumable item checkpoints, current-policy revocation
against an already populated index, vector upload/deletion (AR-34), and trusted
desktop adoption (AR-37) must be connected by their owners. No new job framework,
database schema or backend composition is introduced in this recovery lane.

Full AR-33 acceptance still requires those real producer integrations, an
actually populated index, macOS checks, a serialized integrated Sonar scan,
Cursor's recorded journey and an independent Fable 5.1 verdict. The local
Sonar server refused connections at the initial check in this run; no scan
success is claimed. Revision-specific local results and outstanding gates are
recorded in the AR-33 PR. The dispatcher owns Linear transitions and readiness;
the author does not mark incomplete or fixture-only work Done.
