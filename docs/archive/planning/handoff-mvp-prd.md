# Handoff: write the MVP PRD and build requirements for Applied Research

Written 2026-09-04 for a fresh session; updated the same day after the founder's answers (Electron, solo build). Demo Day is **Wednesday 2026-09-09** (five build days remain: Thu 4, Fri 5, Sat 6, Sun 7, Mon 8; Tue 8 is the Cursor workshop at Gauntlet HQ). **One developer.** Open source. The MVP PRD now exists at `docs/mvp-prd.md`; a new session's job is to build from it, grounded in the decisions below, without re-opening them.

## Read in this order

1. `docs/designs/frontier-reaction-engine.md` — the approved product design (office-hours output, 2026-08-31, with the 2026-09-02 "Design pass — settled" section at the bottom, which supersedes older SETTLED lines where they conflict). This is the product spec of record.
2. `presearch.md` (repo root) — the researched, critic-reviewed, founder-adjusted stack. "The stack in one table" and "Feature-by-feature decisions" F1–F13 are the parts the PRD builds on. The critique record explains why alternatives lost; do not re-litigate them without new evidence.
3. `docs/designs/prompt-2-screens.md` — the ten screens and seven states, with the design-system rules in brief. The PRD's screen inventory should match it.
4. `argument-graph-prd.pdf` — the earlier standalone argument-graph PRD. Its node/edge types, support-strength dimensions, pipeline, and phasing (P0 extraction spike → P1 read-only viewer → P2 interrogation) are the source for the Arguments panel. The design doc reduced this from a standalone canvas to a compact per-paper panel; keep the schema ideas, not the product framing.
5. `Frontier_Proposal.pdf` and `proposal.html` — the original capstone proposal (product was then called Frontier). Useful for the validation plan (agent A/B benchmark, timed user study, citation-faithfulness spot checks) and the demo loop.
6. `Capstone_Requirements.pdf` — the program's requirements: deployed product, real users tried it, feedback in the presentation, "what couldn't a competitor throw together in a weekend", X traction floors per person (150+ engagements, 25+ followers, 5+ build-in-public posts, 1+ outside repost), 10-minute presentation + 5-minute Q&A.
7. `brainlift-example/` — an Obsidian vault showing the brainlift format (DOK tiers, templates, quality checklist). The Playbook export must be readable by someone who knows this format.
8. Design system prompts `docs/designs/prompt-1-design-system.md`, `prompt-1b/1c/1d-revision.md` — only if the PRD needs token names, type scale, or motion durations. The live Claude Design canvases are "Applied Research - Design System" (project `c96de5f8-9c0a-4dc4-91aa-167ab1fada07`) and "Applied Research - Screens". Older mockup rounds live at `~/.gstack/projects/capstone/designs/mockup-20260831/` (variants D and F were the reference before the design pass).

## The product in three paragraphs

**Applied Research** (renamed from Frontier; "brainlift" does not appear in the product) is a research tool for builders learning a domain in order to build in it. It finds papers (papers are the only source in v1), maps the domain by prerequisite depth, and its core surface is reading: a paper reflowed into the product's own typography where every selection offers **Explain · Note · Counter · Idea**. Answers land as inline cards with citations to exact spans; sources open as rabbit-hole layers. Reactions collect in a **Workbench** whose tabs are the ladder (**Reactions · Insights · Theses · Playbook**), where the human alone writes insights and theses and the AI's only verbs are *show* (a suggestions tray, Critique only) and *stress-test*. The **Playbook** and its **Context pack** are what the builder and their coding agents build from; an MCP server exposes the same knowledge base to agents.

**The contrarian bet:** competitors race to do the thinking (better reports, better summaries). The value of research is in the *reaction*, not the construction. AI constructs DOK1 scaffolding; the interface provokes and captures the human's reactions; those compile into the Playbook and the agent context. **Doctrine, enforced in the schema, not in prompts:** records at DOK 3 or 4 (insights, theses) with `author: AI` are unrepresentable.

**Posture:** an instrument in a reading room. Renders state, never speaks first. Provenance by material, not badges (AI on a surface with a hairline rule; human writing outdented into the margin; the paper on the ground). Two hues, two meanings: warm = what the human made, cold = what the interface offers.

## Decisions already made (do not re-open)

**Product and design** (from the design doc's settled section):
- Goal object is the **Brief** ("I'm building X and need to understand Y"), project-scoped. Two entries, one home: *start from a question* (≤2-minute calibration) or *start from a paper*. Both land on the **Map**.
- Map: concepts as horizontal layers by prerequisite depth, foundations at the bottom; fixed layout, no dragging; known territory is a lamp (dark) or wash (light) that fades at the user's edge; papers are marks on layers.
- Reader: reflowed paper, original PDF one click away; inline cards for answers, rabbit-hole layers for sources; a card never exceeds the viewport; depth strip / path bar; Esc returns to the exact line. Selection toolbar within ~150 ms: Explain · Note · Counter · Idea. No Highlight action.
- Counter resolves to *I was missing something* / *The paper has a problem* / *Still open*; the second spawns a Critique thesis.
- Thesis kinds: **Critique** (a paper's claim is wrong or no longer holds) and **Gap** (research established it, industry hasn't absorbed it). Spine: claim · evidence (≥1 ref, required) · what would prove me wrong. The Gap's "what industry does instead" is human-written.
- Shell: left = where (projects, sources by depth with density marks; collapsible; not a file tree); right = what (Arguments · Questions · Annotations); Map and Reader are peers in the center; Workbench is the third peer state.
- Discovery is never a search page: entry points are a dark layer's "Find papers for this" and links inside answers. ⌘K is a finder, not discovery.
- Export is the Workbench's Playbook state, not a rail button. Ladder labels are Facts · Notes · Insights · Theses; DOK numbers never appear in the UI.
- Type: Newsreader (paper + human writing), Familjen Grotesk (UI + AI), Martian Mono uppercase (locators/chips), Fraunces (project title, Brief only). Dark default basalt; light warm white. Phosphor icons (Light 16 / Regular 20+), chrome only. Motion 150 / 220 / 900 ms.

**Stack** (from `presearch.md`; each row has its evidence there):
- Ingest: arXiv LaTeXML HTML first → OpenAlex-hosted GROBID TEI for open-access DOIs → Mistral OCR 4.1 (`mistral-ocr-4-1`, pinned) for uploads and math-heavy papers. No Python sidecar. pdf.js only for the fallback view.
- Canonical text minted over the reflow; **sentences are the citation unit**; W3C selectors + Hypothesis's match-quote for re-anchoring; `Intl.Segmenter`.
- LLM: **Gemini 3.8 Flash** for all background jobs (argument distillation ×3 samples run as parallel synchronous requests, concept map, stress-test over verified argument graphs, pack compile). **Inline reader on Claude Sonnet 5 with Citations pending a first-day spike**; Gemini takes it if low-thinking TTFT < 2.5 s and citation precision within five points. Raw provider SDKs behind one `llm.ts` in the main process with per-job model settings. No agent framework, no AI SDK. Users bring their own keys (Gemini free tier is $0).
- Every AI span is string-matched server-side before rendering; unresolved → "unsupported" badge. Extraction confidence = agreement across the three samples.
- Data: **SQLite via `node:sqlite`** (FTS5 built in) + Drizzle, one file per vault, append-only `events` table with ULID ids, views as in-memory folds, `events.jsonl` appended and per-paper/note markdown regenerated (Obsidian-compatible). Pipeline durability = a `paper_stages` table + in-process worker resuming at boot.
- Discovery: **OpenAlex** first (`search.semantic`, `referenced_works`, `cites:`, OA links, TEI); every Semantic Scholar feature behind a flag with an OpenAlex fallback (S2 key lead time unknown; apply on day 1).
- Web framework: **Electron 44 + React 19 + Vite 7 (electron-vite 5)**; no router; the paper is static DOM with CSS `::highlight()`. Hand-written CSS (OKLCH tokens, `light-dark()`, layers, CSS Modules). Temml → MathML at parse time. (Superseded the React Router / SvelteKit choice on 2026-09-04.)
- Auth: GitHub OAuth **device flow** from the Electron main process, token in `safeStorage`; no Better Auth, no backend.
- MCP: `@modelcontextprotocol/server` 2.0.0 pinned, stateless Streamable HTTP bound to `127.0.0.1:<port>`, `legacy: 'stateless'`, `Origin` validation, per-install bearer token, four read-only tools; Settings shows the `claude mcp add` command.
- Context pack: `AGENTS.md` ≤200 lines + `SKILL.md` + `references/<paper>.md`; quoted-and-attributed paper text only; NFKC-printable output, no URLs.
- Observability: opt-in telemetry only; founder dev builds export OTel spans to Langfuse Cloud via env. Evals: Evalite (pinned) + autoevals + two custom scorers, `--threshold` in CI; 50-item human golden set.
- Distribution: electron-builder installers (dmg, exe, AppImage) on GitHub Releases; macOS notarization if the Apple Developer enrollment lands, else unsigned with instructions. No server, no compose. Apache-2.0.
- Security musts: answerer has no tools; paper text spotlighted as third-party data; Unicode sanitizer (NFKC, Tags/zero-width/bidi stripped); hidden-text detection at parse (banner + excluded from prompt); no remote images/auto-links in answers; BYOK keys under envelope encryption; per-user daily budget; spend caps on both providers.

## Data contract the PRD must carry verbatim

Reaction event (one row, append-only, per project):

```
id            ULID
project_id
seq           per-project monotonic
type          question | answer | summary | note | counter | resolution(gap|problem|open) | idea | insight | thesis(critique|gap) | known
dok           1..4   (question/answer/summary → 1; note → 2; idea/insight → 3; thesis → 4; counter/resolution attach to DOK1 objects)
author        human | AI        -- dok ≥ 3 with author = AI is unrepresentable (CHECK constraint + type-level)
paper_id, sentence_id, span_start, span_end, quote, prefix, suffix   -- anchor (nullable for project-level events)
refs          JSON array of {event_id | (paper_id, sentence_id, start, end)} with its own author tag; may point into other papers
body          JSON
model, prompt_version, request_id      -- for AI-authored events
created_at
```

Views are pure folds over this log: Reactions tab, Insights, Theses, Playbook, the Arguments panel, the Map's lit/washed territory, `agent-context`/`AGENTS.md`. Export = `vault/<project>/events.jsonl` + markdown per paper and per note with YAML frontmatter and `[[wikilinks]]`; import = replay.

Argument graph per paper (from the argument-graph PRD, reduced): nodes Claim / Evidence / Assumption / Citation / Method, each with `{sentence_id, verbatim_quote}`; edges supports / undermines / depends_on / elaborates / cites; no edge between nodes that were not extracted; three-sample agreement as confidence; low-confidence regions render as unresolved.

## Build order and gates (from the design doc; the PRD should sharpen, not replace)

- **Milestone A** (must land by ~day 4 of the original plan; there are five days now): one paper, read end-to-end in-tool, Explain/Note/Counter/Idea working with resolving citations, exporting the Playbook (`brainlift`-style markdown) and the Context pack. This is also the premise-2 experiment (does mid-read confusion dominate lost time?).
- After A, in this order: argument distillation (compact per-paper Arguments panel) → in-tool discovery ("Find papers for this") → Map from real citation data → MCP server → stress-test. If the clock forces cuts: discovery is cut before distillation; distillation ships as the compact panel only.
- **Validation is never cut:** days 5–8 hold observed cohort sessions (named people, real assignments, no help given) and one real coding-agent A/B with and without the pack (n=1 is acceptable). Feedback from these is the Demo Day evidence.
- Non-goals for v1: industry/web sources, collaborative vaults (single writer), citation-integrity verification of cited works (phase 2), light-mode polish beyond tokens, passkeys, remote MCP OAuth, a Python parser sidecar.

## Answers received 2026-09-04 (resolved inputs)

- **Platform: Electron desktop app, cross-platform.** Not a hosted web app. See the "Pivot 2026-09-04" section at the end of `presearch.md` for every stack consequence (Electron 44 / Node 24.20 / Chromium 152; React 19 + Vite 7 via electron-vite 5; `node:sqlite` in the main process; vault = a user folder; GitHub OAuth device flow; keys in `safeStorage`; local MCP on 127.0.0.1; installers on GitHub Releases; synchronous Gemini calls instead of Batch; telemetry opt-in; Railway and compose dropped).
- **Cohort observer: not required by the app.** The founder does not want a named observer baked into the plan. GitHub OAuth stays (device flow; identity for `author`, and the stretch "Push vault to GitHub").
- **Owner: Aaryan owns everything.** Solo build. Scope is tiered accordingly in `docs/mvp-prd.md`.

## Open inputs still carried as day-one tasks

1. **The two-sided citation spike** (Sonnet 5 custom-content citations vs Gemini 3.8 Flash sentence-id citations: TTFT and citation precision on 20 questions) decides the reader's model.
2. **Electron FTS5 check**: confirm the bundled `node:sqlite` has FTS5; else `better-sqlite3` + `electron-rebuild`.
3. **Apple Developer Program enrollment** for notarization (start today; approval can take days); fallback is unsigned builds with quarantine-removal instructions.
4. **Semantic Scholar API key** lead time; everything ships OpenAlex-only until it arrives.
5. **Mistral OCR 4.1 latency and price** on a 30-page paper (unpublished).
6. **GitHub OAuth app** created with device flow enabled.

## What the MVP PRD / build requirements should contain

- One-paragraph problem, thesis, and the doctrine, in the product's own words (no "brainlift", no DOK numbers in UI copy).
- Users and the beachhead (Gauntlet cohort on a forced brainlift cadence); the named observation user.
- Scope table: in / cut / post-capstone, mapped to the build order above and to the argument-graph PRD's P0–P2.
- Screen-by-screen requirements matching `prompt-2-screens.md` (New project, Calibration, Map, Reader, Reader 2-deep, Workbench × 4, ⌘K finder, plus states), each with acceptance criteria that a Playwright smoke test could check, and the one bold gesture / one primary per screen noted.
- Pipeline requirements: `paper_stages` (fetch → parse → canonicalize → segment → distill → store) with idempotency keys, resume-on-boot, and the per-source rate limits (arXiv 1/3 s, S2 1 rps, OpenAlex cost headers).
- API surface: events (append, list since seq), papers, ask (SSE), discover, export, `/mcp`, `/healthz`; Zod schemas shared client/server.
- The data contract above, plus the Playbook/`AGENTS.md`/`SKILL.md` export format with an example.
- LLM job specs: for each of the five `llm.ts` functions, the model, prompt version, input shape (sentence-numbered blocks), output schema, verification step, and cost ceiling from `presearch.md` §6.
- Verification and eval requirements: string-match gate, "unsupported" badge behavior, three-sample confidence, the 50-item golden set, ALCE citation recall/precision and extraction F1 in CI with a threshold, and the day-7 coding-agent A/B.
- Security musts (list above) as testable requirements, including the five adversarial PDF fixtures.
- Deployment: Railway service + volume + backups, GitHub Actions gates, rollback = redeploy prior deployment, the self-host compose file.
- Success criteria copied from the design doc: founder's weekly logistics 10 h → under 4; ≥3 cohort members complete a real assignment in-tool without help with observed context-switch reduction; exported context used by at least one real project's coding agent; every DOK3/4 export item human-authored (verified in export); capstone requirements met.
- A day-by-day plan for 2026-09-04 → 09-09 with the demo loop rehearsed on day 8: pick a topic → Map builds with citations → read a paper with inline lookup → Playbook → export the pack → run the same agent task with and without it → the numbers from the cohort sessions.

## Status

The MVP PRD and build requirements were written on 2026-09-04: **`docs/mvp-prd.md`**. A new session should read this handoff, then `docs/mvp-prd.md`, then `presearch.md` (including its pivot section), then the design doc, and start building from the PRD's Day 1. The user's curated pipeline (`/wayfinder` → `/to-spec` → `/to-tickets` → `/implement`) is available if they choose to invoke it; `docs/mvp-prd.md` is the input to `/to-spec`.
