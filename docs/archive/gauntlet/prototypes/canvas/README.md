# Canvas prototype

Open [the standalone HTML](index.html), or serve this directory and open `http://127.0.0.1:8787/`. The file embeds its CSS, JavaScript, fonts and Phosphor Light SVGs. It needs no framework, build or network connection.

[Canvas brief](../../briefs/canvas.md)

| Comparison | Tests | Cost |
| --- | --- | --- |
| Compact | Short previews, curved connectors, full answers on zoom-in | Less evidence visible in overview |
| Expanded | Larger cards, full answers, measured spacing and rounded connector corners | More panning |
| Right angles | The same spacious layout with square connector corners | More corners, especially in crowded branches |

Use the top picker or 1/2/3 to switch. Arrow keys also switch comparisons. The **30 cards** button adds twenty event cards; the seventeen Learning Path nodes are counted separately. **Overview** fits the full graph; **Read a branch** opens a readable close-up. Drag empty ground to pan. Wheel/trackpad pans; pinch or Ctrl/Command + wheel zooms around the pointer. Plus/minus also zoom.

Shift-click two cards, then **Connect**, or use **Try Connect** to select the two cited answers and open the empty writing field above them. Save requires your words. **Take a position** requires a claim, evidence and a falsifier; Gap also requires what the industry does instead. Drafts are temporary and switching comparisons resets them.

Drag a card's circular **+** into empty space to create an attached follow-up draft. Escape cancels without adding a card. The bottom text field also creates a question. The source switch changes the request's scope, but the prototype has no live search or AI; new questions are preserved with an explicit unsupported result.

The two citation chips open a Reader demonstration with a highlighted location. **Back to Canvas**, Escape or Command-[ restores the viewport and selection. The right sidebar is one scrolling details panel. Select the root to see all twelve lessons and their statuses. Ready/Empty/Loading/Failed/Partial in the prototype toolbar exposes the representative states; failed answers retain their question and a Retry action.

## Evidence

- [Zoomed out](zoomed-out.png)
- [Zoomed in](zoomed-in.png)
- [Connect](connect.png)
- [Thirty cards](thirty-cards.png)
- [Expanded](expanded.png)
- [Right angles](right-angles.png)
- [Interaction checks](checks.json): 25 checks passed in Chromium through `/browse`; no console messages.
- [Gesture checks](gesture-checks.json): pointer-event handler simulations for pan, connector preview, parent preservation and cancellation. These are handler checks, not a trackpad usability study.

The existing note, insight and thesis text is illustrative human-authored content for the study. The paper explanation is paraphrased from [Vaswani et al., §3.2](https://arxiv.org/html/1706.03762v7#S3.SS2). “Lecture 4 · 12:40” is the user-specified illustrative locator; no verified recording is claimed. Additional stress-view questions are fixtures, and unsupported experiment questions are marked accordingly.

## Awaiting the live discussion

No design comparison is approved yet. Review one decision at a time: density at thirty cards; connector shape; whether elevation reads; citation-chip appearance; drag-from-card behavior. Observed tradeoffs include tiny text when the entire thirty-card graph is fitted, long cross-lesson evidence connectors, and the amount of panning required for full answers. These are questions for the prototype discussion, not settled product rules.

## Revision 2 · after the live density feedback

Expanded and Right angles now share measured card geometry. Each lesson owns its questions, notes and follow-ups, including the additional twenty cards. Adding cards preserves the reading camera. The Learning Path uses single shared branches with visible junctions; evidence routes pass around the card areas. Selecting an event emphasizes its immediate connections. The Connect toolbar moves beside the top controls and disappears while the draft is open; the camera fits the draft and both evidence cards horizontally.

The light palette is a new local proposal: cool gray workspace, white answer cards, warm paper for human writing, dark ink, teal selection. The global design system is unchanged.

Latest evidence: [light](expanded-v2-light.png), [dark](expanded-v2-dark.png), [overview](overview-v2.png), [Connect](connect-v2.png), [thirty cards at working zoom](thirty-cards-v2.png), [square connectors](right-angles-v2.png).

[Thirty checks passed](checks-v2.json): Expanded and Right angles at ten and thirty cards have no overlapping nodes, no connector through a card and no unrelated connector crossings; intentional shared-parent junctions are drawn once. Camera preservation, citation Back, Connect bounds and measured text contrast passed. All checked text pairs exceed 4.5:1 in both themes. [Gesture handler checks](gesture-checks-v2.json) also passed; no console messages were reported. The layout detector could only run its regex fallback because parser modules were unavailable, so the geometric and computed-style browser checks supply the useful verification.

The fit-all overview remains a spatial navigation view; thirty full answers cannot all be readable in one viewport. Automatic collapsing is still unapproved. The current proposal keeps full answers at working zoom and lets the user pan between clearly separated lesson areas. Connector shape, elevation, chips and drag-from-card remain live decisions.

Switching Expanded and Right angles now preserves camera and selection. Browser comparison confirmed identical node positions, widths and measured heights; the connector corners are the comparison variable.
