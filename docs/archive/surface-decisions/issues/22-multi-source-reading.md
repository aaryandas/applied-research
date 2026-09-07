# 22 · Multi-source reading: course, chapter, and paper in one project
Type: grilling
Status: resolved
Blocked by: 08, 13, 14

## Question
How do a course (lectures with timestamped transcripts), a textbook chapter the user owns, and a paper coexist in one project? How is the source list ordered (by depth, by type, by the curriculum path)? How does the reader switch sources and what does the path bar show? Can one answer cite two sources, and how does the citation read? How does a lecture transcript read (text only, text with a timestamp column, embedded media)? What is a "chapter" for an owned book? What are the states of a partially ingested course?

## Inputs
Resolutions of *The shell*, *Reader*, and the *courses and scholarly APIs* research; `docs/research/paper-parsing-2026.md`.

## Resolution must state
The source model as the user sees it (a sentence per source kind). The reader's cross-source moves and the path bar. The cross-source citation rule. The transcript reading form. All states.

## Starting recommendation
One reader, many source kinds, one anchor type: a sentence (a transcript segment is a sentence with a timestamp). The source list follows the curriculum path when one exists and ingest order otherwise. Cross-source citations carry the source's short title as the locator prefix. Transcripts read as text with a timestamp column; media plays in a layer, never in the column.

## Answer
Decided 2026-09-06 with Aaryan. Folds into the Reader and Shell sections of `SURFACES.md`.

**One source model, as the user sees it.** A *paper* is one source with sections. A *textbook you own* is one source with chapters as its sections; a lesson references a chapter or a range of pages, and the Reader opens there. A *course* is a container: each lecture is a source, with its lecture notes or slides as separate readable sources under the same lesson. Every source has one anchor type, the sentence; a lecture's sentences are transcript segments with timestamps.

**Lectures are watched, not read.** The video fills the reading column's width; beneath it one live line shows the sentence being spoken, with the previous few faint above it, never a wall of text. The full transcript lives in the right sidebar's Outline section: scrollable, searchable, click to seek. Pressing Note, Explain, Insight, or Explain visually pauses the video and anchors to the sentence being spoken; Shift plus left extends the moment back a few sentences. Save resumes playback. Notes and questions appear as small markers on the timeline, in Your marks with timestamps, and on the Canvas under the lesson. A citation to a lecture reads "Lecture 4 · 12:40" and opens it playing from there with the sentence highlighted.

**Cross-source answers.** An answer may cite any source in the project. Each citation carries the source's short name and locator: "Vaswani · §3.2", "Lecture 4 · 12:40", "Goodfellow · ch. 9". The Explain preset "Check this claim against my other sources" is the cross-source question by design.

**Moving between sources.** The left sidebar lists sources grouped by lesson in Learning Path order; inside a lesson, courses and books expand to lectures and chapters. A source used by several lessons appears under the first and is linked from the others. Open a source by clicking it, by Space o on a lesson (its first source), by a citation (as a layer), or by a chip on the Canvas. The breadcrumb shows short name and locator; layers stack as decided in *Canvas ↔ Reader*.

**States.** A partially ingested course shows each lecture's state in the sidebar (ingesting with its stage, ready, failed with Retry) and the course row as partial ("7 of 12 lectures ready"). A lecture whose video is unavailable reads as transcript with the player showing the failure and a link to the original page. A chapter that did not parse shows the original page crop.

**Keyboard.** As the Reader, plus on a lecture: Space play or pause, ← → seek by sentence, Shift ← extend the moment, t jump to the transcript in the sidebar.
