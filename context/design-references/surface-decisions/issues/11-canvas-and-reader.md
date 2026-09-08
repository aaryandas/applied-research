# 11 · Canvas ↔ Reader: where the Canvas lives and what the Reader emits to it
Type: grilling
Status: resolved
Blocked by: 05

## Question
Where does the Canvas live relative to the Reader: a peer surface, a layer over it, or a split view? When an Explain card opens in the reader, does it also appear on the canvas (one event, two views) or only when the human places it? Do rabbit-hole layers ("2 deep", the path bar) survive, or do canvas branches replace them? How does a canvas card open its sentence in the reader, and how do you come back to the exact card?

## Inputs
Resolution of *Canvas semantics*; `docs/designs/prompt-2-screens.md` screens 4 and 5; critique §12 (long answer as layer vs scrolling card); constraint that surfaces share only the event log.

## Resolution must state
The arrangement and the "how you arrive" for both surfaces. The rule for what the reader emits to the canvas. The fate of rabbit-hole layers. The round trip (card → sentence → card) including what is preserved (scroll position, viewport, selection).

## Starting recommendation
Peer surfaces sharing a project. Every question asked anywhere is one event and appears on the canvas automatically: the canvas *is* the project's question tree, so nothing is placed by hand except human notes, insights, and theses. The reader's rabbit-hole layer remains as the *reading form* of a branch; the canvas shows the same branch as a card. A toggle (or split) moves between them with position preserved in both.

## Answer
Decided 2026-09-06 with Aaryan.

**Peers, switchable, with an optional split.** Reader and Canvas are two full-screen views. Space r and Space c switch between them; each keeps its position (scroll line in the Reader, viewport and selection on the Canvas). A split command shows both at once, Reader left and Canvas right, for reading while the tree grows. Default is one at a time.

**What the Reader emits.** Every question asked from a Reader selection is one event and appears on the Canvas attached to the source passage (as a root if it is the first question from that source) with the selected passage quoted on the card. Follow-ups asked inside a Reader card branch from the answer on the Canvas. The human never sends anything.

**Layers stay, unlimited depth.** Clicking a citation to another source inside the Reader opens that source as a layer on top of the current one, with the breadcrumb (`Attention is all you need › §3.2 › Layer Normalization · 2 deep`) collapsing in the middle when long, and Esc popping one layer. The same act appears on the Canvas as a branch. A layer is the reading form of a branch.

**Round trip.** Clicking a citation chip on a Canvas card jumps to the Reader at that sentence and highlights it. The shell keeps a **browser-style history** of view moves; a Back button (and ⌘[ / ⌘]) returns to the previous view exactly as it was, Canvas viewport and selection included. Back works for every surface pair, not only this one. Questions asked while in the Reader are already on the Canvas on return.

**How you arrive.** Reader: from a source in the sidebar, a citation chip, a Map item, a ⌘K result, or Back. Canvas: Space c, the sidebar, a Map section's question count, a Workbench row's "show on Canvas", or Back.

### Addendum 2026-09-06 (from *Map and Canvas*)
References to "a Map item" or "a Map section" above mean a lesson node on the Canvas. Arriving at the Reader from the Canvas: a source in a lesson's side panel, or a citation chip on a card. Arriving at the Canvas: Space c, the sidebar, a Workbench row's "show on Canvas", or Back.
