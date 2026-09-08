# 15 · Explainers: purpose, trigger, and the worth-rendering rule
Type: grilling
Status: resolved
Blocked by: 02, 09

## Question
What are Explainers for, and when do they appear: on demand from a selection, offered by the AI at a moment of confusion, or as a surface of their own? What makes a passage worth rendering (a rule the loop can apply)? Which medium for which concept: a seconds-long Manim clip or a live React Three Fiber mechanism? How does one cite the sentences it explains? What can the human do with it (scrub, save, place on the canvas, export)? Every state, including the render wait and a failed render.

## Inputs
Resolutions of *May the AI speak first* and the *explainer render facts* research; bars: 3Blue1Brown (single-concept transformations), Bartosz Ciechanowski (scrubbable mechanisms), Distill (diagrams inline in prose).

## Resolution must state
All nine `SURFACES.md` fields, or, if Explainers are a component of the Reader and Canvas rather than a surface, the same fields written as a component contract. The worth-rendering rule. The medium-selection rule. The citation rule.

## Starting recommendation
Not a surface: a card type. On demand from a selection, plus a silent chrome offer when the passage's argument-graph node is a mechanism or transformation and the source's own figures do not show it. Worth rendering iff the concept changes over time or space. Manim for transformations and quantities, R3F for mechanisms you should be able to turn. Every explainer is an AI event citing the sentences it animates; a failed render falls back to those sentences.

## Answer
Decided 2026-09-06 with Aaryan. Explainers are a **card**, not a view: one AI event rendered inline under the passage in the Reader and as a card on the Canvas attached to the question or passage it came from.

**Job.** Make one hard concept understood in seconds by showing it, cited to the sentences it shows. Pain row 3.

**How you arrive.** *Explain visually* on a Reader selection (toolbar, or x on a selection); *Explain visually* on an answer card on the Canvas; *Try again with a hint* on an existing explainer. No offers exist (see *May the AI speak first*); the prototype may enable them later.

**What gets made.** The AI picks the medium from the passage. Something that changes over time or in steps (a transformation, a derivation, a quantity moving) becomes a **clip**: a short animation rendered by Manim on the cloud service. Something spatial you should be able to turn or push (a mechanism, a structure, a geometry) becomes an **interactive scene**: rendered live by React Three Fiber from a constrained scene schema. If the passage is a definition, a result, or a claim with nothing to show, the card says so in one line ("A visual would not add anything here") and offers a text explanation instead. Always one concept, seconds long. Generation is one of the three agentic loops: write, render, verify citations, retry at most twice.

**Controls.** Clip: play, pause, scrub a timeline. Scene: orbit with the mouse, drag any exposed parameter (an angle, a matrix entry, a gear count) and watch the effect; reset. Both: a follow-up question field beneath (a question event attached to the explainer), *Try again with a hint* (a one-line field such as "show it from the decoder side"; re-renders as a new explainer event, the old one stays), and *Export* (the clip as a video file, the scene as an embeddable file).

**Citations.** One caption line under the visual: "Explains: Attention is all you need · §3.2, sentences 4–7". Hovering the caption highlights those sentences in the Reader; clicking opens the Reader there. If any cited sentence did not verify, the unsupported badge sits on the caption and the explainer is marked unsupported.

**States.** Loading, long-wait tier: the card area shows the designed animation with stage text ("Writing the scene", "Rendering", "Checking citations"); a scene appears within a second or two, a clip in tens of seconds (research: still frame first when available). Partial: a still frame before the clip finishes. Failed: the card shows the failure in plain words with Retry and falls back to the cited sentences as text. Unsupported: as above. Empty and stale: n/a.

**AI may:** choose the medium, render, cite, decline with a reason. **Only the human:** request, accept, retry with a hint, export.

**Keyboard.** On a focused explainer: Space play/pause, ← → scrub, r reset, f follow-up, t try again, Esc closes and returns to the passage.

**Bars.** 3Blue1Brown scenes (single-concept transformations; style only, the scene code is CC BY-NC-SA and never copied), Bartosz Ciechanowski (scrubbable mechanisms), Distill (visuals inline in prose).

**Event log.** Writes: explainer (ai, cites sentence ids, carries medium and the hint if any), follow-up question (human). Read by: Reader (inline), Canvas (card), Playbook (a still or link, per *Playbook and Context pack*).

### Addendum 2026-09-06 (from *Prototype: an explainer inside the reading column*)

**Offer decision finalized.** Explain visually is on request only, consistently available in the selection toolbar. No unsolicited margin icon or sidebar offer is enabled. The sentence saying the prototype may enable offers later is superseded. Existing explanations retain their reopening controls; see [May the AI speak first?](02-may-the-ai-speak-first.md).

**Size and placement.** In Reader, use the reading column's width and let the concept determine the visual's height. Keep the passage fixed on opening, move only subsequent text down, and do not scroll to fit the card. Legibility governs; neither a fixed card height nor the Reader's one-third-window threshold for text answers constrains the visual.

**Scrub and inspect.** Add meaningful clickable steps to the continuous timeline beneath a clip, such as Compare, Scale, Softmax, Combine. Clicking jumps to that transformation. Dragging updates immediately; releasing stays paused. Play resumes from there. Enlarge opens a focused Reader layer; Close or Esc returns inline at the same position. Close or Esc inline leaves **Open explanation** beneath the passage, preserving the paused position, follow-ups and Canvas event.

**Caption and Canvas.** Keep **Explains: Attention is all you need · §3.2, sentences 4–7** in readable interface text in both views, including the full source name on Canvas. Keyboard focus highlights the source sentences just as hover does; clicking returns to them. The Canvas card is compact at rest: still frame, short concept title, full caption, beneath its question. Opening reveals the player and follow-up controls in place while keeping the connection visible. Only the active explainer plays. Collapsing preserves position and discussion.

Medium selection, worth-rendering rule, long-wait stages, still-frame partial state, cited-text failure recovery, unsupported badge, follow-up events, retained retry versions and export formats continue to apply. [Full decision and prototype evidence](16-prototype-explainer-inline.md).
