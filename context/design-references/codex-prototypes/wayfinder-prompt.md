Chart a map for the product surfaces of Applied Research.

## Destination

`docs/gauntlet/SURFACES.md`: a surface specification that a gauntlet loop can build from and a boutique product-design critic can grade against. For every surface it states: the user's job on it, how you arrive, the primary flow to the moment of understanding, every state (empty, loading, partial, failed, stale, unsupported), what the AI may do there and what only the human does, the keyboard grammar, which reference bar it is compared against, and how it connects to the other surfaces through the event log. The map is done when nothing about what the product's surfaces are remains undecided. It does not decide implementation.

## The product (fixed; do not reopen)

Applied Research is a learning tool for product builders who need to understand a domain in order to build in it. It fixes five pains: context switching across search, PDF, chat, and notes; sourcing; presenting knowledge digestibly; finding the gaps in what you know; synthesizing what you learn into insights and product ideas. Doctrine, enforced in the data model: the AI writes only cited facts and explanations anchored to sentences in ingested sources; notes are the human's words; insights and theses are human-only and a record at those levels with an AI author cannot exist. "Reaction engine" is retired as the frame.

Two entries. Start from a source: a paper (arXiv, DOI, PDF), an EPUB or HTML document, a course URL (MIT OpenCourseWare and peers, with lecture transcripts anchored by timestamp), or a textbook the user owns. Start from a question: a short narrowing dialogue turns "I want to learn robotics" into a Brief ("I'm building X and need to understand Y"), then the app sources a curriculum spine from open courses and textbooks and fills depth with survey and seminal papers via OpenAlex and Semantic Scholar. Everything is ingested through one pipeline into reflowed, sentence-anchored documents; nothing is shown without a span behind it. Web search finds sources and is never cited.

Known surfaces, some clear and some not: a Reader (reflowed typography, selection offers Explain, Note, Counter, Idea; inline cards with verified citations; full vim-style keyboard navigation with Readwise Reader as the bar); a branching Canvas in the spirit of the attached Wondering screenshot (question and answer cards that branch, notes as leaves, organic connectors, one "What do you want to understand?" bar); a Workbench ladder (Facts, Notes, Insights, Theses); a Playbook and a Context pack exported for coding agents plus a local MCP server; a Map of the domain by prerequisite depth; Explainers (short animated explanations rendered by Manim on a cloud service, and interactive 3D mechanisms rendered live by React Three Fiber from a constrained scene schema, both citing the sentences they explain, both seconds long and single-concept, with 3Blue1Brown and Bartosz Ciechanowski as bars); a pointing assistant in the spirit of HeyClicky (the AI shows rather than describes); Settings; an illustrated opening screen.

## Constraints the surfaces inherit (fixed; do not reopen)

- Electron, cross-platform, React 19, surface-agnostic shell. No surface touches another's state; everything flows through an append-only event log and one store. A canvas node, a reader passage, and an explainer can all reference the same sentence id.
- Local-first. Every tier has the full vault on disk. Paid adds a cloud replica, multi-device sync, managed model keys, and cloud compute. Single user for now; multiplayer later.
- Provider-agnostic LLM service; citations verified in-house on numbered sentences; unverifiable claims render as "unsupported," never as prose.
- Reading gets the full vim grammar. Everything else gets a leader key. No modes outside the reader. Mouse users never feel the keyboard layer.
- Dark default with a designed light theme. Material guide: the original system's typography and colors (Newsreader, Fraunces, warm equals human, cold equals interface, provenance by material), Field Atlas's illustrated opening screen and buttons, Phosphor icons. Layout, components, and flows are open.
- Usage analytics on by default, content never leaves the machine.
- No deadline exists. The target is the pinnacle of what is possible in product today.

## Fog to chart (the open decisions)

- What Explainers are for and when they appear: on demand from a selection, proposed by the AI at moments of confusion, or a surface of their own. What makes one worth rendering.
- Canvas semantics: what a card is, whether a branch is a question, a source, or a thought; where the Canvas lives relative to the Reader and the Workbench; whether the Map and the Canvas are one surface or two; whether human notes and theses live on the canvas or only reference it.
- The pointing assistant: what it points at inside a reading tool, how it is summoned, what it may say, and whether it is voice, text, or both.
- The Workbench ladder's shape now that a canvas exists: is it a list, a view over the canvas, or both.
- Start from a question: the narrowing dialogue, calibration (Know it / Heard of it / No idea), and how the resulting curriculum is presented and paced.
- Multi-source reading: how a course, a textbook chapter, and a paper coexist in one project, and how the reader moves between them.
- First run and the opening screen: what the illustrated arrival does beyond looking good.
- How each of the five pains maps to a specific surface and a measurable moment.
- Playbook and Context pack: what the human sees before export, and what a coding agent gets.

## Out of scope

Stack, backend, sync protocol, auth, billing, ingestion parsers, distribution, observability, testing strategy, and the design token values. These are decided and recorded in the grill session of 2026-09-05; the gauntlet prompt will carry them.

## Notes

- Skills: `/grilling` and `/domain-modeling` for every decision ticket, `/prototype` when "how should it feel" is the question, `impeccable shape` for a surface brief before any prototype, `/research` for AFK facts.
- One question at a time. Every decision is Aaryan's. Recommend an answer with each question.
- Inputs to consult: `references/README.md` (the 28 approved reference bars with captured assets), `docs/research/paper-parsing-2026.md`, `docs/mvp-prd.md` (superseded on stack and scope, still useful for screens and acceptance criteria), `docs/designs/prompt-2-screens.md`, the studio critique in `.impeccable/critique/`, and the Wondering screenshot at `references/canvas/wondering-branching-canvas.png`.
- Every ticket's resolution must be written so that it can be pasted into `SURFACES.md` without translation.
