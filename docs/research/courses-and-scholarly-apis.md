# Open courses and scholarly APIs → what a curriculum spine and a prerequisite Map can actually read (2026-09-05)

Scope: what is machine-readable, per provider, from first-party docs and live probes made today. "Inspected" means I read the page HTML or a live API response, not a doc. Nothing here covers parsing (see `paper-parsing-2026.md`) or the product's own inference on top of these fields.

## (a) Summary

- **MIT OCW is the only open-course provider with a real data layer.** Every course and every resource page has a `data.json` sibling; lecture-video resources carry `video_files.video_captions_resources[].file` (WebVTT) and `video_transcript_resources[].file` (PDF) plus `video_metadata.youtube_id` and an `archive.org` MP4; whole-course ZIPs exist; the MIT Learn REST API indexes all ~9,200 OCW courses with topics, level, department, `course_feature` and instructors. Prerequisites are prose on the syllabus page, not a field. License CC BY-NC-SA 4.0 per resource.
- **Peers are HTML only.** Stanford SEE (9 courses, frozen): per-lecture HTML and PDF transcripts, MP4s, notes, an all-materials ZIP, CC BY-NC-SA 4.0. Open Yale: per-lecture HTML transcript with chapter headings and `[hh:mm:ss]` stamps, MP3, syllabus with texts inline, CC BY-NC-SA 3.0, no video download link on the page. Berkeley: public course captures were withdrawn in 2017 (CalNet-only). edX: catalog API requires approved partner credentials; MIT Open Learning Library is Open edX behind optional login, mixed licenses, no API. NPTEL: the SvelteKit page payload has structured `Prerequisites`, weekly `units[].lessons[]` with `youtube_id` and `vtt_url` (Google Drive ids), no license statement found.
- **OpenAlex** gives `referenced_works`, `related_works` (algorithmic), `cited_by_count`, `fwci`, `type` (25 values incl. `review` and `book`), `topics`/`primary_topic` (4-level hierarchy), `best_oa_location.pdf_url`, `abstract_inverted_index` (never plaintext), `has_content` + `content_url` for PDF/GROBID-XML download, `search.semantic`. Since Feb 2026 it is metered: $1/day free with a key, $0.10/day without (live: keyless requests still return 200 with `meta.cost_usd`).
- **Semantic Scholar** gives `references`/`citations` with `contexts`, `intents`, `isInfluential`; `publicationTypes` (13 values incl. `Review`, `MetaAnalysis`, `Book`, `BookSection`); `tldr`; `openAccessPdf{url,status,license}`; `textAvailability`; `embedding`; a Recommendations API (≤500 per call) and `/snippet/search` over full text. Free key at 1 req/s; the unauthenticated pool returned 429 on every Graph call during this session.
- **Neither API has a prerequisite, "foundational", or "textbook" relation.** Depth must be computed from citation direction, year, type and topic; textbooks appear only incidentally as `type:book` / `Book` records with thin metadata and no chapters.

## (b) MIT OpenCourseWare

Course used for inspection: 6.006 Spring 2020; older checks: 18.06 Spring 2010, 6.046J Fall 2005.

| Field | Available? | Format / where | Notes |
|---|---|---|---|
| Course record | yes | `https://ocw.mit.edu/courses/<slug>/data.json` | Keys: `course_title, course_description(_html), primary_course_number, extra_course_numbers, department_numbers, instructors[], learning_resource_types[], level[], term, year, topics[][]` (3-level path), `site_uid, legacy_uid`. No `license` at course level; no prerequisites. (inspected) |
| Course catalogue / search | yes | MIT Learn API `https://api.learn.mit.edu/api/v1/learning_resources/?platform=ocw` (9,176 results today), `learning_resources_search/`, `courses/`, `contentfiles/`, `topics/`, `departments/`; OpenAPI at `/api/v1/schema/` | Course fields: `readable_id` (`6.006+spring_2020`), `title, description, full_description, topics, ocw_topics, departments, course_feature[], license_cc (bool), runs[].{level, semester, year, instructors}`, `learning_resources/{id}/similar/` and `/vector_similar/`. No prerequisites field in the schema. Public, no key. (inspected; mitodl `ocw_oer_export` README documents using it) |
| Syllabus | HTML only | `/pages/syllabus/` | Sections with ids `prerequisites`, `textbooks`, grading; prerequisites are prose naming course numbers ("6.0001 … 6.042J …"). (inspected) |
| Prerequisites (structured) | **no** | — | Prose on syllabus page; MIT Learn schema has none. |
| Lecture list | yes | `/pages/lecture-videos/` links to `/resources/<lecture-slug>/`; each resource has `data.json` | Resource `data.json`: `title, resourcetype ("Video"), learning_resource_types, parent_title, license, uid, file_size, video_files{}, video_metadata{youtube_id, video_tags}`. (inspected) |
| Lecture video | yes | `video_files.archive_url` → archive.org MP4 (300k); `video_metadata.youtube_id` | Older courses point at `http://www.archive.org/download/MIT6.046JF05MPEG4/…220k.mp4`. (inspected) |
| Captions with timestamps | yes | `video_files.video_captions_resources[].file` → **WebVTT** (`WEBVTT`, `00:00:00.000 --> 00:00:01.479`), `language: "en"` | Present on 2020, 2010 and 2005 courses checked. (inspected) |
| Transcript | yes | `video_files.video_transcript_resources[].file` → **PDF** | Same three courses. (inspected) |
| Transcript text via MIT Learn | **no** | `contentfiles` rows of `content_type: video` have empty `content`; `content_file_search` returns PDF notes, not captions | (observed) |
| Readings | HTML only | syllabus / readings pages | 6.006 links CLRS to `mitpress.mit.edu` by ISBN; no structured citation, no DOI. (inspected) |
| Lecture notes, problem sets, exams | yes | PDFs and ZIPs listed on `/download/`; `learning_resource_types` enumerates which exist | e.g. `MIT6_006S20_ps1-template.zip`. (inspected) |
| Whole-course export | yes | `https://ocw.mit.edu/courses/<slug>/<course-number>-<term>-<year>.zip` (6.006: 40.9 MB, `application/zip`) linked as "Download Course" | (inspected via HEAD) |
| License | yes | `license` on every resource `data.json` and page footer: `https://creativecommons.org/licenses/by-nc-sa/4.0/` | |
| Bulk/legacy tooling | archived | mitodl `ocw-data-parser` (archived 2025-01-23), `ocw-to-hugo` (archived), `ocw-studio` and `ocw-hugo-themes` active (pushed 2026-09-05); GitHub org `ocw-data` does not exist (404) | (GitHub API) |

## (c) Peer providers

**Stanford Engineering Everywhere** (`see.stanford.edu`, inspected CS229)

| Field | Available? | Format | Notes |
|---|---|---|---|
| Course list | 9 courses | `/Course` links: CS106A, CS106B, CS107, CS223A, CS229, EE261, EE263, EE364A, EE364B | Frozen catalogue. |
| Syllabus / prerequisites | HTML prose | course page | "Prerequisites: - Knowledge of basic computer science principles…" |
| Lecture video | yes | `/videos/courses/see/CS229/CS229-lectureNN.mp4` | |
| Transcript | yes | `/materials/aimlcs229/transcripts/MachineLearning-LectureNN.html` and `.pdf` | No timestamps observed; HTML transcript. |
| Notes, problem sets, data | yes | PDFs, `PS1-data.zip`; `MachineLearningAllMaterials.zip` | |
| License | yes | `creativecommons.org/licenses/by-nc-sa/4.0/` on homepage | |
| API / JSON | **no** | — | |

**Open Yale Courses** (`oyc.yale.edu`, inspected ECON 159)

| Field | Available? | Format | Notes |
|---|---|---|---|
| Syllabus | HTML on course page | sections Description, Texts, Requirements, Grading, Sessions | Texts as plain strings ("A. Dixit and B. Nalebuff. Thinking Strategically, Norton 1991"); prerequisites in "Requirements" prose. |
| Lecture list | yes | `/economics/econ-159/lecture-N`, `exam-N` | |
| Transcript | yes | HTML on lecture page, chapter headings + `[00:02:16]` stamps per chapter | Not per-sentence; ~9 chapters per lecture. |
| Audio | yes | `/sites/default/files/courses/fall07/econ159/mp3/….mp3` | |
| Video | link only | `youtube.com/yale` channel; no MP4 link on lecture page | |
| Handouts | yes | PDFs (`blackboard01_0_0.pdf`) | |
| License | yes | Terms §4: CC BY-NC-SA 3.0 US; third-party content excluded | |
| API / bulk | **no** | — | |

**UC Berkeley webcasts** — public course captures ended: "Beginning March 15, 2017, access to iTunesU course content will be suspended", YouTube moved behind CalNet over 3–5 months; public sharing continues only "through our partnership with EdX". Nothing to read.

**edX / MIT Open Learning Library** — edX Course Catalog API requires an approved API-admin request and client id/secret; nothing public. MIT OLL: Open edX, "some courses without registering", licenses "All Rights Reserved, others Creative Commons, and some … mixed", no API or export documented.

**NPTEL** (`nptel.ac.in/courses/<id>`, inspected 106106184)

| Field | Available? | Format | Notes |
|---|---|---|---|
| Course facts | yes, embedded | SvelteKit payload: `Course ID, Duration, Credits, Level, Type, Language, Intended Audience, Prerequisites, Category` | `Prerequisites` is a structured label/value pair but prose value. |
| Lecture list | yes, embedded | `units[{name:"Week 1", lessons:[{name, youtube_id, concepts_covered:null, vtt_url:{English:<drive id>, Hindi:null…}}]}]` | `vtt_url` values look like Google Drive file ids; not verified as fetchable. |
| Video | YouTube | `youtube_id` | |
| Transcript / captions | VTT ids per language | see above | Older archive URLs (`archive.nptel.ac.in/courses/…`) 404 for this id. |
| Syllabus, books, assignments | tabs in SPA | not server-rendered | Unverified. |
| License | **not found** | — | No CC statement on the course page. |
| API | **none documented** | — | |

## (d) OpenAlex

Docs moved from `docs.openalex.org` (301) to `help.openalex.org`; OpenAPI at `help.openalex.org/openapi.json`. Live probe: `GET /works/W2741809807` without key → 200.

| Field | Available? | Format | Notes for spine / Map |
|---|---|---|---|
| `referenced_works` / `referenced_works_count` | yes | array of OpenAlex ids | Built by matching source reference lists (Crossref, PubMed) and OA PDFs; "can be shorter than the reference list printed in its PDF"; many Crossref records have no references. |
| `cited_by_count`, `counts_by_year`, `fwci`, `citation_normalized_percentile` | yes | ints / floats | Citations to the work; per-year counts back to work year. Citing-works list via `filter=cites:W…`. |
| `related_works` | yes | 10 ids | "computed algorithmically"; no semantics. |
| `type` | yes | 25 vocabulary values: `article, dataset, other, book-chapter, dissertation, conference-paper, preprint, book, paratext, conference-abstract, report, reference-entry, book-review, libguides, peer-review, editorial, software, review, supplementary-materials, erratum, letter, standard, retraction, data-paper, software-paper` | `type:review` = 1.05M works (0.3%). No survey flag beyond this. `type_crossref` was null on the probe. |
| `topics` / `primary_topic` | yes | up to 3, each with `score`, `subfield`, `field`, `domain` | ~4,500 topics, 4-level hierarchy; `keywords` derived from topics. `concepts` deprecated ("not actively maintaining"). |
| Abstract | inverted index only | `abstract_inverted_index` | "OpenAlex doesn't include plaintext abstracts due to legal constraints." No TL;DR. |
| OA location | yes | `open_access{is_oa, oa_status, oa_url}`, `best_oa_location{pdf_url, landing_page_url, license, version}`, `locations[]` | `pdf_url` was null on the probe even with `is_oa:true`. |
| Full text | yes, metered | `has_content{pdf, grobid_xml}` + `content_url`; `has_fulltext` filter | $10 per 1,000 downloads. |
| Search | yes | `search=`, `search.exact`, `search.semantic` (GTE-Large embeddings, ≤2,000 chars in, ≤50 results, 1 req/s) | Only one search parameter per request. |
| Recommendations | no endpoint | — | Use `related_works`. |
| Textbooks / course materials | incidental | `type:book` (9.5M) and `book-chapter` records | No chapters, no course link. |
| Auth / limits | key optional | free key at `openalex.org/settings/api`; 100 req/s cap; 100 results/page; 10,000 basic-paging limit; cursor for more | Pricing (Feb 2026): single entity $0; list/filter $0.0001; search / semantic $0.001; PDF/XML $0.01 per call. Free $1/day with key, $0.10/day without; `mailto` no longer an auth method. Blog says "you'll need an API key for all requests"; the help page and live API say keyless basic use works — treat the key as required in practice. |

## (e) Semantic Scholar Graph API

Source: `api.semanticscholar.org/graph/v1/swagger.json` and `recommendations/v1/swagger.json`; live probes.

| Field | Available? | Format | Notes for spine / Map |
|---|---|---|---|
| `references` / `citations` | yes | `/paper/{id}/references` and `/citations`, `limit ≤ 1000`, each with `contexts[]`, `intents[]` (`background, methodology, result`), `contextsWithIntent`, `isInfluential`, nested `citedPaper`/`citingPaper` | Live: Attention-Is-All-You-Need references returned with contexts. Bulk search returns no nested references. |
| `citationCount`, `referenceCount`, `influentialCitationCount` | yes | ints | |
| `publicationTypes` | yes | array; filter values `Review, JournalArticle, CaseReport, ClinicalTrial, Conference, Dataset, Editorial, LettersAndComments, MetaAnalysis, News, Study, Book, BookSection` | Only survey signal; a paper can carry several. |
| `tldr` | yes | `{model, text}` | Only on `/paper/{id}` and batch, not on search results. |
| `abstract` | yes | plaintext when licensed | `textAvailability ∈ {fulltext, abstract, none}` tells you what S2 holds. |
| `openAccessPdf` | yes | `{url, status, license, disclaimer}` | Live: arXiv paper returned empty `url` with a disclaimer pointing at arxiv.org. |
| `fieldsOfStudy`, `s2FieldsOfStudy` | yes | flat category lists (23 fields) | No hierarchy comparable to OpenAlex topics. |
| `embedding` | yes | SPECTER v1/v2 vectors | For similarity, not depth. |
| Recommendations | yes | `POST /recommendations/v1/papers/` (positive/negative ids) and `GET /papers/forpaper/{id}`; `limit ≤ 500`; `from=recent|all-cs` | Live: worked unauthenticated. |
| Full-text search | yes | `/snippet/search` (~500-word snippets from title, abstract, body; `limit ≤ 1000`) | |
| Bulk | yes | `/paper/search/bulk` 1,000 per page, token paging, ≤10M results; `/paper/batch` (POST ids); Datasets API releases (latest `2026-09-01`) — full download needs a key | |
| Textbooks / course materials | incidental | `publicationTypes: Book` | No chapters, no courses. |
| Auth / limits | key recommended | "1000 requests per second shared among all unauthenticated users"; key = 1 req/s introductory | Live: every unauthenticated Graph call in this session returned 429 ("apply for a key"); Recommendations did not. Release notes discontinued Nov 2024 (repo archived 2025-01-27). |

## (f) What the surface must not promise

1. **No prerequisite relation anywhere.** OCW's `data.json` and MIT Learn schema have no prerequisites field; SEE, Yale and NPTEL give prose. OpenAlex has `referenced_works`/`related_works`; S2 has `references`/`citations` with intents (`background`/`methodology`/`result`), which is the closest signal and is still not "you need X before Y". The Map's depth axis is a product inference — say so in the UI.
2. **"Survey" detection is a type tag, not a guarantee.** OpenAlex `type:review` covers 0.3% of works; S2 `publicationTypes` includes `Review`/`MetaAnalysis`. Many surveys are typed `article`. Don't promise "all surveys in the field".
3. **Citation graphs are incomplete by design.** OpenAlex: unmatched references dropped, many Crossref records carry no references. S2: counts differ from OpenAlex. Don't show exact-looking counts as authoritative.
4. **No plaintext abstract from OpenAlex; no TL;DR from OpenAlex; S2 TL;DR only for papers S2 has text for.**
5. **OA full text is a URL, not a file.** `pdf_url` can be null on an OA work; S2 `openAccessPdf.url` can be empty. OpenAlex PDF/TEI download costs $0.01 each.
6. **Transcripts.** OCW: VTT + PDF present on every course checked back to 2005, but neither is exposed as text through MIT Learn — fetch the VTT. Yale: chapter-level timestamps only. SEE: no timestamps. NPTEL: unverified Drive ids. Berkeley: none. Never promise sentence-level timing outside OCW VTT.
7. **Readings do not link to sources.** OCW/Yale/SEE list textbooks as strings (ISBN at best); no DOI, no OpenAlex/S2 id. Book→paper linking is on us.
8. **No course-to-paper bridge exists in either API**; neither exposes course materials or textbook chapters.
9. **Licensing.** OCW and SEE are CC BY-NC-SA 4.0, Yale 3.0 US with third-party carve-outs; NPTEL and MIT OLL are unclear/mixed. NC applies to redistribution of the materials, so cache transcripts locally, don't republish.
10. **Quotas are real.** OpenAlex $1/day free (≈1,000 searches or 10,000 list calls); S2 1 req/s per key and effectively no anonymous access. Batch and cache; per-keystroke search against either is out.

## (g) Sources

OpenAlex
- Authentication — https://help.openalex.org/api/authentication/
- Pricing — https://help.openalex.org/hc/en-us/articles/24397762024087-Pricing ; example costs https://help.openalex.org/access/example-costs/
- Usage-based pricing announcement (2026-02-24) — https://blog.openalex.org/openalex-api-new-features-and-usage-based-pricing/
- Works, citations, corpus — https://help.openalex.org/data/works/ ; https://help.openalex.org/data/works/citations/ ; https://help.openalex.org/data/works/corpus/
- Deprecations (concepts, /text) — https://help.openalex.org/api/deprecations/ ; semantic search https://help.openalex.org/api/semantic-search/ ; endpoints https://help.openalex.org/api/endpoints/
- OpenAPI — https://help.openalex.org/openapi.json ; live probes https://api.openalex.org/works/W2741809807 , https://api.openalex.org/work-types , https://api.openalex.org/works?group_by=type
- Old docs redirect — https://docs.openalex.org/api-entities/works/work-object (301 → help.openalex.org)

Semantic Scholar
- Graph API swagger — https://api.semanticscholar.org/graph/v1/swagger.json ; docs UI https://api.semanticscholar.org/api-docs/graph
- Recommendations swagger — https://api.semanticscholar.org/recommendations/v1/swagger.json
- Datasets — https://api.semanticscholar.org/datasets/v1/swagger.json ; https://api.semanticscholar.org/datasets/v1/release/latest
- Rate limits and keys — https://www.semanticscholar.org/product/api
- Release notes (discontinued) — https://github.com/allenai/s2-folks/blob/main/API_RELEASE_NOTES.md
- Live probes — `/graph/v1/paper/arXiv:1706.03762/references?fields=contexts,intents,isInfluential` (200); `/graph/v1/paper/arXiv:1706.03762?fields=…` (429 ×3); `/recommendations/v1/papers/forpaper/arXiv:1706.03762` (200)

MIT OCW
- Course and resource JSON — https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/data.json ; https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/resources/lecture-1-algorithms-and-computation/data.json ; 6.046J 2005 and 18.06 2010 resource `data.json`
- Pages inspected — syllabus, lecture-videos, download (`…/6.006-spring-2020.zip`), VTT `…/dd0823c3851b5df3a7e0b447eaa76050_ZA-tUyM_y7s.vtt`
- MIT Learn API — https://api.learn.mit.edu/api/v1/schema/ ; https://api.learn.mit.edu/api/v1/learning_resources/?platform=ocw ; `/learning_resources/4345/contentfiles/` ; `/content_file_search/`
- GitHub — https://api.github.com/orgs/mitodl/repos ; https://raw.githubusercontent.com/mitodl/ocw_oer_export/main/README.md ; https://api.github.com/orgs/ocw-data (404)

Peers
- Stanford SEE — https://see.stanford.edu/ ; https://see.stanford.edu/Course ; https://see.stanford.edu/Course/CS229
- Open Yale — https://oyc.yale.edu/ ; https://oyc.yale.edu/terms ; https://oyc.yale.edu/economics/econ-159 ; https://oyc.yale.edu/economics/econ-159/lecture-1
- Berkeley — http://news.berkeley.edu/2017/03/01/course-capture/
- edX — https://course-catalog-api-guide.readthedocs.io/en/latest/authentication/ ; MIT OLL https://openlearninglibrary.mit.edu/about
- NPTEL — https://nptel.ac.in/courses ; https://nptel.ac.in/courses/106106184
