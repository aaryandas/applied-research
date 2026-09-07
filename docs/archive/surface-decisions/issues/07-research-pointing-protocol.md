# 07 · Research: the openclicky point-tag protocol and pointing motion
Type: research
Status: resolved
Blocked by: —

## Question
How does openclicky (`references/pointing/openclicky-src/`, plus HeyClicky captures in `references/pointing/heyclicky/`) let a model point? What is the point-tag protocol the model emits, how are targets identified (accessibility tree, coordinates, element ids), how does the pointer move (path, easing, duration), what does the assistant say versus show, and what happens when a target is not found? Which parts transfer to a Chromium/React reading surface where targets are sentence ids and UI elements?

## Output
`docs/research/pointing-protocol.md`, each claim cited to a file and line in the source or a primary doc.

## Answer
Findings: `docs/research/pointing-protocol.md` (2026-09-05, from the Swift source of github.com/farzaa/clicky at `a80fa80`, with the jasonkneen/openclicky fork, which is what actually sits at `references/pointing/heyclicky/openclicky-src/`, as a labelled secondary).

- **Protocol.** The model appends exactly one tag at the very end of its spoken reply: `[POINT:x,y:label]`, optionally `:screenN`, or `[POINT:none]`. One end-anchored regex strips it; the remainder is spoken. Farza's prompt says "err on the side of pointing"; the fork says "do not guess". For us the tag becomes `[POINT:<sentence-id or element-name>:label]`, and the choice between those two prompts is a decision for the pointing-assistant ticket.
- **Targets** are pixels guessed by the vision model from a screenshot; no accessibility tree, ids, or OCR. A Computer Use fallback exists as dead code; the fork wires it as a second pass. None of this transfers: a reading surface has sentence ids and named controls, so pointing can be exact and verifiable, the same way citations are.
- **Motion** (transfers verbatim as a starting bar): quadratic Bezier with the control point raised by min(0.2·distance, 80) px; smoothstep easing; duration clamp(distance/800, 0.6, 1.4) s at 60 fps; the pointer rotates to its tangent and pulses to 1.3× at the apex; no overshoot; it lands 8 px right and 12 px below the target. The bubble springs in, types at 30 to 60 ms per character, holds 3 s, fades in 0.5 s, then the pointer flies back to the mouse. Only the return leg is cancellable (mouse moves more than 100 px).
- **Say versus show.** Speech carries the answer; the bubble says a generic "right here" (the fork shows the label). Flight begins as soon as the reply is parsed and runs concurrently with the audio. Because our tag can be emitted first on a DOM surface, the pointer can move while the sentence is still being spoken.
- **Not found.** `none` produces nothing visual, speech unchanged, no retry. A bad screen index falls back to the cursor's screen. Our equivalent: a target that does not resolve renders as "unsupported", the same badge as an unverified citation.
- **Also transfers:** the fork's partial-tag streaming guard and its 120 s "click that" referent memory. **Does not transfer:** the pixel pipeline, `:screenN`, calibration, fly-back-to-mouse (we have no system cursor to return to inside the app).
