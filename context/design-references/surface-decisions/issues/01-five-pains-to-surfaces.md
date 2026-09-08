# 01 · Five pains → surface → measurable moment
Type: grilling
Status: resolved
Blocked by: —

## Question
For each of the five pains (context switching; sourcing; digestible presentation; finding gaps; synthesis into insights and ideas), which surface or surface pair is the one that fixes it, and what is the observable *moment of understanding* on that surface at which the pain is gone, stated so a critic can watch for it and the loop can test it?

## Inputs
`docs/mvp-prd.md` §1; `PRODUCT.md`; critique §10 persona walkthroughs; `docs/gauntlet/wayfinder-prompt.md` product section.

## Resolution must state
A five-row table: pain → surface(s) → the moment → how it is measured (an event-log query or an observable behavior) → what would falsify the claim that the pain is fixed. Every later surface ticket cites its row.

## Starting recommendation
Context switching → Reader + Canvas (a question answered without leaving the passage; measure: cards opened per reading session, no external app during a session). Sourcing → Question door + Map "find sources" (a set of sources with every fact anchored; measure: time from Brief to first source read). Digestible → Reader reflow + Explainers (a concept understood in seconds; measure: follow-up rate after an explainer falls). Gaps → Map + calibration (seeing your edge; measure: "No idea" bands converted to read sources). Synthesis → Workbench + Playbook/Context pack (a thesis with evidence and a falsifier saved; a pack that changes an agent's output; measure: theses per project, the agent A/B).

## Answer
Decided 2026-09-05 with Aaryan. Each surface section in `SURFACES.md` cites its row; a surface not in this table serves one of these rows indirectly and says which.

| Pain | Surface(s) | The moment of understanding | Measured by | Falsified if |
|---|---|---|---|---|
| Context switching across search, PDF, chat, notes | Reader + Canvas | A confusion mid-read becomes a cited answer directly under the passage without leaving it, and the question lands on the Canvas as a branch. | Reading sessions with zero exits to another app (window blur to a browser or chat during a session); time from selection to first token. | Users still open a browser or chat while reading. |
| Sourcing | Question door + Map | A Brief becomes a curriculum of courses, textbooks, and papers on the Map, and every fact shown afterward has a sentence behind it. | Time from Brief to first ingested source read; share of answers with zero unsupported claims. | Users add sources by hand from a browser. |
| Presenting knowledge digestibly | Reader reflow + Explainers | A dense passage reads as typography, and a hard concept is understood in seconds from an explainer that cites the sentences it animates. | Follow-up questions on a passage fall after an explainer; time on a passage before the first Note. | Users open the original PDF instead of the reflow. |
| Finding the gaps in what you know | Map + calibration | The Map shows where read and known territory ends and the dark begins, and names it. | "No idea" bands that later gain a read source; questions asked per band. | Users cannot say what they do not know after a session. |
| Synthesizing into insights and ideas | Workbench ladder + Playbook | A human-written thesis is saved with evidence and "what would prove me wrong", then a Context pack changes a coding agent's output. | Theses per project; the agent A/B with and without the pack. | Packs are exported with zero theses. |

Every measure is a query over the event log or an analytics event; none is a mastery score.

### Addendum 2026-09-06 (from *Map and Canvas*)
"Map" in the table means the Learning Path, which is the Canvas's skeleton. Row 2 reads: Question door + Learning Path; the moment is the tree of topics and lessons appearing with sources under each lesson. Row 4 reads: Learning Path + diagnostic; the moment is the diagnostic placing your edge on the tree, measured by lessons that move from Not started to In progress after placement, and Mastered checks passed.

### Addendum 2026-09-06 (from *The Workbench ladder*)
Row 5 reads: Canvas elevation + Playbook. The moment is a thesis standing on insights that stand on cited cards, then a pack that changes an agent's output.
