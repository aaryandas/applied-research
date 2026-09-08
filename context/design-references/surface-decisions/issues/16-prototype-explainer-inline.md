# 16 · Prototype: an explainer inside the reading column
Type: prototype
Status: resolved
Assignee: Aaryan (Codex)
Blocked by: 14, 15

## Question
How does a seconds-long explainer feel inside the reading column without breaking the paper's sanctity? Build a throwaway: one passage from "Attention Is All You Need" §3.2 with a stub animation of scaled dot-product attention opening below the passage, with its sentence citations. Show the same explainer as a card on the Canvas (one event, two views). Also show two or three ways the AI could signal that a visual explanation is available for a passage (an icon in the margin, a row in the right sidebar, nothing at all until asked), so the *offer* decision deferred from *May the AI speak first* can be made by looking. React to: below-only reflow, size, scrub control, how it closes, how the citation reads, whether it belongs inline at all, how it reads on the Canvas, and which offer treatment, if any, is acceptable.

## Method
`impeccable shape` brief first, then `/prototype` in the material system. Link the prototype as an asset from this ticket.

## Resolution must state
The placement, size, and controls decision; whether offers are enabled and how they look (this closes the deferred part of *May the AI speak first*); and any change to the Explainers or Reader answer it forces (recorded in those tickets' Answer blocks as an addendum, not re-opened).

## Comments

### Prototype ready for live review · 2026-09-06

Claimed by Aaryan (Codex). Read the full Answers and addenda of **May the AI speak first?**, **State grammar**, **Reader**, and **Explainers**. **Prototype: canvas branching with real project content** had no Answer yet; read its available brief, HTML result and screenshots in full and reused that working fixture and material for the Canvas comparison. Its decisions remain unapproved here.

- [One-page shape brief](../../../docs/gauntlet/briefs/explainer.md).
- [Standalone explainer prototype](../../../docs/gauntlet/prototypes/explainer/index.html).
- [Screenshot index, provenance and limitations](../../../docs/gauntlet/prototypes/explainer/README.md).
- [Interaction verification](../../../docs/gauntlet/prototypes/explainer/verification.json).

The Reader is Newsreader 18/1.55 on 68ch. Includes three offer variants, actual selection, long-wait stage sequence, looping SVG and scrub, caption hover/focus/click, follow-up, retry hint and retained versions, SVG export, Close/Esc, still frame, failed and unsupported states. Canvas shows the same event under its passage question, with shared timeline and unfinished follow-up input. Measured passage displacement on open and close: 0px. No browser JavaScript errors in tested flows.

**Awaiting Aaryan's decisions, one question at a time:** below-only reflow; size; scrub; close; caption; Canvas; offers. In particular, the 442px medium card is a proposal that may need an exception to Reader's text-answer height rule. Caption uses the interface face at 12px to fit the exact wording. No Answer has been written and no prior decision has been changed. Write the offer addendum to **May the AI speak first?** only after the live choice, and addenda to **Reader** / **Explainers** only where that exchange changes them.

### Live decision: below-only reflow · 2026-09-06

Aaryan agreed: opening the explainer keeps the passage at its current screen position and pushes only subsequent text down. Do not automatically scroll to fit the card; it is acceptable for its lower controls to begin below the window. Card size, scrub, closing, caption, Canvas treatment and offers remain open. Carry this accepted rule into the final Answer and the Reader / Explainers addenda when the ticket resolves.

### Review approach · 2026-09-06

Aaryan asks for recommendations grounded in the user's problem and worked backwards to an intuitive, delightful solution, with senior product-design judgment. Do not default to familiar patterns or ratify the prototype's current dimensions merely because they exist. For each remaining decision, explain the reading or understanding problem, the proposed behavior, and its meaningful trade-off before asking one question.

### Live decision: card size · 2026-09-06

Aaryan agreed: the inline explainer uses the reading column's width; its height follows the concept rather than a fixed card height or a fraction of the window. A simple transformation can stay shallow; a spatial mechanism may need more room. Labels and meaningful details must remain legible. An explicit **Enlarge** action allows closer inspection without imposing that size on ordinary reading. The prototype's 442px medium card is an example, not a prescribed height. The Reader's roughly one-third-window threshold for long text answers does not govern the explainer visual. Exact presentation of the enlarged state is still to be specified during this ticket's remaining review.

Remaining decisions: scrub control; closing (including the enlarged state); caption; Canvas treatment; offers.

### Live decision: scrub control · 2026-09-06

Aaryan agreed: a continuous timeline sits beneath the visual, with meaningful, clickable steps appropriate to the concept (for this attention example: **Compare → Scale → Softmax → Combine**). Clicking a step jumps directly to that transformation. Dragging updates the diagram immediately; releasing leaves playback paused at that moment for inspection. Play resumes from that position. The timeline supports continuous inspection between the named steps; the steps do not restrict the reader to a slideshow.

Remaining decisions: closing (including the enlarged state); caption; Canvas treatment; offers.

### Live decision: closing and enlarged view · 2026-09-06

Aaryan agreed: Close or Esc on the inline explainer collapses it to a quiet **Open explanation** link beneath the passage. Preserve its paused playback position, follow-ups, and Canvas card. This link returns to an explanation the human already requested; it is not an unsolicited offer.

**Enlarge** opens a focused layer over the paper. Close or Esc in that layer returns to the inline card at the same playback position. Another Esc collapses the inline card. Closing restores reading without deleting the explanation.

Remaining decisions: caption; Canvas treatment; offers.

### Live decision: caption · 2026-09-06

Aaryan agreed to the same wording in Reader and Canvas: **Explains: Attention is all you need · §3.2, sentences 4–7**. Render it in readable interface text. Hover or keyboard focus highlights the cited sentences in the Reader; clicking returns to those sentences. Keep the full source name on the Canvas, where the paper is no longer visible. The wording identifies the passage interpreted by the visual. The existing unsupported badge rule still applies when a cited sentence does not verify.

Remaining decisions: Canvas treatment; offers.

### Live decision: Canvas treatment · 2026-09-06

Aaryan agreed: the Canvas explainer is a compact card beneath its question at rest, showing a still frame, a short concept title, and the full caption. Opening it reveals the player and follow-up controls in place, keeping the connection to the question visible. Only the active explainer plays. Collapsing the card preserves playback position and the discussion. The Reader and Canvas remain two presentations of the same explainer event.

Remaining decision: offers.

### Live decision: offers · 2026-09-06

Aaryan agreed to **On request**. Keep **Explain visually** consistently available in the selection toolbar. Do not add unsolicited margin icons or sidebar offers. Previously requested explanations retain their reopening controls. This closes the offer decision deferred by **May the AI speak first?**.

## Answer

Decided 2026-09-06 with Aaryan through seven sequential decisions. Explainers belong inline in the Reader and as cards attached beneath their passage questions on the Canvas. They remain one event in two views.

**Job.** Understand one mechanism while retaining its relationship to the source passage; resume reading or tracing the question branch without losing the explanation.

**Arrival and offers.** Choose **Explain visually** on a Reader selection, or use the existing Canvas answer-card action. **On request** is the accepted offer treatment: no unsolicited margin icon or sidebar row. Keep the selection action consistently available. An **Open explanation** link or a saved Canvas explainer reopens work already requested; neither is an unsolicited offer. The definitive offer rule is recorded in the addendum to [May the AI speak first?](02-may-the-ai-speak-first.md).

**Reader placement and size.** Open below the cited passage, preserving its screen position and moving only subsequent text down. Do not automatically scroll to fit the card; lower controls may initially be below the window. Use the reading column's width and let the concept determine height while preserving diagram legibility. A simple transformation can be shallow; a spatial mechanism may need more room. There is no fixed card height and no one-third-window limit for the visual. Reader's existing threshold for long text answers remains a separate rule. Paper stays Newsreader 18/1.55 on 68ch, with the explainer in the assistance material.

**Playback and inspection.** Clips have Play/Pause and a continuous timeline beneath the visual. Add meaningful clickable steps appropriate to the concept; for the attention example: **Compare → Scale → Softmax → Combine**. Clicking jumps to that transformation. Dragging updates immediately; releasing leaves the clip paused for inspection. Play resumes from that position. Interactive scenes retain orbit, exposed parameter controls and Reset. Follow-up, **Try again with a hint**, and **Export** remain as specified in [Explainers](15-explainers.md); retry creates a new explainer while retaining the old one.

**Enlarging and closing.** In the Reader, **Enlarge** opens a focused layer over the paper. Close or Esc returns to the inline card at the same playback position. Close or Esc on the inline card collapses it to a quiet **Open explanation** link below the passage, returning to reading and retaining its paused position, follow-ups and Canvas card. Thus Esc from the enlarged layer returns inline; a second Esc collapses the inline card. Closing does not delete the event.

**Caption.** Use **Explains: Attention is all you need · §3.2, sentences 4–7** in readable interface text in both Reader and Canvas. Keep the full source name on Canvas. Hover or keyboard focus highlights the cited sentences in Reader; clicking returns to them. The caption states the passage interpreted by the visual. Keep the unsupported badge on the caption if a cited sentence does not verify.

**Canvas.** At rest, show a compact explainer card beneath its question, with a still frame, short concept title and full caption. Opening reveals the player and follow-up controls in place; the connection to its question stays visible. Only the active explainer plays. Collapse retains position and discussion. Reader and Canvas reference the same explainer and citations rather than creating copies.

**States.** No empty or stale explainer state. Loading uses the established long-wait animation with real stage text: **Writing the scene**, **Rendering**, **Checking citations**. Partial shows a still frame while the clip finishes. Failed retains the request, gives Retry and falls back to the cited sentences; foreground versus background failure follows [State grammar](03-state-grammar.md). Unsupported uses the caption badge. Ready adds the inline, enlarged, collapsed and compact Canvas presentations defined above. Reduced motion starts the visual paused and removes decorative loading motion.

**Authority and keyboard.** The human requests, plays, scrubs, enlarges, closes, follows up, retries and exports. The AI chooses the medium, renders, cites or declines with a reason, as already defined in Explainers; it does not offer help unprompted. On a focused player: Space plays/pauses; arrows scrub; r resets; f enters follow-up; t enters a retry hint; Esc follows the close behavior above. Named steps and all actions are keyboard reachable. Text fields retain the existing text-input grammar.

**Reference bars and evidence.** Distill for the relationship between diagram and prose; Bartosz Ciechanowski for direct inspection; 3Blue1Brown for single-concept transformations. Assets: [shape brief](../../../docs/gauntlet/briefs/explainer.md), [throwaway prototype](../../../docs/gauntlet/prototypes/explainer/index.html), [screenshots and verification](../../../docs/gauntlet/prototypes/explainer/README.md). The artifact tested the discussion; accepted named steps, Enlarge, refined closing and compact Canvas behavior are decisions for the surface specification, not claims that the original exploration HTML implements those later choices.

**Event log.** The explainer event carries the medium and sentence citations; Reader and Canvas present that event. Follow-ups are human question events attached to it; retry with a hint adds a new explainer, keeping the previous event. Opening, scrubbing, enlarging and collapsing do not duplicate or remove the explanation. Existing Playbook export behavior remains as defined in Explainers.

All decisions in this ticket are resolved. Addenda on Reader and Explainers carry the changes to their component contracts. No new decision ticket was exposed by this exchange.
