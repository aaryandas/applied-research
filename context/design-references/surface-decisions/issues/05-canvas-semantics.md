# 05 · Canvas semantics: what a card is and what branches
Type: grilling
Status: resolved
Blocked by: —

## Question
What is a card on the Canvas, what can branch from what, and what may sit on it? Is a branch a question, a source, or a thought? Are answers cards or attachments to question cards? Are notes leaves only? Can insights and theses be canvas nodes, or only reference the canvas? Does a source (paper, lecture, chapter) appear as a card? Is "What do you want to understand?" the canvas's only input? Can a card exist with no sentence behind it?

## Inputs
Decided upstream in *May the AI speak first*: an explainer is one event shown inline and as a Canvas card; whether placing things on the Canvas is human-only or automatic is this ticket's call.
`references/canvas/wondering-branching-canvas.png` (the spec in spirit: question→answer cards, notes as leaves, organic connectors, one bar, web-search toggle); Heptabase and tldraw bars; doctrine (AI writes only cited facts; insights/theses human-only).

## Resolution must state
Node types with author and what each references (event ids, sentence ids). Allowed edges and what a connector means. The input bar's behavior. What the AI may create on the canvas (and only in reply to what). Whether the canvas is per project. Where human notes and theses live versus what they reference.

## Starting recommendation
A card is a view of one event. Branches are questions (human). Answers are AI cards, always children of a question, always citing sentences. Notes are human leaves on any card. Insights and theses are human cards that live in the ladder and may be placed on the canvas; the canvas references them. Sources are not cards: they are locator chips on answer cards that open the reader. The bar is the only way to make a question card. Nothing on the canvas is uncited except human words.

## Answer
Decided 2026-09-06 with Aaryan.

**A card is one event.** Every card on the Canvas is a view of exactly one event in the log. Card types and authors:

| Card | Author | Connected to | Cited? |
|---|---|---|---|
| Question | human | its parent question or answer, or the source passage it was asked from; a root if none | shows the selected passage as a quote when asked from the Reader |
| Answer | ai | always beneath its question | always; each citation is a chip |
| Follow-up question | human | branches from an answer | as Question |
| Note | human | a leaf on any card | no (human words) |
| Explainer | ai | the passage or answer it explains | always |
| Insight | human | the answers and notes it draws from | optional references |
| Thesis | human | the root of the branches it grew from | its evidence references |

Insights and theses live in the Workbench with their required fields; their Canvas cards reference them. Sources are not cards: they appear as **citation chips** on answer cards (short title and section, e.g. "Attention is all you need · §3.2"); clicking a chip opens the Reader at that sentence and highlights it. Connectors mean "came from": a child came from its parent. Nothing on the Canvas exists without an event behind it; nothing AI-authored exists without citations.

**Questions arrive automatically.** Every question, wherever it is asked (a Reader selection, the Canvas text box, a follow-up), is one event and appears on the Canvas attached to its parent or its source passage. The human never sends anything to the Canvas. Layout is human; existence is automatic. So placing on the Canvas is not a human-only verb; arranging is.

**Two ways to ask on the Canvas.** The text box at the bottom ("What do you want to understand?"): Enter creates a question attached under the selected card, or a new root if nothing is selected, and streams the answer beneath it. Dragging out of any card starts a follow-up question attached to it, in place.

**The "Find new sources" switch** on the text box. Off: the answer uses only sources already in the project, and says so if nothing supports it. On: before answering, the sourcing loop may search OpenAlex, Semantic Scholar, and the web for new sources, add them to the project, and cite the ingested text. Web pages themselves are never cited.

**One Canvas per project**, infinite. Questions asked from different sources form separate roots on the same canvas; the human can drag roots apart or together. Pan, zoom, and viewport position persist across visits.

**States** (from *State grammar*): empty = no questions yet, one sentence and the text box; loading = an answer streaming into its card; failed = the answer card shows the failure with retry, the question stays; unsupported = a badge on any answer claim that did not verify.

### Addendum 2026-09-06 (from *Map and Canvas*)
The Canvas has a fixed skeleton: the Learning Path tree (subject → topics → lessons). Question cards attach to the lesson their cited sources belong to and branch from that lesson node; roots are lesson nodes, not free cards. Free arrangement exists only inside a lesson's area. The text box asks about the selected lesson. "One infinite canvas per project" stands; "roots per starting point" is replaced by "roots are lessons".

### Addendum 2026-09-06 (from *The Workbench ladder*)
The Canvas has elevation. Ground: Learning Path, questions, answers, notes, explainers. Above: insight cards connected down to what they draw from. Top: thesis cards connected down to insights. Insights and theses are created only by Connect and Take a position on the Canvas, or by the Reader's Insight verb. "Insights and theses live in the Workbench" is withdrawn: they live here.

### Addendum 2026-09-06 (from prototype 17)
Everything on the Canvas is movable, Learning Path nodes included; the app proposes the first layout only. Human text edits in place as a new event version; AI text is never edited. Chips carry a source-kind icon, a hover preview of the sentence, and open the Reader on click. Every card has a + handle: drag to ask at the drop point, click to ask beneath.
