# 02 · May the AI speak first? The AI/human verb table
Type: grilling
Status: resolved
Blocked by: —

## Question
Across all surfaces, what may the AI initiate unprompted and what only in response? The posture is "renders state; never speaks first", yet the brief proposes explainers offered at moments of confusion and a pointing assistant. Where is the line, and what is the AI's complete verb set per surface class (reading column, chrome, canvas, workbench, export), against the human-only verbs?

## Inputs
`docs/designs/prompt-2-screens.md` posture; `docs/mvp-prd.md` S5 (the "show" tray, stress-test as the AI's only Workbench verbs); doctrine in the charter.

## Resolution must state
A verb table by surface class: may initiate / may respond / never. The human-only verbs. How an AI *offer* renders when allowed (material, placement, dismissal, frequency). A definition of "speaking first" that later tickets (Explainers, Pointing assistant, Narrowing dialogue) apply without re-arguing.

## Starting recommendation
The AI never writes into the reading column or onto the canvas unprompted. It may *offer* silently in chrome: one quiet, dismissible affordance per passage at most, never animated, never in the reading column. Verbs: answer, cite, show (tray), point, stress-test, render an explainer on request, propose sources inside the sourcing flow only. Human-only: note, counter, idea, insight, thesis, placing anything on the canvas, editing the Brief.

## Answer
Decided 2026-09-05 with Aaryan.

**The line.** The AI never speaks first. Every AI act is a reply to a human act: a selection, a question, a summons, a button. Nothing AI-authored appears in the reading column, on the Canvas, or in the Workbench unless the human asked for it there. *Offers* (the AI signalling that a verb is available) are **not enabled**. A candidate offer set is recorded below for the explainer prototype to test; until that prototype decides, the surfaces have no offers.

**Programmatic by default.** Background work is event-triggered pipelines with model calls as fixed steps. Visible verbs are single model calls fired by a human act. Agentic loops (a model with tools, turn-capped) exist in exactly three places: sourcing (search, evaluate, propose a curriculum), the narrowing dialogue (ask, listen, draft the Brief; at most three turns), and explainer scene generation (write, render, verify citations, retry at most twice). No agent watches the user.

**AI verbs** (each an event with author `ai`, each cited or it renders as unsupported):

| Verb | What it does | Fired by |
|---|---|---|
| answer | cited reply to a human question (Explain, follow-up, the Canvas question bar) | human question |
| cite | resolve a claim to sentence ids; a claim that does not resolve renders as "unsupported" | every answer |
| show | a panel of relevant sentences beside a human writing field (Counter, Insight, Thesis) | opening the field |
| point | move the pointer to a sentence id or a named control, with one cited line | summons |
| explain | render a seconds-long clip (Manim) or an interactive simulation (Three.js) citing the sentences it explains | selection + Explain visually |
| stress-test | the strongest cited case against a thesis, from the project's sources | button on a saved thesis |
| next | what to read or ask next, derived from the computed edge, citing the sentences your open questions cite | request from the Map or leader key |
| what am I missing | an answer over your own questions and the project's sources that cites the prerequisite sentences you have not read | request on a question card |
| propose sources | candidate courses, textbooks, papers for a Map section (the sourcing loop) | Find sources for this |
| draft Brief | a Brief draft during the narrowing dialogue; the human edits and owns it | the question door |
| propose calibration topics | the topics the calibration step asks about | after the Brief |

**Background jobs** (no author, no voice; visible only as state: loading, partial, failed, stale): fetch, parse (including WebVTT transcripts), canonicalize, segment, distill, verify, index, label Map sections, compute prerequisite depth, search (OpenAlex, Semantic Scholar, web; finds sources, never cited), re-anchor after re-parse, scene generation, compile (facts formatted; human text copied by code), sync status (paid), analytics.

**Tutor role: a computed edge, never a judgment.** Per Map section, from the event log: *read* = a source in the section opened past half or with an event anchored in it; *known* = a calibration mark (Know it or Heard of it), recorded as activity, never mastery; *engaged* = the count of questions, notes, counters anchored there, shown as a count; *in reach* = unread and every prerequisite section read or known; *beyond reach* = a prerequisite section still dark. The Map draws this edge; the two tutor verbs phrase it. The product never says "you understand X", shows no score, no streak.

**Human-only verbs** (no AI author can ever exist for these): note, counter, idea, insight, thesis; editing the Brief; resolving a Counter (I was missing something / the source has a problem / still open); accepting or dismissing anything; export. Whether placing things on the Canvas is human-only or automatic (every question appearing as a card) is decided by *Canvas semantics*.

**Explainers are one event in two views.** A visual explanation renders inline under the passage it explains and as a card on the Canvas attached to the question or passage it came from: same clip or simulation, same citations, playable in both.

**Candidate offers, disabled, for the prototype to test.** Explain visually (rule to be set by the Explainers ticket; anchor the passage). Next (a section's last in-reach item read; anchor the section). What am I missing (a question cites a section beyond reach; anchor the question card). Find sources for this (a dark section selected, or a curriculum section with zero sources; anchor the section detail). Add cited source (an answer cites a reference whose work is not in the project; anchor the citation). Stress-test (a thesis saved with evidence and a falsifier; anchor the thesis card, once per version). If enabled, the rules are: one per anchor at a time, no motion on arrival, dismissal permanent for that anchor, acceptance behaves as if the human had asked.

### Addendum 2026-09-06 (from *Map and Canvas*)
- "Map section" in the tutor-role paragraph means a lesson on the Learning Path. The computed edge is the boundary between lessons placed known or mastered and the first lesson that is not.
- **Lesson statuses.** Not started: nothing yet. In progress: the user opened one of its sources or asked a question about it. Completed: the user opened every source the lesson draws from, or marked it done. Mastered: the user passed a check, either because the starting diagnostic placed the lesson below their edge or because they took "Check my understanding" on the lesson and passed. Displayed as the four words, never a score.
- **Two verbs added, both fired only by the human:** *diagnose* (the adaptive placement test at project start: one short question at a time from mid-tree, deeper on a right answer, shallower on a wrong one, five to eight questions, under three minutes, skippable; result sets statuses) and *check* (grade a short written answer against the lesson's sources, showing the reasoning with citations; the user can dispute a grade with one click, which excludes it). *propose calibration topics* is withdrawn; the diagnostic replaces self-report calibration.
- The written "What do you already know?" summary at project start is a human Note, the project's first.

### Addendum 2026-09-06 (from *Reader*)
Counter is dropped as a verb. Human-only verbs are: note, idea, insight, thesis; editing the Brief; asking; accepting or dismissing anything; export. "Resolving a Counter" is withdrawn. The check-this-claim preset is an *answer*.

### Addendum 2026-09-06 (from *The Workbench ladder*)
idea and insight merge into **insight**. Human-only verbs: note, insight, thesis; editing the Brief; asking; hiding a topic; accepting or dismissing anything; export.

### Addendum 2026-09-06 (from *Prototype: an explainer inside the reading column*)

**The deferred offer decision is closed: On request.** Aaryan chose no unsolicited offers after comparing a cold margin icon, a row in the right Details panel, and no signal until asked. Keep **Explain visually** consistently available in the selection toolbar; do not insert a margin icon or sidebar offer merely because a passage could be animated. No background judgment of confusion initiates help. The candidate offer catalogue above remains disabled; this prototype does not enable any of those offers.

Previously requested explanations retain their reopening controls: **Open explanation** beneath the passage and the saved explainer card on Canvas. These return to existing work and are not unsolicited offers. The earlier wording “until that prototype decides” is superseded by this final choice. [Full prototype decision](16-prototype-explainer-inline.md).
