# 17 · Prototype: canvas branching with real project content
Type: prototype
Status: resolved
Assignee: Aaryan (Codex)
Blocked by: 05, 11

## Question
How does the Canvas feel with real content, with the Learning Path tree as its skeleton (subject → topics → lessons, statuses shown) and question cards branching off lesson nodes: three questions, two cited answers, two human notes, one insight referenced, the single "What do you want to understand?" bar? React to: card density, how a branch reads at 30 cards, what a locator chip looks like and does, connector shape, pan and zoom feel, what the reader round trip feels like.

## Method
`impeccable shape` brief first, then `/prototype` (tldraw is the likely base per `references/README.md`). Bars: both Wondering screenshots (`canvas/wondering-branching-canvas.png`, `canvas/wondering-learning-map.png`), tldraw, Heptabase.

## Resolution must state
The card anatomy and density decision, connector semantics as drawn, and any change forced on *Canvas semantics* or *Canvas ↔ Reader* (as addenda).

### Scope addendum 2026-09-06
Include elevation: one insight card above two question trees from different lessons, one thesis above it, and the Connect gesture. React to whether the vertical layering reads at a glance when zoomed out.

## Comments

### Prototype prepared 2026-09-06

Claimed for Aaryan by Codex. Read the map's Decisions so far and the full Answers and addenda in *Canvas semantics*, *Canvas ↔ Reader*, *Map and Canvas*, *The Workbench ladder*, and *The Learning Path*.

`impeccable shape` brief: [Canvas](../../../docs/gauntlet/briefs/canvas.md). The user's precise request authorizes proceeding from the brief directly into the throwaway prototype.

Prototype: [Canvas comparison](../../../docs/gauntlet/prototypes/canvas/index.html), with Compact, Expanded, and Right angles in one standalone HTML file. [Controls, validation and limitations](../../../docs/gauntlet/prototypes/canvas/README.md). Captured through `/browse`: [zoomed out](../../../docs/gauntlet/prototypes/canvas/zoomed-out.png), [zoomed in](../../../docs/gauntlet/prototypes/canvas/zoomed-in.png), [Connect](../../../docs/gauntlet/prototypes/canvas/connect.png), and [thirty cards](../../../docs/gauntlet/prototypes/canvas/thirty-cards.png).

**Awaiting Aaryan's answers.** Discuss, in order and one question at a time: card density at thirty cards; connector shape; whether elevation reads; citation-chip appearance; the drag-from-card gesture. No prototype choice is an Answer yet. Keep this ticket claimed. On resolution, write the Answer here and append only changed rules to *Canvas semantics*, *Canvas ↔ Reader*, *Map and Canvas*, and *The Workbench ladder*. Do not change any other ticket.

### Live discussion · density and clarity · 2026-09-06

Aaryan prefers Expanded or Right angles, with a slight preference for Expanded and no final connector choice. Cards and branches should be more spaced out and organized, with no confusing overlaps between connections. The current light palette is rejected and should be redesigned. The design must work backward from the builder's learning and evidence-tracing problems, with a high standard of product judgment and UI/UX craft.

Confirmed direction: spacious, readable cards and unambiguous relationships. Automatic branch collapsing has **not** been approved. Connector shape, elevation, chips and drag-from-card behavior remain open for the one-at-a-time discussion. Prototype revision will compare Expanded and Right angles on the same measured layout and treat light mode as a new local proposal, not a global token decision.

### Revised prototype · 2026-09-06

Applied the confirmed spacing and clarity direction: measured card layout, lesson-owned question areas, single shared branches with explicit junctions, evidence routed around cards, and unchanged reading camera when thirty cards are loaded. Expanded and Right angles now have the same geometry; their connector corners differ. Selection emphasizes related connections. Connect hides the selection toolbar while writing and fits both selected evidence cards horizontally.

Light mode has been reworked as a local proposal: cool gray workspace, white answer cards, warm paper for human writing, dark ink and teal selection. This does not approve a global palette.

Evidence: [light](../../../docs/gauntlet/prototypes/canvas/expanded-v2-light.png), [dark](../../../docs/gauntlet/prototypes/canvas/expanded-v2-dark.png), [Connect](../../../docs/gauntlet/prototypes/canvas/connect-v2.png), [thirty cards](../../../docs/gauntlet/prototypes/canvas/thirty-cards-v2.png), and [checks](../../../docs/gauntlet/prototypes/canvas/checks-v2.json). Both spacious comparisons pass checks for overlapping cards, connectors through cards and unrelated connector crossings at ten and thirty cards. Shared-parent junctions are intentional and drawn once. Checked text contrast passes in both themes.

Next live question: rounded connector corners in Expanded, or square corners in Right angles? Recommendation: rounded corners, retaining the same organized routing. No connector choice is recorded as decided yet.

## Answer
Decided 2026-09-06 with Aaryan, from the revised prototype (`docs/gauntlet/prototypes/canvas/`, Expanded v2) and the live discussion.

- **Layout flows left to right.** The Learning Path and the ground (questions, answers, notes, explainers) sit on the left; insights sit to the right of the cards they draw from; theses are the rightmost things on the canvas. The three levels are read as columns, not as vertical layers. At overview zoom, three faint labels along the top edge name them: Ground, Insights, Theses; no lines, no boxes.
- **Everything is movable.** Every card and every Learning Path node can be dragged anywhere; the app only proposes the first layout and re-routes lines around cards. Automatic collapsing of branches is not approved.
- **Only human text is editable in place.** Notes, insights, theses, and your questions edit in place; each edit is a new version of the event. AI answers and explainers are fixed because their text is what the citations verify; you can ask again, try again with a hint, or delete the card.
- **Spacing and clarity.** Measured card layout, each lesson owning the area for its questions, one shared line per parent with explicit junctions, lines routed around cards, no unrelated crossings at thirty cards, and the reading camera does not move when cards are added.
- **Connectors** bend in rounded curves (Expanded), on the organized routing; a selected card emphasizes its own connections.
- **Citation chips**: small monospace lowercase chip with a Phosphor icon for the source kind (book, paper, video) in front; hover shows the cited sentence in a popover; click opens the Reader at that sentence.
- **Ask from a card**: every card carries one + at its lower right; drag it out and a question field appears where you release, connected to the card; a plain click opens the field directly beneath.
- **Connect** hides the selection toolbar while writing and shows both selected evidence cards beside the field; the right sidebar lists the evidence with its chips.
- **Light mode** as proposed in the prototype (cool gray workspace, white answer cards, warm paper for human writing, dark ink, teal selection) is a local proposal for the critic, not a token decision.
