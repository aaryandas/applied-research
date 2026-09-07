# Explainer prototype

[Open the standalone prototype](index.html). The same file works from disk and at `http://127.0.0.1:4176/docs/gauntlet/prototypes/explainer/index.html` while the preview server runs. Fonts, CSS, JavaScript, and the SVG animation are embedded.

[Shape brief](../../briefs/explainer.md). [Decision ticket](../../../../.scratch/surfaces/issues/16-prototype-explainer-inline.md).

## Review controls

- Bottom picker: **Margin icon**, **Sidebar row**, **On request**. Keys 1–3 or left/right switch; R remounts. Inputs and the focused player retain their own keys.
- Top State control: Before request, Long wait, Still frame, Playing, Failed, Unsupported. Before request resets the offer fixture. Select passage opens the selection toolbar; real text selection also works.
- A request spends 4 seconds Writing the scene, 8 seconds Rendering, and 5 seconds Checking citations, then plays. These are demonstration timings, not measured generation performance.
- The 12-second SVG loops. Play/Pause, scrub, Reset, follow-up, retry hint, previous version, Export, and Close work. Export downloads an SVG frame; it is not a video export. Follow-up replies are fixed examples. Retry records the hint and a new version, retaining the previous one; it reuses the demonstration animation.
- Reader / Canvas share the explainer version, timeline, follow-ups and unfinished follow-up text for the current session. Caption hover or focus highlights the four sentences in the Reader. Caption click from Canvas returns to them. Canvas ground supports drag and wheel pan, zoom, Overview and Focus explainer.
- Card size is an inspection control. Medium: approximately 693px wide and 442px tall in the Reader, with a 226px visual; Small and Large vary the visual height. The accepted rule is column width with height determined by the concept; these sizes remain comparison specimens.

## Screenshots

| State | Evidence |
|---|---|
| Margin icon | [offer-margin.png](offer-margin.png) |
| Sidebar row | [offer-sidebar.png](offer-sidebar.png) |
| No offer until asked | [offer-on-request.png](offer-on-request.png) |
| Selected passage | [reader-selection.png](reader-selection.png) |
| Writing the scene | [loading-writing.png](loading-writing.png) |
| Rendering | [loading-rendering.png](loading-rendering.png) |
| Checking citations | [loading-citations.png](loading-citations.png) |
| Reader, playable | [reader-playing.png](reader-playing.png) |
| Caption hover | [caption-hover.png](caption-hover.png) |
| Scrubbed | [reader-scrubbed.png](reader-scrubbed.png) |
| Closed, event retained | [reader-closed.png](reader-closed.png) |
| Follow-up | [follow-up.png](follow-up.png) |
| Retry hint | [retry-hint.png](retry-hint.png) |
| Partial, still frame | [reader-still.png](reader-still.png) |
| Render failed | [reader-failed.png](reader-failed.png) |
| Unsupported citation | [reader-unsupported.png](reader-unsupported.png) |
| Canvas, focused explainer | [canvas-card.png](canvas-card.png) |
| Canvas, overview | [canvas-overview.png](canvas-overview.png) |
| Smaller desktop | [reader-1024.png](reader-1024.png) |

Reader evidence: 1440×1050; smaller desktop: 1024×900; Canvas: 1600×1100. [Export specimen](exported-frame.svg).

## Inputs and limits

The full Answers of **May the AI speak first?**, **State grammar**, **Reader**, and **Explainers** were read, including their addenda. The **Prototype: canvas branching with real project content** ticket was still claimed with no Answer at capture. Its available brief, complete HTML fixture/behavior, and screenshots were read; this explainer copies its working fixture and card material and adds one question/explainer branch. It does not claim that the Canvas choices have been approved. Working source: [Canvas prototype](../canvas/index.html). Snapshot SHA-256: `b1407d91e2d0d5e63774d0ec455601cd3e21566b5c194facfc9da4faf6237c83`.

Paper excerpt comes from the user-supplied `Applied Research - Screens.dc.html`; equation and sentence order were checked against [the original paper, §3.2](https://arxiv.org/html/1706.03762v7#S3.SS2). Only the relevant excerpt is shown. Sentence numbers are prototype anchors counted from the opening of §3.2; they are not identifiers supplied by arXiv. The four spans cited are the query/key dimensions, dot-product/scaling/softmax operation, Q batching, and K/V batching. The diagram uses illustrative values, not paper experiment data. Lecture 4 remains an illustrative locator inherited from the Canvas fixture.

Fonts are the Google Fonts distributions of Newsreader, Familjen Grotesk, Martian Mono, and Fraunces (SIL Open Font License). Material authority is the original design canvas and surfaces charter, which override the later typography in DESIGN.md for this task. Caption text is shown in the interface face at 12px so the required line remains legible at card width; readable interface text was accepted in the live caption decision.

## Verification

[Machine-readable results](verification.json): Newsreader 18px / 27.9px (1.55), max-width 68ch; passage moved 0px when opening and closing; four sentence highlights; native keyboard scrub; long-wait stages followed by playback; focus returned to the passage; follow-up recorded; new retry version; SVG downloaded; caption returned from Canvas; shared timeline and unfinished input preserved; Canvas pan verified; no document overflow at 1024px; reduced motion starts paused; no browser JavaScript errors in tested flows.

[Impeccable detector report](detector.json) ran once in degraded regex mode because parser modules were unavailable. It could not evaluate computed contrast. Font and warm-rule findings are pinned by the requested material system; dot grid belongs to the Canvas; the picker is the verbatim skill harness. This is a prototype check, not a full production accessibility audit.

## Accepted decisions

Aaryan completed the seven decisions on 2026-09-06. [The resolved ticket](../../../../.scratch/surfaces/issues/16-prototype-explainer-inline.md#answer) is the final contract: below-only reflow; column width and height determined by the concept; continuous scrubbing with clickable concept steps; Enlarge and preserved close/return state; full caption in both views; compact Canvas card that opens in place; **On request**, with unsolicited offers disabled.

The HTML and screenshots are retained as the exploration that informed those choices. They have not been promoted into production or revised to demonstrate every decision made afterward. In particular, named clickable steps, Enlarge, the exact accepted collapse/return behavior, and the compact Canvas resting state are specified in the Answer but are not all implemented by this original harness. The rejected margin/sidebar variants remain available for comparison. The Answer and addenda supersede the exploration wherever they differ.
