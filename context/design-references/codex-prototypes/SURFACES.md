# Applied Research · Surfaces

Assembled 2026-09-06 from the surfaces wayfinder map (`.scratch/surfaces/map.md`, 27 tickets, all resolved). Every statement here traces to a ticket's Answer; nothing was invented in assembly. Plain industry terms throughout. Glossary: `CONTEXT.md`. Implementation is out of scope: stack, backend, sync, auth, billing, parsers, distribution, observability, testing, and token values live in the gauntlet prompt.

**Open items: 0.** One asset is still pending outside this spec: the original World Labs blue engraved-landscape image (`references/visual-world/world-labs/`); nothing here depends on it.

---

## Part I · Rules every surface inherits

### 1. The five pains and where each is fixed

| Pain | Surface(s) | The moment of understanding | Measured by | Falsified if |
|---|---|---|---|---|
| Context switching across search, PDF, chat, notes | Reader + Canvas | A confusion mid-read becomes a cited answer directly under the passage without leaving it, and the question lands on the Canvas as a branch. | Reading sessions with zero exits to another app; time from selection to first token. | Users still open a browser or chat while reading. |
| Sourcing | Question door + Learning Path | A Brief becomes a tree of topics and lessons with sources under each lesson, and every fact shown afterward has a sentence behind it. | Time from Brief to first ingested source read; share of answers with zero unsupported claims. | Users add sources by hand from a browser. |
| Presenting knowledge digestibly | Reader reflow + Explainers | A dense passage reads as typography, and a hard concept is understood in seconds from an explainer that cites the sentences it animates. | Follow-up questions on a passage fall after an explainer; time on a passage before the first Note. | Users open the original PDF instead of the reflow. |
| Finding the gaps in what you know | Learning Path + diagnostic | The diagnostic places your edge on the tree; the tree shows where known territory ends. | Lessons moving from Not started to In progress after placement; Mastered checks passed. | Users cannot say what they do not know after a session. |
| Synthesizing into insights and ideas | Canvas elevation + Playbook | A thesis standing on insights that stand on cited cards, then a Context pack that changes a coding agent's output. | Theses per project; the agent A/B with and without the pack. | Packs are exported with zero theses. |

Every measure is a query over the event log or an analytics event. None is a mastery score.

### 2. What the AI may do, and what only the human does

**The AI never speaks first.** Every AI act is a reply to a human act: a selection, a question, a summons, a button. Nothing AI-authored appears in the reading column, on the Canvas, or in the Playbook unless the human asked for it there. **Offers are not enabled** anywhere: no unsolicited margin icon, sidebar row, or status message signals that an AI verb is available. A link that reopens something already requested (an existing explanation) is not an offer.

**Programmatic by default.** Background work is event-triggered pipelines with model calls as fixed steps. Visible verbs are single model calls fired by a human act. Agentic loops (a model with tools, turn-capped) exist in exactly three places: sourcing (search, evaluate, propose a curriculum), the one clarifying question at the question door, and explainer scene generation (write, render, verify citations, retry at most twice). No agent watches the user.

**AI verbs** (each an event with author `ai`, each cited or rendered unsupported):

| Verb | What it does | Fired by |
|---|---|---|
| answer | cited reply to a human question (Explain, follow-up, the Canvas text box) | a human question |
| cite | resolve a claim to sentence ids; an unresolved claim renders as "unsupported" | every answer |
| show | a panel of relevant sentences beside a human writing field | opening the field |
| point | move the pointer to a sentence id or a named control, with one cited line | summons |
| explain | render a clip (Manim) or an interactive scene (React Three Fiber) citing the sentences it explains | Explain visually |
| stress-test | the strongest cited case against a thesis from the project's sources | the button on a saved thesis |
| next | what to read or ask next, derived from the computed edge | request from the Canvas or leader key |
| what am I missing | an answer over your own questions and the project's sources citing prerequisite sentences you have not read | request on a question card |
| propose sources | candidate courses, textbooks, papers for a lesson (the sourcing loop) | Find sources for this lesson; Build my learning path; Extend my path |
| draft Brief | a one-line Brief from the two question-door fields; the human edits and owns it | Build my learning path |
| diagnose | the adaptive placement test | Place me |
| check | grade a short written answer against a lesson's sources, reasoning shown with citations, disputable | Check my understanding; Place me |

**Background jobs** (no author, no voice; visible only as state): fetch, parse (including WebVTT transcripts), canonicalize, segment, distill, verify, index, generate the Learning Path, compute prerequisite order, search (OpenAlex, Semantic Scholar, web; finds sources, never cited), scene generation, compile (facts formatted; human text copied by code), sync status (paid), analytics.

**Human-only verbs** (no AI author can ever exist for these): note, insight, thesis; editing the Brief; asking; hiding a topic; moving anything on the Canvas; accepting or dismissing anything; export. In the data model no record at level 3 or 4 may carry author `ai`.

**Tutor role: a computed edge, never a judgment.** Per lesson, from the event log: *In progress* when a source was opened or a question asked; *Completed* when every source the lesson draws from was opened, or the human marks it done; *Mastered* only when a check was passed. *Next* is the shallowest lesson not Completed whose prerequisite lessons are Completed or Mastered; the *edge* is the first lesson with an unmet prerequisite. Statuses are the four words, never a number, score, or streak. The product never says "you understand X".

### 3. State grammar

| State | Meaning | Rendering | Recovery |
|---|---|---|---|
| Empty | nothing here yet | one plain sentence saying what will appear and the single action that fills it; no illustration outside the opening screen | the action |
| Loading, short (under about 3 s) | an answer streaming, a card opening | content arrives in place with a small live indicator at the arrival point | none needed |
| Loading, long | ingesting a source, rendering an explainer, compiling, building the path | a designed animation in the empty area (Field Atlas language, engraved lines drawing themselves) with the real stage in words beneath it; honors reduced motion; never a spinner or fake progress bar; a determinate bar only for file uploads | none needed |
| Partial | what exists is usable now | a one-line label says what is still missing | wait, or the missing part's own action |
| Failed, foreground | the user was waiting on it | a toast at the bottom (cause in plain words, one Retry, auto-dismiss) and the place it happened keeps the user's input and a retry | Retry |
| Failed, background | the user had moved on | never interrupts; the source row, card, or node shows its failed state with Retry when reached | Retry |
| Stale | a derived document older than the events it came from | a one-line label with the one refreshing action; sources are immutable so a stale anchor cannot occur | refresh |
| Unsupported | a claim whose citation did not verify | a badge on the claim, never prose, never hidden | ask again |

No modals. No status-bar counters.

### 4. Keyboard grammar

- **Leader: Space.** Outside any text field, Space opens a which-key popup listing the next keys; nothing happens until the second key. Space r Reader, Space c Canvas, Space p Playbook, Space s Settings, Space n new question, Space f find sources for the selected lesson, Space a pointing assistant (type), Space i Connect, Space t Take a position, Space k Check my understanding, Space P Place me, Space ? cheat sheet. No modes exist outside the reader.
- **Reader: full vim.** j/k lines, h/l sentences, gg/G, { } paragraphs, [ ] sections, / search then n N, counts. v starts a visual selection over sentences; with a selection: e Explain, n Note, i Insight, x Explain visually. Enter opens a citation or a collapsed card; Tab moves between cards; Esc closes the innermost open thing and returns the cursor to the exact line. No insert mode: typing happens only in a text field.
- **Text fields** swallow every key except Esc (leave, keep the draft) and ⌘Enter (save).
- **Cheat sheet:** ? anywhere outside a field opens one global searchable sheet grouped by surface, the current surface expanded first.
- **Shortcut hints** are always shown in menus, tooltips, and the command menu, and only there; no on-screen element carries a badge. Every keyboard action has a visible pointer path.
- **⌘K** opens the finder; ⌘K with a Reader selection is Explain. **⌘[ / ⌘]** Back and Forward. **⌘,** Settings. **⌘\ / ⌘⇧\** collapse left and right sidebars.

### 5. Event vocabulary

| Event | Level | Author | References | Written by | Read by |
|---|---|---|---|---|---|
| project-created | – | human | – | Opening screen | Shell |
| brief | – | human | – | Opening screen, Canvas | Canvas, Playbook |
| source-added | – | human | source id | Opening screen, Canvas, Reader | Shell sidebar, Canvas |
| learning-path | – | ai | sources per lesson | Canvas (generation) | Canvas, Reader (Lesson section), Playbook |
| topic-hidden | – | human | topic id | Canvas | Canvas |
| question | 1 | human | parent event or sentence ids | Reader, Canvas, Pointing assistant | Canvas, Reader marks |
| answer | 1 | ai | its question; sentence ids | answer verb | Reader card, Canvas card, Playbook facts |
| explainer | 1 | ai | sentence ids; medium; hint | explain verb | Reader, Canvas, Playbook (still frame) |
| note | 2 | human | sentence ids or a card | Reader, Canvas | Reader marks, Canvas leaf, evidence panel |
| insight | 3 | human | cards and/or sentence ids | Reader (Insight), Canvas (Connect) | Canvas, Playbook |
| thesis | 4 | human | insights, sentence ids; kind Critique or Gap | Canvas (Take a position) | Canvas, Playbook |
| stress-test | 1 | ai | its thesis; sentence ids | stress-test verb | Canvas beside the thesis, Playbook |
| check-answer | 2 | human | lesson; question text | Place me, Check my understanding | Canvas (status derivation) |
| check-grade | 1 | ai | its check-answer; sentence ids | diagnose, check | Canvas (status); disputable |
| lesson-status | – | derived | lesson; status | the status rule | Canvas nodes, Reader Lesson section, Playbook |
| pack-exported | – | human | hash; file list | Playbook | Playbook (stale rule) |
| settings-changed | – | human | keys present or not, vault, analytics | Settings | Shell |

Human text edits in place create a new version of the same event. AI text is never edited.

---

## Part II · Surfaces

Roster: Shell, Opening screen, Reader, Canvas (with the Learning Path), Playbook, Settings. Components: Explainer card, Pointing assistant, ⌘K finder. Three main views switch in the breadcrumb bar and by Space r / c / p.

### Shell

**Job.** Hold three views and make moving between them free: where am I (left), what am I looking at (center), what is this thing (right).

**How you arrive.** Opening a project (lands on the Canvas); relaunch (last project, last view).

**Primary flow.** Left sidebar: the active project's name with a switcher, then sources grouped by the lesson they belong to and nested by container inside a lesson (a course's lectures, a book's chapters), each with ingest and read state, an Add source button, and at the bottom a jobs panel listing running background work with real progress in words. Center: one main view. Right sidebar: one scrolling details panel with collapsible sections, no tabs, following the center view's selection. Top: a breadcrumb bar with Back and Forward, the view switcher (Reader · Canvas · Playbook), and the current title. No status bar. Both sidebars collapse; collapse state remembered per view; the left sidebar is collapsed by default in the Reader. The shell keeps a browser-style history of view moves; Back restores the previous view exactly (scroll line, Canvas viewport and selection, open layer). Everything reopens where you left it: last project, view, reading position per source, Canvas viewport, sidebar states, drafts.

**States.** Empty: n/a (the Opening screen owns no-project). Loading: jobs in the jobs panel with stage text. Partial: a course row "7 of 12 lectures ready". Failed: background failures on the source row with Retry, silent. Stale: n/a. Unsupported: n/a.

**AI may / Only the human.** AI: nothing in the shell. Human: everything.

**Keyboard.** Space leader; ⌘[ ⌘]; ⌘\ ⌘⇧\; ⌘K; ⌘,.

**Reference bar.** Linear desktop (keyboard-first shell, list density), Arc (sidebars and layers), Codex desktop (quiet chrome, running-task state; `references/chrome/codex-desktop/`), Raycast (command menu).

**Event log.** Reads source-added, lesson-status, settings-changed. Writes nothing.

### Opening screen

**Job.** Get from nothing to a project you can read in, on one screen; on return, get back to where you were.

**How you arrive.** Launch with no project open; closing a project.

**Primary flow.** The Field Atlas illustration is the ground, the one place an illustration is allowed; it does not carry state. On it, in order: *first run only*, two setup lines settled in place with no wizard ("Your vault: ~/Applied Research · Change", "Model: sign in for managed keys, or paste a key · Add") and one line "Usage analytics are on; nothing you read or write leaves this machine. Turn off". Then the two doors. **Start from a question**: two plain fields, *What are you building?* (with three example answers beneath) and *What do you already know about it?*, and one primary button, **Build my learning path**. If the first answer is too broad to source, the app asks exactly one clarifying question in the same large type with a free-text answer and Skip; never more. Then the long-wait animation with stage text ("Finding courses", "Reading syllabi", "Building your path", "Pulling sources") and you land on the Canvas with a drafted one-line Brief ("I'm building X and need to understand Y") editable at the top of the tree; the human owns it after any edit; the "already know" text is saved as the project's first Note. **Start from a source**: one field accepting a URL, DOI, arXiv id, course URL, or a dropped file (PDF, EPUB, HTML); dropping anywhere shows a full-screen drop state; you land in the Reader with the source's own structure as the first tree. *Returning users* see their projects listed under the doors, each with its Brief and where they left off; Enter opens it there.

**States.** Empty: first run, no vault yet. Loading: the long-wait tier after a door. Partial: the tree built but some lessons have zero sources yet (shown on the tree). Failed: vault folder unwritable (inline on the vault line, Choose another); unreachable id or URL (inline under the field, input kept, Retry); sourcing found nothing (fields return with the message, Retry, and "Start from a source instead"). Stale: n/a. Unsupported: n/a.

**AI may / Only the human.** AI: draft the Brief, ask one clarifying question, propose the tree and sources. Human: everything typed, the vault choice, keys, the analytics toggle, editing the Brief.

**Keyboard.** Tab between fields and doors; ⌘Enter submits the focused door; ⌘O opens a file; Esc on the clarifying question skips it; arrows and Enter on the projects list.

**Reference bar.** World Labs (first viewport), Field Atlas (illustration and buttons), Wabi site and Cosmos (restraint).

**Event log.** Writes project-created, brief, note, source-added, settings-changed; triggers learning-path.

### Reader

**Job.** Read one source closely and turn confusion into cited understanding and your own words without leaving the passage.

**How you arrive.** A source in the left sidebar; a source under a lesson in the Canvas side panel; a citation chip on a card; a ⌘K result; a citation inside another source (opens as a layer); Back.

**Primary flow.** Papers, chapters, and documents are reflowed: Newsreader 18/1.55 on a 68-character measure; MathML; figures, tables, captions in place; references at the end. Select a passage; the toolbar appears anchored to the selection within 150 ms with four verbs: **Explain · Note · Insight · Explain visually**. Explain opens a field with the passage quoted and two presets, *Explain this* and *Check this claim against my other sources*, or your own question; the answer streams as an inline card beneath the passage, every claim cited to sentence ids, unverified claims badged. Note and Insight open a human writing field in the margin material; beside it the show panel lists the passage and up to three related sentences, never text inside your field. Explain visually requests an explainer card. Every question also appears on the Canvas under the lesson its cited sources belong to; an insight appears to the right of that passage's card. Once a text answer would exceed roughly a third of the window it opens as a **layer** over the source with its own breadcrumb entry, the source dimmed beneath; Esc pops it and returns to the exact line. Follow-ups append inside the same card or layer. A citation to another source opens it as a layer, unlimited depth, the breadcrumb collapsing in the middle. An answer may cite any source in the project; each citation carries the source's short name and locator ("Vaswani · §3.2", "Lecture 4 · 12:40", "Goodfellow · ch. 9"). **Lectures are watched, not read**: the video fills the column's width with the sentence being spoken shown as a live line beneath it and the previous few faint above; the full transcript lives in the right sidebar's Outline section, searchable, click to seek; pressing any verb pauses the video and anchors to the sentence being spoken (Shift ← extends the moment back); Save resumes; notes and questions appear as markers on the timeline; a citation to a lecture opens it playing from that moment with the sentence highlighted. Lecture notes or slides are separate readable sources under the same lesson. Right sidebar sections: **Lesson** (which lesson this source belongs to, its status, link to it on the Canvas), **Outline** (sections or timestamps, following your scroll), **Your marks** (questions, notes, insights on this source in reading order, a glyph per kind, those near your position highlighted). Margin markers at each passage with a mark. A one-time hint on the first source: "Select any passage to ask about it."

**States.** Empty: n/a. Loading: sections arriving in place, top first, one caret at the end of the last section; the long-wait animation only before the first section lands. Partial: some sections parsed; a "this region did not parse, view original" block with the page crop; a transcript without its media (player shows the failure and a link to the original page). Failed: fetch or parse failure inline in the source row and at the top of the column, input kept, Retry, "Open original document". Stale: n/a. Unsupported: the badge on any card claim whose citation did not verify. Hidden text detected in a PDF is excluded and shown behind a banner.

**AI may / Only the human.** AI: answer, cite, show, explain, point when summoned. Human: ask, note, insight, select, accept an explainer.

**Keyboard.** Full vim (Part I §4). On a lecture: Space play/pause, ← → seek by sentence, Shift ← extend the moment, t jump to the transcript.

**Reference bar.** Readwise Reader (keyboard-driven reflow reading), arXiv HTML (structure fidelity), iA Writer (measure), Semantic Reader (in-context cards).

**Event log.** Reads source, sentences, every event anchored to this source. Writes question, answer, note, insight, explainer. Emits nothing to other views directly; the Canvas and Playbook fold the same events.

### Canvas (with the Learning Path)

**Job.** Learn and think in one place: see where you stand in the domain, ask from anywhere, and build insights and theses on what you have read. Home of pains 1, 2, 4, and 5.

**How you arrive.** Opening a project; Space c; the view switcher; a Reader mark's "show on Canvas"; Back.

**Primary flow.** One infinite canvas per project with a fixed skeleton, the **Learning Path**: a tree with the project's subject at the root (the Brief, or the source's title), topics as branches, lessons as leaves, generated once by the sourcing loop from the syllabi and tables of contents of the courses and textbooks it found (roughly five to nine topics, two to five lessons each, surveys and seminal papers filling depth under thin lessons); a source-first project's first tree is the source's own structure. Prerequisite order is inferred from course order, citation direction, and the model's reading; no source exposes prerequisites, and the root's side panel says "order inferred". The tree changes only when you add a source (new lessons marked new) or press **Extend my path** on a topic; statuses and cards are never lost. Topics can be hidden with one click and unhidden from the side panel. Every lesson shows its status as a word (Not started, In progress, Completed, Mastered); the tree marks **Next** and the **edge**. Selecting a node opens the right sidebar: its lessons and statuses; for a lesson, the sources it draws from with read state (click opens the Reader there), the questions asked about it, **Find sources for this lesson** (results as rows with Add), **Check my understanding**, and on a topic **Extend my path**.

Every card is a view of exactly one event. Questions arrive automatically wherever they were asked, attached to the lesson their cited sources belong to; answers hang beneath their questions, always cited; notes are leaves on any card; explainers attach to the passage or answer they explain. Sources are not cards: they are **citation chips** on answer cards (monospace lowercase, a Phosphor icon for the kind, hover shows the sentence, click opens the Reader there). Two ways to ask here: the text box at the bottom, "What do you want to understand?", with a **Find new sources** switch (off: only the project's sources; on: the sourcing loop may find, ingest, and cite new ones; web pages themselves are never cited), asking about the selected lesson or the root; and the **+ handle** on every card (drag to ask at the drop point, click to ask beneath).

**The ladder is elevation, flowing left to right.** Ground on the left: the tree, questions, answers, notes, explainers. **Insights** (human-only) sit to the right of the cards they draw from, often bridging two lessons; an insight may also come from a Reader passage. **Theses** (human-only) are the rightmost things, standing on insights. At overview zoom three faint labels along the top name the columns: Ground, Insights, Theses. Two gestures create them: **Connect** (select one or more cards, Space i; a human field opens beside them, "What do these tell you together?"; the show panel lists the sentences those cards cite; Save places the insight) and **Take a position** (select insights or cited passages, Space t; Kind Critique or Gap, Claim, Evidence pre-filled and editable, What would prove me wrong, and for Gap What the industry does instead; Save disabled until claim, one piece of evidence, and the falsifier exist). On a saved thesis, **Stress-test** renders the strongest cited case against it beside the thesis. A learning-only project has a flat profile; nothing is asked at any lesson.

**Everything is movable**, nodes included; the app proposes the first layout and re-routes lines around cards. Human text edits in place; AI text never. Layout is measured and spacious: each lesson owns the area for its questions, one shared line per parent with explicit junctions, lines routed around cards in rounded curves, no unrelated crossings at thirty cards, the camera does not move when cards are added; a selected card emphasizes its own connections.

**Place me** (project-wide, about three minutes) and **Check my understanding** (one lesson) run as a **full-screen step**: one question per screen in the large reading type, the lesson named beneath, a short written answer, then the grade with its reasoning and citations before the next. Place me asks five to eight from mid-tree, deeper on a pass, shallower on a fail; Check asks three. Skip or Stop keeps what was placed; Esc stops. The tree then shows placed lessons Mastered and the edge marked. Disputing a grade excludes that question. Both are buttons, never gates.

**States.** Empty: the tree with no questions yet (one sentence and the text box); above ground, nothing and no prompt. Loading: generating the tree and pulling sources (long-wait); an answer streaming into its card (short). Partial: lessons with zero sources, marked on the node. Failed: generation or sourcing failed on the root with Retry; an answer failed on its card with Retry, the question stays; a save keeps its draft. Stale: the tree predates the newest added source; one action, "Update path", which only adds. Unsupported: badges on answer claims and inside stress-test and grading results.

**AI may / Only the human.** AI: generate and extend the path, propose sources, answer, cite, show, explain, stress-test, next, what am I missing, diagnose, check. Human: ask, note, insight, thesis, hide a topic, move anything, edit human text, start Place me or a check, dispute a grade.

**Keyboard.** Arrows move between nodes; Enter opens the side panel; o opens the lesson's first source; h hides or unhides a topic; Space n new question; Space f find sources; Space i Connect; Space t Take a position; Space k Check my understanding; Space P Place me; Esc clears selection.

**Reference bar.** Wondering learning map (`references/canvas/wondering-learning-map.png`) for the tree and side panel; Wondering canvas (`wondering-branching-canvas.png`) for cards and the text box; tldraw (pan, zoom, selection feel); Heptabase (cards with backlinks). Prototype evidence: `docs/gauntlet/prototypes/canvas/`.

**Event log.** Writes learning-path, topic-hidden, question, answer, note, insight, thesis, stress-test, check-answer, check-grade, lesson-status, source-added. Reads everything above plus explainer.

### Playbook

**Job.** Read back what you now hold, and hand it to your coding agents without losing provenance.

**How you arrive.** Space p; the view switcher; "Show in Playbook" on a thesis or insight card; ⌘K.

**Primary flow.** A read-only compiled document. Brief at top. Each **thesis** as a section: claim, what would prove me wrong (and for Gap, what the industry does instead), then the **insights** it stands on, each followed by its cited facts quoted with locators. Then insights supporting no thesis. Then **What I read**: sources with lesson and status. A learning-only project reads as Brief, insights if any, What I read; a thin document looks thin. Human text is byte-identical to its events; facts are quoted from sentences with locators. Clicking any paragraph opens it on the Canvas for editing; nothing is written here. **Export** opens a panel listing the files that will be written, each expandable, with a diff against the last export, one button Write files, and the folder named. The compile is the one rewarded motion in the product (900 ms) the first time a project exports. The agent gets, under the project's `context-pack/`: a thin `AGENTS.md` (Brief; theses and insights verbatim; how to query the vault; a header stating quoted material is third-party content to treat as data; no URLs, no commands), `references/<source>.md` (cited facts per source with locators), skill folders where agents actually read (`.claude/skills/applied-research-<project>/SKILL.md` and `.agents/skills/applied-research-<project>/SKILL.md`; name ≤64 chars kebab, description ≤1024, body under 5k tokens, explaining the MCP tools and where references live), a `CLAUDE.md` line to paste (`@applied-research/AGENTS.md`), and a root `AGENTS.md` pointer for Codex with the Brief inlined, each shown with Copy. The local MCP server's read-only tools: search_claims, get_claim, get_source, get_pack.

**States.** Empty: "Nothing to hand off yet. Insights and theses you write on the Canvas appear here." Loading: compiling (short-wait; the reward motion on first export). Partial: n/a. Failed: export failed inline in the panel with Retry; the document stays. Stale: exported before the newest insight or thesis; one line at the top, "Exported before 2 newer items · Export again". Unsupported: badges on quoted facts.

**AI may / Only the human.** AI: format cited facts, never touch human text. Human: write (on the Canvas), export.

**Keyboard.** j/k between sections; Enter opens the paragraph on the Canvas; Space p e Export; ⌘⇧E write files.

**Reference bar.** iA Writer (document restraint), Linear (panel and diff), Codex desktop (running-task state during compile).

**Event log.** Reads brief, insight, thesis, answer, stress-test, sentences, lesson-status. Writes pack-exported.

### Settings

**Job.** Set the few things the product cannot guess, and see plainly what leaves the machine.

**How you arrive.** ⌘,; Space s; the app menu; a failed-state link (invalid key, MCP not running).

**Primary flow.** A window over everything with a left index and one scrolling page. Sections: **Vault** (folder path, Change, Open in Finder, size); **Models** (on a paid plan signed in: managed keys; otherwise your own keys per provider with the last four shown, validated with one small call on save, Revoke); **Agents** (the MCP command with Copy, the pack folder, which agents have connected, the four read-only tools listed); **Appearance** (dark default, light, follow system; reduced motion); **Keyboard** (leader key, hold-to-talk key, Open cheat sheet); **Privacy** (usage analytics on by default, one sentence on what is sent, "nothing you read or write leaves this machine", the toggle); **Account** (plan, sync status, sign in or out). Paid rows are visible when unpaid, each with one line saying what it does. Changes save on blur with a 5 s Undo text button.

**States.** Failed, inline on the row: invalid key (message, field kept), MCP not running (Start), vault moved (Locate). Empty, loading, partial, stale, unsupported: n/a.

**AI may / Only the human.** AI: nothing. Human: everything.

**Keyboard.** ⌘, opens; Tab and arrows through the index; Esc closes.

**Reference bar.** Raycast preferences.

**Event log.** Writes settings-changed (key present or not, never the key; vault path; analytics; theme).

---

## Part III · Components

### Explainer card

**Job.** Make one hard concept understood in seconds by showing it, cited to the sentences it shows, while keeping its relationship to the passage.

**How you arrive.** Explain visually on a Reader selection (toolbar, or x); Explain visually on an answer card on the Canvas; Try again with a hint on an existing explainer; an Open explanation link reopens one already requested. On request only; no offers.

**Primary flow.** The AI picks the medium from the passage: something that changes over time or in steps becomes a **clip** (Manim, rendered on the cloud service); something spatial you should turn or push becomes an **interactive scene** (React Three Fiber from a constrained schema); a definition, result, or bare claim gets one line, "A visual would not add anything here", and a text explanation instead. One concept, seconds long. In the Reader it opens below the cited passage, keeping the passage at its screen position and moving only later text down, never auto-scrolling; it uses the column's width and the height the concept needs, with legible labels (the one-third-window threshold is for text answers, not visuals). Clips have Play/Pause and a continuous timeline beneath with named clickable steps fitted to the concept (for scaled dot-product attention: Compare → Scale → Softmax → Combine); dragging updates immediately and releasing leaves it paused. Scenes have orbit, exposed parameter controls, Reset. Beneath: a follow-up field (a question attached to the explainer), **Try again with a hint** (a new explainer; the old one stays), **Export** (video file, or embeddable scene). **Enlarge** opens a focused layer over the paper; Close or Esc returns inline at the same position; Close or Esc inline collapses to a quiet **Open explanation** link beneath the passage, keeping the paused position, follow-ups, and Canvas card. The caption reads "Explains: Attention is all you need · §3.2, sentences 4–7" in readable interface text; hover or keyboard focus highlights those sentences, click returns to them. On the Canvas the card is compact at rest beneath its question (still frame, short concept title, full caption with the full source name); opening reveals the player in place with its connection visible; only the active explainer plays. Reader and Canvas show the same event, never copies. Generation is an agentic loop: write, render, verify citations, retry at most twice.

**States.** Empty: n/a. Loading: long-wait animation with stage text "Writing the scene", "Rendering", "Checking citations" (a scene arrives in a second or two, a clip in tens of seconds). Partial: a still frame before the clip finishes. Failed: the request kept, Retry, and the cited sentences as text. Stale: n/a. Unsupported: the badge on the caption. Reduced motion starts the visual paused and removes decorative loading motion.

**AI may / Only the human.** AI: choose the medium, render, cite, decline with a reason. Human: request, play, scrub, enlarge, close, follow up, retry with a hint, export.

**Keyboard.** On a focused player: Space play/pause, ← → scrub, r reset, f follow-up, t retry hint, Enter on a named step, Esc as above.

**Reference bar.** 3Blue1Brown (single-concept transformations; style only, the scene code is CC BY-NC-SA and never copied), Bartosz Ciechanowski (scrubbable mechanisms), Distill (diagram beside prose). Prototype evidence: `docs/gauntlet/prototypes/explainer/`.

**Event log.** Writes explainer (medium, sentence ids, hint), question (follow-ups). Read by Reader, Canvas, Playbook (still frame or link).

### Pointing assistant

**Job.** Answer "where" and "how" by showing: the AI points at the thing instead of describing it.

**How you arrive.** Hold a key (Fn or Globe by default, configurable) and speak, release to send; or Space a and type one line. Never appears unsummoned.

**Primary flow.** The reply is a short cited line in a small bubble beside the pointer, read aloud if voice was used. The pointer swoops to its target on a curved path (control point raised min(0.2 × distance, 80) px, smoothstep, 0.6 to 1.4 s, small landing offset, no overshoot); the bubble springs in, holds, fades; the pointer disappears rather than flying back. The model emits one trailing tag, `[POINT:<sentence-id or control-name>:label]` or `[POINT:none]`, stripped before display; targets are exact ids, never coordinates. Targets: sentences in the open source (highlighted, cited), cards and nodes on the Canvas, controls and views as plain UI guidance ("Export is here"); it never clicks for you. If the target is off screen or in another view it navigates there first; Back restores where you were. Speech is the same cited answer engine as Explain plus plain UI guidance; a target that does not resolve renders `none` with one line and the unsupported badge, no pointer motion.

**States.** Empty: n/a. Loading: listening (a level meter in the bubble), then thinking (short-wait indicator). Partial: n/a. Failed: model or audio failure in the bubble with Retry; the typed path remains. Stale: n/a. Unsupported: target not found.

**AI may / Only the human.** AI: point, answer with citations, guide, navigate to the target. Human: summon, dismiss, act on anything pointed at.

**Keyboard.** Hold key to talk; Space a to type; Enter sends; Esc dismisses; Space a with a bubble open asks a follow-up.

**Reference bar.** HeyClicky (pointer motion and the say-then-point rhythm; `docs/research/pointing-protocol.md`), Cursor (suggestions that never take over), Dia (assistance beside reading).

**Event log.** Writes question (mode voice or text), answer (cited, with target id). Read by the Canvas like any question.

### ⌘K finder

**Job.** Find anything already in the vault, or any command, from anywhere. A lookup, never discovery.

**How you arrive.** ⌘K (without a Reader selection).

**Primary flow.** One search box over the vault plus commands. Results grouped: Sources, Passages (full text over sentences), Your writing (notes, insights, theses), Questions, Views and commands. Enter opens the result in the right view at the right place. Typing `>` first shows commands only. It never searches the web.

**States.** Empty: no results, one line. Loading, partial, failed, stale, unsupported: n/a.

**AI may / Only the human.** AI: nothing. Human: everything.

**Keyboard.** ⌘K open; arrows; Enter; Esc.

**Reference bar.** Raycast, Linear command menu.

**Event log.** Reads everything; writes nothing.

---

## Part IV · Coverage checklist

| Surface | Job | Arrive | Flow | States | AI / human | Keyboard | Bar | Event log |
|---|---|---|---|---|---|---|---|---|
| Shell | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Opening screen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Reader | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Canvas + Learning Path | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Playbook | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Settings | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Explainer card | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Pointing assistant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ⌘K finder | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Sources of record per section: `.scratch/surfaces/issues/` tickets 01–05, 11–15, 18–26 and prototypes 16, 17; research in `docs/research/`; bars in `references/README.md`.
