# 19 · The pointing assistant
Type: grilling
Status: resolved
Blocked by: 02, 07, 13

## Question
What does a pointing assistant do inside a reading tool: what may it point at (sentences, cards, controls, map bands, canvas cards), how is it summoned (leader chord, hold-to-talk, ⌘K verb), what may it say (cited facts, UI guidance, nothing else), is it voice, text, or both, how does it decline when it cannot find a target, and is it the same answer engine as Explain with a pointer added?

## Inputs
Resolutions of *May the AI speak first*, the *pointing protocol* research, *The shell*; bars: HeyClicky (pointer swoops to the target), Cursor (suggestions that never take over), Dia (assistance beside reading).

## Resolution must state
All nine `SURFACES.md` fields, or the component contract if it is an overlay rather than a surface. The pointer's target vocabulary. The summon gesture. The speech contract.

## Starting recommendation
An overlay, not a surface. Text first with voice as an optional input. Summoned by a held key; released, it is gone. It points at sentence ids and named UI elements; its words are the same cited answer engine plus plain UI guidance ("this is where theses live"). It never moves the reading position without consent and never speaks first.

## Answer
Decided 2026-09-06 with Aaryan. An **overlay** available in every view, not a view.

**Job.** Answer "where" and "how" by showing: the AI points at the thing instead of describing it. Pain rows 1 and 3.

**Summon.** Hold a key (Fn or Globe by default, configurable) and speak; release to send. Or press Space a and type one line. Esc dismisses everything. Never appears unsummoned.

**What it does.** The reply is a short cited line in a small bubble beside the pointer, read aloud if voice was used. The pointer swoops to its target on a curved path (from the clicky research: control point raised min(0.2 × distance, 80) px, smoothstep, 0.6 to 1.4 s, a small landing offset, no overshoot), the bubble springs in, holds, then fades; the pointer disappears rather than flying back. The model emits one trailing tag, `[POINT:<sentence-id or control-name>:label]` or `[POINT:none]`, stripped before display; targets are exact ids, never guessed coordinates.

**Targets.** Sentences in the open source (highlighted on landing; the bubble cites them). Cards and nodes on the Canvas (a lesson to do next, the note you are looking for). Controls and views, as plain UI guidance ("Export is here"); it never clicks anything for you. If the target is off screen or in another view it navigates there first, and Back restores where you were.

**Speech contract.** The same cited answer engine as Explain, plus plain UI guidance. It never claims a fact without a citation; a target it cannot resolve renders `none`: the bubble says so in one line and shows the unsupported badge, with no pointer motion.

**States.** Loading: listening (a level meter in the bubble) then thinking (the short-wait indicator). Failed: model or audio failure in the bubble with Retry; the typed path remains. Unsupported: target not found. Empty, partial, stale: n/a.

**AI may:** point, answer with citations, guide, navigate to the target. **Only the human:** summon, dismiss, act on anything pointed at.

**Keyboard.** Hold key to talk; Space a to type; Enter sends; Esc dismisses; Space a again with a bubble open asks a follow-up.

**Bars.** HeyClicky (pointer motion and the say-then-point rhythm), Cursor (suggestions that never take over), Dia (assistance beside reading).

**Event log.** Writes: question (human, with mode voice or text), answer (ai, cited, with the target id). Read by: Canvas (the question appears under the lesson of its cited sources, like any question).
