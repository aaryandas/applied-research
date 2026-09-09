# AR-57 university acquisition checkpoint

Disjoint backend lane. Owned paths are `src/backend/university-acquisition/**`
and this page. Shared contracts, `src/backend/sourcing/**`, HTTP/runtime/config,
desktop processes, schema, lockfile, CI, and other context pages were not
edited.

This checkpoint is **extraction-ready**, not production indexed. No embeddings,
provider calls, crawls, or desktop wiring were performed.

## What a learner can do after later composition

Discover the reviewed MIT Computational Thinking abstraction lesson and the TU
Delft quantization slice, inspect original URLs/commits, and retrieve
canonical passages that preserve Markdown, TeX, code whitespace, and tables.
BCcampus SQL remains an honest acquisition-pending directory row. MIT 6.100L,
Yale PHYS 200, and CMU OLI psychology are factual external-reading links, not
passage evidence. The independently licensed MIT computational-thinking
repository is a positive full-text route; general OCW is not blanket-blocked
and is not blanket-indexed.

## Implemented module

`acquireUniversitySource` admits pinned bytes through an injected
`UniversityByteTransport`, then runs network-free parsers:

- Candidate metadata, source-owned rights, acquired bytes, extraction-ready
  canonical text, and `not-indexed` stay separate fields.
- Exact source and license SHA-256 values must match a pinned reviewed entry
  before extraction. Renderer/client identity cannot mint permission or hashes.
- Transport wraps existing `GuardedHttpsClient`. Parsers never fetch.
- Pluto selection follows the terminal Cell-order list. Static Markdown and
  literal code are kept with UUID/line/byte locators. Widgets, interpolation,
  macros, TOML, downloads, YouTube, and images are gaps. Cells are not
  evaluated.
- MyST selection for Delft is original lines 52–128 plus footnote 6. TeX,
  labels, code, and tables are preserved. Unknown directives, interpolation,
  and media are gaps.
- Attribution retains dual MIT text/code licenses, ShareAlike export
  obligations, authors, commit, URLs, license evidence hashes, exceptions, and
  the transformation summary. A public single-license descriptor is a lossy
  mapping only; keep `AttributionRecord` downstream.
- `toRetrieveEvidenceResponse` validates exact UTF-16 quotes through the
  existing `parseRetrieveEvidenceResponse` seam. It does not write vectors.
  `provider: turbopuffer` is required by the current shared union, not proof of
  a live index. Ranking method is `exact-canonical-offset-handoff`.

Pinned Cloud re-fetch (9 September 2026 UTC):

| Asset                                                                | Bytes  | SHA-256                                                            |
| -------------------------------------------------------------------- | ------ | ------------------------------------------------------------------ |
| MIT `abstraction.jl` @ `78f1369deaa1994515e88bb164cc07a94d12f7bd`    | 24463  | `de5547cb64a7bb0e7e860189d9116f4e036bba9816a727c91be28e820f84c1e4` |
| MIT `LICENSE.md`                                                     | 308    | `a4576a2e28d3c1db63c68c8d1878f073e725b8607a2dfb2aae4b37abf37a5b29` |
| Delft `introduction.md` @ `f7170416f82825c81bd482820f9f5530ab6f3930` | 120676 | `0554cb267322bfb6034bcbad4c1993d8a6df1502eb05bd794bc915891d1b71da` |
| Delft `credits.md`                                                   | 3790   | `82409edafc57a671a893f440b1058fc6f1a97e0d72e943952a64cb63c8d5c802` |
| Delft `_config.yml` (copyright evidence only)                        | 4853   | `16c9f07d98b93cf49c7bdc45aec049608ef6c2bc8c2f04a7fb40808208ff1c66` |

BCcampus original URL returned HTTP 403 Cloudflare (`cf-mitigated: challenge`).
Challenge HTML was not stored or hashed. No canonical edition exists.

## Minimal shared integration request (coordinator lease)

Do not merge these here. Exact patches for later shared owners:

1. **Guarded MIME union** (`src/backend/sourcing/acquisition/guarded-http.ts`
   `supportedMediaType` / `GuardedFetchResult.mediaType` and
   `AcquisitionReceipt.mediaType`): allow reviewed `text/markdown` and
   `text/x-julia` in addition to `text/plain` and `text/html`, still after
   charset UTF-8 checks. GitHub/GitLab currently serve these snapshots as
   `text/plain`, which this lane accepts as **bytes only**. Do not run
   `canonicalizeSourceBytes` on a Pluto notebook as a complete `text/plain`
   lesson.

2. **HTML extractor repair** (`canonicalize.ts`, do not treat as done): `tr`
   cells concatenate column text without separators; `math`/`MathML` are
   dropped. Required repair is cell delimiters for `th`/`td` and TeX/MathML
   annotation extraction instead of omitting `math`. AR-57 did not edit that
   file.

3. **Attribution handoff**: `SourceUsePolicy.license` is one SPDX row. Map
   `AttributionRecord.licenseComponents[]` through composition so CC BY-SA text
   and MIT code, exceptions, and export obligations survive Reader/export.
   This lane does not integrate Reader or export.

4. **Retrieval provider union**: add an exact-canonical handoff provider or
   document that `turbopuffer` plus
   `rankingMethod: exact-canonical-offset-handoff` is temporary. Do not treat
   handoff evidence as an ANN hit.

5. **Indexing grant**: composition may set indexing `permitted` only after
   this extraction-ready result, current rights, and the remaining 249996
   microUSD embedding gate. Do not append MIT/Delft/BCcampus rows to the PSF
   `CURATED_SOURCE_MANIFEST`.

6. **Locator position**: optional `PassageLocator.position` cell/line/byte
   variant. Sidecar `SourceLocator` already stores those fields.

7. **Lane guard / code map**: add `src/backend/university-acquisition/**` if
   a future lane split requires it. `lane:backend` already covers
   `src/backend/**`.

## Known gaps

- BCcampus original bytes are unavailable in Cloud; SQL whitespace acceptance
  waits on a real 200 of the public chapter.
- Pluto/MyST parsers are bounded scanners, not a universal Markdown engine.
- Production HTTP composition, persistence, turbopuffer upload, Qwen
  embeddings, Reader, and course generation are out of this PR.
- Delft published HTML may still contain TeX as ordinary text; this snapshot
  is GitLab Markdown, not those HTML bytes.
- No Fable, local Mac QA, local Sonar, or paid corpus spend.
