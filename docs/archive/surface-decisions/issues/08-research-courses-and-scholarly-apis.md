# 08 · Research: what open courses and scholarly APIs expose to a curriculum surface
Type: research
Status: resolved
Blocked by: —

## Question
For MIT OpenCourseWare and peer open-course sites (Stanford Online, Berkeley, Open Yale, edX open content), what is machine-readable per first-party docs or page structure: syllabus, lecture list, lecture video with transcripts and timestamps, readings and their sources, problem sets, stated prerequisites, license? For OpenAlex and Semantic Scholar, which fields support a curriculum and a prerequisite-depth map: concepts/topics, referenced and related works, citation counts, survey or review detection, open-access full text, TL;DR? What is *not* available that the Map and curriculum surfaces must therefore not promise?

## Output
`docs/research/courses-and-scholarly-apis.md`, primary sources only (API docs, site source), one table per provider.

## Answer
Findings: `docs/research/courses-and-scholarly-apis.md` (2026-09-05, primary sources and live API calls; one table per provider).

- **MIT OpenCourseWare is the only open-course provider with a data layer.** Every course and resource page has a `data.json` sibling; lecture resources expose timestamped WebVTT captions, a PDF transcript, a YouTube id, and an archive.org MP4, present back to 2005; whole-course ZIPs exist; the MIT Learn API indexes about 9,200 courses with topics, level, and features, without a key. There is **no prerequisites field** anywhere, and transcript text is not in the Learn API.
- **Peers are HTML only.** Stanford SEE: nine frozen courses, HTML and PDF transcripts, MP4, CC BY-NC-SA. Open Yale: HTML transcript with chapter-level timestamps, MP3, CC BY-NC-SA. Berkeley withdrew public captures in 2017. edX's catalog API needs partner credentials. NPTEL exposes structured prerequisites and per-lesson video and VTT URLs but states no license.
- **OpenAlex.** `referenced_works`, algorithmic `related_works`, citation counts and FWCI, 25 work types including `review` (0.3% of works) and `book`, four-level topics, abstract as an inverted index only, metered PDF and GROBID XML, semantic search. Keyed since February 2026: $1/day free with a key, list $0.0001, search $0.001, PDF $0.01 per call. Treat the key as required.
- **Semantic Scholar.** References and citations carry `contexts`, `intents`, `isInfluential`; 13 publication types (Review, Book, ...); `tldr`; open-access PDF with license; a Recommendations API (up to 500); snippet search. Key gives 1 request per second; every unauthenticated Graph call in the session was rate-limited.
- **What the Map and curriculum surfaces must not promise:** a prerequisite relation (none exists in any source; depth is our inference and must be labelled as such); "survey" as anything more than a type tag; complete citation graphs; an open-access PDF for every paper; readings linked to DOIs or ISBNs (they are strings); any course-to-paper bridge; textbooks beyond thin `book` records.
- **Consequences for the Map, Narrowing dialogue, and Multi-source tickets:** the curriculum is MIT OCW first, peers as HTML sources through the normal ingest path; lecture transcripts read as WebVTT segments (a segment is a sentence with a timestamp); prerequisite depth is computed from citation direction and course level, and the surface says so; sourcing depth uses OpenAlex topics plus Semantic Scholar recommendations and influential citations.
