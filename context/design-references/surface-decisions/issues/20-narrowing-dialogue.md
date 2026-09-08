# 20 · Start from a question: the narrowing dialogue → Brief
Type: grilling
Status: resolved
Blocked by: 02

## Question
What is the narrowing dialogue that turns "I want to learn robotics" into a Brief ("I'm building X and need to understand Y"): how many turns, what it asks, what the AI may write (a Brief draft the human edits, or nothing), how it ends, how it is skipped, and its states, including "I don't know what I'm building yet" and a Brief that is too broad to source.

## Inputs
Resolution of *May the AI speak first*; `docs/designs/prompt-2-screens.md` screen 1 (the Brief in Fraunces 40 on 34ch); `docs/mvp-prd.md` S1, S15.

## Resolution must state
All nine `SURFACES.md` fields for this entry flow (it may be a state of the opening screen rather than a surface; say which). The turn script. What the AI writes and what the human owns. The exit into Learning Path generation, the written 'What do you already know?' summary, and the adaptive diagnostic (decided in *May the AI speak first*, addendum).

## Starting recommendation
Three questions at most, one at a time, in the Brief's register: what are you building, what must you understand to build it, what do you already know. The AI drafts the Brief; the human edits and owns it (`brief.md` is human). Under two minutes, skippable at every step into a source-first project.

## Answer
Decided 2026-09-06 with Aaryan. This is a state of the Opening screen, not a view.

**Two fields, no dialogue.** The question door shows two plain text fields on one screen: **What are you building?** and **What do you already know about it?** Both are yours: the first becomes the Brief, the second is saved as the project's first Note. One primary button: **Build my learning path**.

**One clarifying question, only when vague.** If the first answer is too broad to source (the sourcing loop cannot pick a subject), the app asks exactly one follow-up in the same large type ("Robotics for what: manipulation, locomotion, perception, or something else?") with a free-text answer and a Skip. Never more than one.

**Then.** The long-wait animation runs with stage text ("Finding courses", "Reading syllabi", "Building your path", "Pulling sources") while the sourcing loop builds the Learning Path and ingests its first sources. You land on the Canvas with a drafted one-line Brief ("I'm building X and need to understand Y") editable at the top of the tree; the human owns it after any edit.

**Narrowing happens on the tree.** Any topic can be hidden with one click (and unhidden from the side panel); hidden topics are not sourced further. There is no scope negotiation in prose.

**Placement is an offer, never a gate.** On the Canvas, one button: "Place me, about three minutes" runs the adaptive diagnostic (definition in *May the AI speak first*, addendum). "Check my understanding" sits on every lesson.

**States.** Empty: the two fields with placeholders and three example answers beneath the first. Loading: the long-wait tier. Failed: sourcing found nothing usable; the fields return with the message and one retry, and "Start from a source instead". Partial: the tree built but some lessons have zero sources yet (shown on the tree).

**AI may:** draft the Brief, ask one clarifying question, propose the tree and sources. **Only the human:** write both fields, edit the Brief, hide topics, start placement.

**Keyboard.** Tab between fields, ⌘Enter builds, Esc on the clarifying question skips it.

**Bar.** Field Atlas opening screen for the illustration; the Wondering learning map for what lands.

**Event log.** Writes: brief (human), note (human, the "already know" text), learning-path (ai-generated structure), source-added per ingested source.
