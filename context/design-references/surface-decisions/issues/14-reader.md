# 14 · Reader
Type: grilling
Status: resolved
Blocked by: 02, 03, 04, 11

## Question
The complete Reader: the passage loop (select → Explain · Note · Counter · Idea → card), card versus layer for long answers, follow-ups, counter resolution, the fate of the Arguments · Questions · Annotations sidebar now that a canvas exists, the scroll track marking where you asked and wrote, and the layer-depth indicator, the locator and path bar, figures and equations, hidden-text and parse-failure blocks, the one-time hint, every state, the vim grammar applied, and the bars.

## Inputs
Resolutions of *May the AI speak first*, *State grammar*, *Keyboard grammar*, *Canvas ↔ Reader*; `docs/mvp-prd.md` S2 to S7; `docs/designs/prompt-2-screens.md` screens 4, 5 and the States; `docs/research/paper-parsing-2026.md` for what a reflowed document can contain; bars: Readwise Reader (keyboard reflow reader), arXiv HTML (structure fidelity), iA Writer (measure), Semantic Reader (in-context cards).

## Resolution must state
All nine `SURFACES.md` fields for the Reader. Which of the critique's §12 conflicts it settles (long answer; status language in a quiet column).

## Starting recommendation
Answers stay inline and scroll internally; a follow-up appends to the same card; a source cited in an answer opens as a layer (the reading form of a branch). The right sidebar keeps Arguments as a compact list and gains the canvas's questions for this source. Nothing in the column is ever unanchored.

## Answer
Decided 2026-09-06 with Aaryan.

**Job.** Read one source closely and turn confusion into cited understanding and your own words without leaving the passage. Pains served: context switching (row 1), digestible presentation (row 3).

**How you arrive.** A source in the left sidebar; a source under a lesson in the Canvas side panel; a citation chip on a card; a ⌘K result; a citation inside another source (opens as a layer); Back.

**Primary flow.** The source is reflowed (Newsreader 18/1.55 on a 68-character measure; MathML; figures, tables, and captions in place; references at the end; a lecture transcript as text with a timestamp column). Select a passage. The toolbar appears anchored to the selection within 150 ms with four verbs: **Explain · Note · Idea · Explain visually**. Explain opens a field with the passage quoted and two presets, *Explain this* and *Check this claim against my other sources*, or your own question; the answer streams as an inline card beneath the passage, every claim cited to sentence ids, unverified claims badged unsupported. Note and Idea open a human writing field (outdented into the margin, human material); beside it the show panel lists the passage and up to three related sentences from the source, never text inside your field. Explain visually requests an explainer card (its contract in *Explainers*). Every question also appears on the Canvas under the lesson its cited sources belong to. **Counter is dropped**: disagreement is a Note, an Idea, or the check-this-claim preset.

**Long answers.** A card streams inline; once it would exceed roughly a third of the window it opens as a **layer** over the source with its own breadcrumb entry, the source dimmed beneath; Esc pops it and returns to the exact line. Follow-ups append inside the same card or layer. A citation to another source opens that source as a layer, unlimited depth, breadcrumb collapsing in the middle.

**Chrome.** Breadcrumb bar with the locator (`Attention is all you need › §3.2`). Left sidebar collapsed by default here. Right sidebar: one scrolling details panel, sections **Lesson** (which lesson this source belongs to, its status, a link to it on the Canvas), **Outline** (sections or lecture timestamps, current one following your scroll), **Your marks** (questions and notes on this source in reading order, glyph per kind, the ones near your position highlighted). Margin markers at each passage with a note or question. A one-time hint on the first source: "Select any passage to ask about it."

**States.** Loading: sections arriving in place, top first, one caret at the end of the last section (long-wait tier animation only before the first section lands). Partial: some sections parsed, a "this region did not parse, view original" block showing the original page crop; a transcript without its media. Failed: fetch or parse failure inline in the source row and at the top of the column, input kept, one retry, and "Open original document". Unsupported: the badge on any card claim whose citation did not verify. Hidden text detected in a PDF is excluded from the text and shown behind a banner. Empty and stale: n/a.

**AI may:** answer, cite, show, explain (render), point when summoned. **Only the human:** note, idea, ask, select, accept an explainer.

**Keyboard.** Full vim per *Keyboard grammar*: j/k h/l gg/G { } [ ] / n N, v for selection, then e Explain, n Note, i Idea, x Explain visually; Enter opens a citation or card; Tab between cards; Esc closes innermost and returns to the exact line.

**Bars.** Readwise Reader (keyboard-driven reflow reading), arXiv HTML (structure fidelity), iA Writer (measure and restraint), Semantic Reader (in-context cards).

**Event log.** Reads: source, sentences, all events anchored to this source. Writes: question (human), answer (ai, cited), note (human), idea (human), explainer request. Emits nothing to other views directly; the Canvas and Workbench fold the same events.

### Addendum 2026-09-06 (from *The Workbench ladder*)
Idea is renamed Insight. Selection verbs: **Explain · Note · Insight · Explain visually**. Insight opens the human writing field with the show panel beside it and creates an insight event standing on the selected passage; on the Canvas it appears above the ground connected to that passage's card. "Your marks" in the right sidebar lists questions, notes, and insights on this source.

### Addendum 2026-09-06 (from *Prototype: an explainer inside the reading column*)

**Inline visual explanations.** Open beneath the cited passage, keeping that passage at its screen position and moving only subsequent text down. Do not scroll automatically to fit the card; lower controls may start below the window. The explainer uses the reading column's width and a height determined by the concept, with legible labels. The roughly one-third-window threshold applies to long text answers, not the explainer visual.

**Enlarge and return.** Enlarge opens a focused layer over the paper. Close or Esc returns to the inline explainer at the same playback position; Close or Esc inline collapses it to **Open explanation** beneath the passage. Retain the paused position, follow-ups and Canvas card. The exact caption is **Explains: Attention is all you need · §3.2, sentences 4–7**, in readable interface text; hover/focus highlights the sentences and click returns to them.

**On request.** Explain visually remains consistently available on a selection. There are no unsolicited margin icons or sidebar offers. A reopening link for an explanation already requested is permitted. Playback, named scrub steps and the other component controls follow [the accepted explainer prototype decision](16-prototype-explainer-inline.md).
