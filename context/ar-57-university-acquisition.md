# AR-57 university acquisition checkpoint

Disjoint backend lane. Owned paths are `src/backend/university-acquisition/**`
and this page. Shared contracts, `src/backend/sourcing/**`, HTTP/runtime/config,
desktop processes, schema, lockfile, CI, and other context pages were not
edited.

This checkpoint is **extraction-ready**, not production indexed. No embeddings,
provider calls, crawls, retrieval queries, video downloads, or desktop wiring
were performed. BCcampus is out of this delivery.

## What a learner can do after later composition

Discover Stanford CS229/CS231n, Berkeley CS61A, Harvard CS50x/AI/P, plus MIT
and TU Delft extraction-ready lessons. Open official course, notes, and YouTube
lecture pages immediately. Retrieve canonical passages later from pinned MIT
Pluto, Delft MyST, and the Stanford CS231n HTML case study.

## Implemented module

`universityCatalogSources()` returns `MetadataOnlySource[]` for root’s trusted
catalog composition. Course and lecture rows use `curated-catalog` identities,
learner-facing `metadataSummary` topic text, and `lecture-of-course` /
`chapter-of-course` relationships. Directory rows are reading/playback only:
indexing stays unknown and `acquisitionLocation` is null.

`acquireUniversitySource` admits pinned bytes through an injected
`UniversityByteTransport`, then runs network-free parsers:

- MIT Abstraction: Pluto static cells, dual CC BY-SA / MIT attribution.
- TU Delft quantization slice: MyST lines 52–128 plus footnote 6.
- Stanford CS231n neural-networks case study: existing
  `canonicalizeSourceBytes` + `createParse5TreeAdapter({ parse })`. Publisher
  HTML snapshot 2026-09-09 (56638 bytes); MIT license from the notes repo.
  Complete canonical text is 17405 characters, under the 48000-character
  learning bound, so no section split. Coverage is partial (figures omitted).
  Python/NumPy is source text, not executed output. Not a git commit.

Pinned Cloud re-fetch:

| Asset                                                             | Bytes  | SHA-256                                                            | Fetched              |
| ----------------------------------------------------------------- | ------ | ------------------------------------------------------------------ | -------------------- |
| MIT `abstraction.jl` @ `78f1369deaa1994515e88bb164cc07a94d12f7bd` | 24463  | `de5547cb64a7bb0e7e860189d9116f4e036bba9816a727c91be28e820f84c1e4` | 2026-09-09           |
| MIT `LICENSE.md`                                                  | 308    | `a4576a2e28d3c1db63c68c8d1878f073e725b8607a2dfb2aae4b37abf37a5b29` | 2026-09-09           |
| Delft `introduction.md` @ `f7170416…`                             | 120676 | `0554cb267322bfb6034bcbad4c1993d8a6df1502eb05bd794bc915891d1b71da` | 2026-09-09           |
| Delft `credits.md`                                                | 3790   | `82409edafc57a671a893f440b1058fc6f1a97e0d72e943952a64cb63c8d5c802` | 2026-09-09           |
| CS231n HTML `neural-networks-case-study/`                         | 56638  | `fe03b0231a9dd7a70ab6fcf1f00d0e1035d8996b12e2bb341c3c9e2901b4820c` | 2026-09-09T10:11:57Z |
| CS231n `LICENSE` (Andrej Karpathy, 2015, MIT)                     | 1082   | `85b365f07b4cfc5d678c548bc41965bc3bc782106b8903bd3b876d9d49a4270d` | 2026-09-09T10:11:57Z |

Stanford candidate id: `univ_stan_cs231n_nncs`.

## Callable composition signatures

```ts
universityCatalogSources(): readonly MetadataOnlySource[]

createGuardedUniversityTransport(
  http: GuardedHttpsClient,
): UniversityByteTransport

acquireUniversitySource(options: {
  candidateId: string;
  transport: UniversityByteTransport;
  signal: AbortSignal;
  clock: { now(): Date };
}): Promise<UniversityExtractionResult>

toAcquiredSource(
  result: Extract<UniversityExtractionResult, { outcome: 'extraction-ready' }>,
  indexing:
    | { status: 'permitted'; basis: 'license'; evidenceUrl: string }
    | { status: 'unknown'; reason: string },
): AcquiredSource

canonicalRevisionFromExtraction(
  result: Extract<UniversityExtractionResult, { outcome: 'extraction-ready' }>,
): AcquiredCanonicalSourceRevision

sourcePassagesFromExtraction(
  result: Extract<UniversityExtractionResult, { outcome: 'extraction-ready' }>,
): readonly SourcePassage[]
```

Happy-path acquire ids: `univ_mit_ct_abstr`, `univ_tudelft_qm_em`,
`univ_stan_cs231n_nncs`. Catalog includes those plus Stanford/Berkeley/Harvard
course and lecture rows. Indexing remains unknown/`not-indexed` until root
sets a producer grant.

## Minimal shared integration request (coordinator lease)

1. Concatenate `universityCatalogSources()` into trusted `catalogSources`.
   Do not append these rows to the PSF `CURATED_SOURCE_MANIFEST`.
2. Guarded MIME union still needed for Markdown/Julia bytes; GitHub Pages
   CS231n HTML is already `text/html`.
3. HTML extractor table/MathML repair remains a shared `canonicalize.ts`
   issue; AR-57 reuses it as-is.
4. Dual-license MIT Computational Thinking attribution still needs a
   downstream mapping; CS231n notes are a single MIT grant.
5. Harvard CS50 rows are CC BY-NC-SA 4.0: reading/playback only, not corpus
   indexing. Composing Programs HTML can be a later acquire; not in this PR.
6. Remaining embedding budget 249996 microUSD is coordinator-owned.

## Known gaps

- Directory YouTube/course pages are not downloaded or transcribed.
- 2026 CS231n on-campus recordings are restricted; catalog uses the public
  2025 Stanford Online lecture.
- Production HTTP composition, persistence, turbopuffer, Qwen, Reader, and
  course generation are out of this PR.
