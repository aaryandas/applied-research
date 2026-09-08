# 18 · The Workbench ladder now that a canvas exists
Type: grilling
Status: resolved
Blocked by: 03, 05, 11

## Question
Is the Workbench a list (an inbox of events with filters), a view over the canvas, or both? Settle: grouping by map layer versus time order (critique §12); what each count counts; where insights and theses are written (Workbench only, or also from the canvas); how a Critique thesis starts now that Counter is dropped (from a Note or Idea, or from scratch), and the stress-test flow; the "show" tray; the Gap thesis's "what industry does instead"; every state including the empty Workbench.

## Inputs
Resolutions of *State grammar*, *Canvas semantics*, *Canvas ↔ Reader*; `docs/mvp-prd.md` S8 to S10; `docs/designs/prompt-2-screens.md` screens 6 to 8; critique §6 and §12.

## Resolution must state
All nine `SURFACES.md` fields for the Workbench. The tab names and what each holds. Whether the Playbook is a tab or its own surface (the Playbook ticket takes it from there).

## Starting recommendation
Tabs Notes · Insights · Theses · Playbook (fixed in *The shell*); Notes lists human notes and ideas with filters; the canvas is where you *think*, the Workbench is where you *decide*. Time order with filters; a concept view as an optional lens. Insights and theses are written here; the canvas can start one but the required thesis fields (claim, evidence, what would prove me wrong) live here.

## Answer
Decided 2026-09-06 with Aaryan, after Aaryan rejected tabs and a plain document in turn: the ladder is Webb's depth of knowledge, and expertise must build over time without being forced on any lesson or project.

**There is no Workbench.** The ladder lives on the Canvas as **elevation**, and the Playbook is a compiled read-only view.

**Levels as what stands on what.**
- *Ground*: the Learning Path tree, question cards and their cited answers, notes in your words, explainers. This is where facts (level 1) and notes (level 2) live.
- *Insights* (level 3, human-only) float above the ground. Each is connected downward to the cards it draws from, often bridging two lessons. An insight may also be written directly from a Reader passage; it then stands on that passage.
- *Theses* (level 4, human-only) sit above insights, connected down to the insights and passages they stand on. A thesis has a claim, evidence (at least one reference), and "what would prove me wrong"; a Gap thesis adds "what the industry does instead". A spiky point of view is a thesis whose insights contradict the sources; the Canvas shows that as a thesis standing on cards that cite opposing sentences.

Zoomed out, the Canvas shows the profile of your expertise in the project: dense ground, a few insights bridging topics, perhaps a thesis. A project that was only for learning has a flat profile, and that is fine and visible. Nothing is asked of you at any lesson.

**Writing upward: two gestures, the only ways insights and theses are created.**
- **Connect.** Select one or more cards anywhere on the Canvas, choose Connect (or press Space i). A human writing field opens above them: "What do these tell you together?" The AI's only act is the show panel in the right sidebar listing the sentences those cards cite. Save places the insight above its evidence. In the Reader, the **Insight** verb on a selection is the same gesture from one passage.
- **Take a position.** Select one or more insights (or cited passages), choose Take a position (Space t). Fields: Kind (Critique or Gap), Claim, Evidence (pre-filled with the selection, editable), What would prove me wrong, and for Gap, What the industry does instead. Save is disabled until the claim, one piece of evidence, and the falsifier exist. On a saved thesis, **Stress-test** is the AI's one verb: the strongest cited case against it from the project's sources, rendered beneath the thesis with each citation at its sentence, unsupported where nothing verifies.

**Idea is merged into Insight.** The Reader's verbs are Explain · Note · Insight · Explain visually. In the data model idea and insight were both level 3; one name remains.

**Counts.** Any count shown (a lesson's questions, a project's insights) counts events of that type and nothing else; no count mixes levels.

**States.** Inherited from the Canvas: empty = no insights yet, nothing shown above the ground and no prompt to make one; failed = a save failure keeps the draft; unsupported = badges inside a stress-test result.

**Event log.** Writes: insight (human, refs to cards and sentence ids), thesis (human, subtype critique or gap, refs), stress-test result (ai, cited). The Playbook folds insights and theses; the Canvas renders them at elevation.

### Addendum 2026-09-06 (from prototype 17)
Elevation is horizontal: ground on the left, insights to the right of what they draw from, theses rightmost. "Above" and "top" in the Answer read as "to the right". Overview labels: Ground, Insights, Theses.
