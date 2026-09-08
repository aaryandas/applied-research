# 13 · The shell: how surfaces are arranged and how you move between them
Type: grilling
Status: resolved
Blocked by: 04, 11, 12
(Unblocked from 06 on 2026-09-06: the Codex screenshots serve the critic's comparison, not this decision.)

## Question
How are the surfaces arranged and how does one move among them: sidebars, tabs, layers, split views, the command menu (⌘K), the window model, project switching? What persists across moves (reading position, canvas viewport, open card)? How is a running background task (ingest, explainer render, compile) shown? How does the leader layer appear in chrome for a mouse user? This ticket also fixes the final surface roster.

## Inputs
Resolutions of *Keyboard grammar*, *Canvas ↔ Reader*, *Map and Canvas*; bars: Linear, Arc, Codex desktop (after *Capture the missing reference assets*), Raycast; `docs/designs/prompt-2-screens.md` shell 240 / 68ch / 320 and screen 10 (⌘K as a lookup, not discovery).

## Resolution must state
The shell described in words (a diagram is welcome as an asset). The arrival path to every surface. ⌘K's scope and grouping. The persistence rule. The running-task state. The final list of surfaces that `SURFACES.md` will have a section for.

## Starting recommendation
Left sidebar: projects, then sources; center: one of Reader, Canvas, Map, Workbench; right sidebar: context that follows the center (arguments, questions, annotations; band detail on the Map). Surfaces are peers, switched by leader chord or sidebar; the Reader alone may push layers. ⌘K finds vault objects and surfaces, never the web. Everything you left is where you left it.

## Answer
Decided 2026-09-06 with Aaryan.

**Window layout.** Left sidebar: projects, then the current project's sources grouped by the lesson they belong to, and at its bottom a **jobs panel** listing running background work with real progress in words ("Parsing Lecture 7 · 3 of 12 sections"); failures follow the state grammar (silent, shown on the object). Center: one main view. Right sidebar: context that follows the main view (Reader: outline, questions, and notes for this source; Canvas: the selected node's lessons, statuses, and sources; Workbench: the writing field's "show" panel). Both sidebars collapse (⌘\ and ⌘⇧\). Top: a breadcrumb bar with Back and Forward, the view switcher, and the current title (`Attention is all you need › §3.2 · 2 deep`). No status bar.

**Three main views.** Reader, Canvas (the Learning Path skeleton with the user's cards), Workbench (tabs: Notes, Insights, Theses, Playbook; the Context pack is an Export button on the Playbook tab). Switched by the view switcher or Space r / Space c / Space w. Opening a project lands on the Canvas.

**Outside the main views.** The Opening screen appears only when no project is open: first run, the two doors, the narrowing dialogue, the written "What do you already know?" summary, the diagnostic. Settings opens as a window over everything (⌘,). Components with their own contract sections in `SURFACES.md`: Explainer card, Pointing assistant, ⌘K finder, and the shell itself.

**History.** The shell keeps a browser-style history of view moves. Back (⌘[) and Forward (⌘]) restore the previous view exactly: scroll line, Canvas viewport and selection, open layer.

**Persistence.** Everything reopens where you left it: last project, last view, reading position per source, Canvas viewport, open Workbench tab, sidebar states, drafts in any text field.

**⌘K finder.** One search box over the vault plus commands, results grouped: Sources, Passages (full text over sentences), Your writing (notes, insights, theses), Questions, Views and commands. Enter opens the result in the right view at the right place. Typing `>` first shows commands only. It never searches the web. ⌘K with a Reader selection active is Explain.

**Surface roster for `SURFACES.md`:** Shell, Opening screen, Reader, Canvas (with the Learning Path), Workbench (with the Playbook and Context pack), Settings; components: Explainer card, Pointing assistant, ⌘K finder.

### Addendum 2026-09-06 (from *Reader*)
Left sidebar: the active project's name with a switcher (not a list of projects), then sources grouped by the lesson they belong to and nested by container inside a lesson (a course's lectures, a book's chapters), each with ingest and read state, an Add source button, the jobs panel; collapse state remembered per view, collapsed by default in the Reader. Right sidebar: in every view one scrolling details panel with collapsible sections, no tabs.

### Addendum 2026-09-06 (from *The Workbench ladder*)
The Workbench is removed. Three main views: **Reader, Canvas, Playbook** (Space r / c / p). The Playbook is the compiled read-only view of the Canvas's upper layers with Export; its contract is the *Playbook and Context pack* ticket. Right sidebar on the Canvas adds the show panel while writing an insight or thesis. Surface roster: Shell, Opening screen (with the question door as a state), Reader, Canvas (Learning Path, cards, elevation), Playbook, Settings; components: Explainer card, Pointing assistant, ⌘K finder.
