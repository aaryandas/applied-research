---
name: brainlift
description: Build a "brainlift" — an evidence-grounded knowledge base (Purpose / Experts / Knowledge Tree) in an Obsidian vault — by fanning out a multi-agent deep-research harness over a problem space and compiling the findings into interlinked, confidence-tagged wiki pages with named experts and mapped debates. Use this whenever someone wants to deeply understand a space before building or deciding: intaking a PRD/spec and researching around it, mapping a domain's experts and live disagreements, building a knowledge tree or knowledge base, or doing research that accumulates into a persistent artifact rather than a one-off report. Trigger it even when the user says only "brainlift this", "research this space properly", "help me understand this domain", "build me a knowledge base on X", or points at a PRD and asks what they should know before starting.
---

# Brainlift

A brainlift is a persistent, interlinked knowledge base built by many researchers at once and maintained by an LLM. It is **not** a research report. A report is read once and dies; a brainlift is a wiki that compounds — every source added updates the pages it touches, contradictions stay visible instead of being averaged away, and answers to later questions get filed back in.

The output has three parts, and they do different jobs:

- **Purpose** — the mission, boundaries, and success criteria. Prevents scope creep during a long research run.
- **Experts** — named humans whose work validates or challenges the assumptions. Keeps the thinking grounded in reality rather than in the model's priors.
- **Knowledge Tree** — the web of background context, concepts, and debates. Surfaces blind spots and connections.

Quality here comes from three things, in order: **dimension design** (how you slice the problem), **structured extraction** (forcing researchers to return falsifiable claims with evidence, not prose), and **adversarial critique** (a pass whose only job is to find what's missing or wrong). Skip the third and you will ship a confident, wrong knowledge base.

## The arc

```
0. Intake & scope       → read the source doc, define Purpose, confirm with user
1. Design dimensions    → slice the problem into 8–12 parallel research angles
2. Research fan-out     → N researchers + completeness critic + debate mapper
3. Split & merge        → scripts/split_research.py
4. Compile fan-out      → one writer per dimension, writing into the vault
5. Index, log, lint     → make it navigable and record what's still unknown
```

Phases 2 and 4 are separate workflows with an orchestrator step between them. Don't collapse them — the value of the middle step is that *you* read the critic's findings and thread them into the writers' prompts as caveats, so bad claims get flagged at write time instead of being laundered into confident wiki prose.

## Phase 0 — Intake and scope

Find and read the source document (a PRD, spec, issue, or the user's own framing). Check the workspace, `.context/attachments/`, and the parent project directory; PDFs read fine with the Read tool.

Then draft `Purpose.md` answering three groups of questions. Ask the user only what the document genuinely doesn't answer — a PRD usually contains most of it:

- **Core problem** — what specific challenge, why now, what's the current impact?
- **Target outcome** — what does success look like, what's measurable, who benefits?
- **Boundaries** — what's in scope, what's explicitly excluded, which adjacent problems are you deliberately not tackling?

The boundaries section is the one that earns its keep. A ten-agent fan-out will happily research forever; the exclusions are what let you tell a researcher "this is context, not deliverable."

**Confirm the scope and dimension list with the user before launching the research fan-out.** It's a large, slow, expensive run and a misaimed dimension is wasted.

## Phase 1 — Design the research dimensions

This is the craft step. Dimensions are the parallel angles of attack, and they should come from the *problem's* structure, not a template. Aim for 8–12 that barely overlap.

Reliable generators — walk these and keep what applies:

1. **One per candidate option.** If the decision is A vs B, A gets a dimension and B gets a dimension.
2. **One per component of the complex option.** A pipeline of three stages is three dimensions; each stage has its own vendors, benchmarks, and failure modes.
3. **The engineering substrate** — the cross-cutting concern that the whole thing lives or dies on (latency, throughput, accuracy, cost — whichever it is here).
4. **The domain it ships into.** The profession, industry, or user context — including its regulations, standards, incumbent practices, and the specific company involved. Teams consistently under-research this and it's where the disqualifying constraints hide.
5. **The academic frontier.** Whatever the research literature calls this problem. Often the literature has been running the exact same debate for a decade under different vocabulary — enormously valuable.
6. **Real-world market evidence.** Who shipped this, what architecture did they use, what happened — including public failures, retractions, and incidents. The scarcest and most valuable evidence class.
7. **Economics.** Cost models with actual arithmetic, benchmarked against whatever the incumbent solution costs.
8. **Evaluation methodology.** How would you *know* which option won? Frequently reveals that the obvious metric is the wrong one.
9. **A dedicated expert hunter.** One agent whose entire job is finding 15–25 verified real people. Without this, expert coverage is an afterthought of the other dimensions and comes out thin.

Every dimension prompt shares a **context preamble** describing the decision, then adds its specific brief. Tell researchers to prioritize primary sources, note publication dates, prefer recent evidence in fast-moving fields, capture disagreements rather than resolving them, name real people, and run 6–10 distinct searches before concluding. Detail and exact templates: `references/research-workflow.md`.

## Phase 2 — The research fan-out

Read `references/research-workflow.md` for the full workflow script and the output schema. The essentials:

- **Force structured output.** Each researcher returns `summary`, `claims` (each with evidence and a `high|medium|low` confidence), `sources` (title, url, type, date, takeaway), `experts`, `concepts`, `debates`, `open_questions`. Prose summaries collapse into mush when you try to merge ten of them; structured claims stay auditable and let you spot cross-researcher contradictions mechanically.
- **Barrier, then critique.** Research runs in `parallel()`, then two critique agents read a digest of everything: a **completeness critic** (blind spots, under-evidenced load-bearing claims, cross-researcher contradictions, follow-ups — and it spot-checks a few suspicious claims with its own searches) and a **debate mapper** (turns the tensions into 5–9 crisply framed debates with the strongest case for each side). This is one of the few places a barrier is genuinely right: both need to see all findings at once.

Invoking this skill is the user's opt-in to multi-agent orchestration, so the Workflow tool is appropriate here. If Workflow isn't available, parallel `Agent` calls work — you just lose the structured-output enforcement and have to parse returns yourself.

## Phase 3 — Split and merge

```bash
python3 ~/.claude/skills/brainlift/scripts/split_research.py \
  --input <workflow-output-file> --outdir <project>/.context/research
```

This writes one JSON per dimension, plus `critic.json`, `debates.json`, `experts-merged.json` (deduped by normalized name, preserving every researcher's angle on the same person), and `expert-names.txt` (the canonical spellings writers must link against). It prints a per-dimension count table — glance at it to confirm nothing came back empty.

**Then read `critic.json` yourself.** This is the step that determines final quality. For each weak claim, contradiction, and blind spot, decide what the wiki should say instead, and write it as a caveat you'll paste into the relevant writer's prompt.

## Phase 4 — Compile into the vault

Read `references/compile-workflow.md` for the writer brief, page templates, and workflow script.

One writer per dimension (plus one for experts, one for debates), each writing 1–3 Knowledge Tree pages and its own source catalog. Three things make this work:

- **Canonical page names, decided up front and handed to every writer.** Writers work in parallel and can't see each other's output, so wikilinks only resolve if everyone was given the same spelling. Links to pages another writer is currently creating are correct and expected.
- **Critic caveats threaded into each writer's prompt, marked as overriding the raw JSON.** e.g. *"the $0.48/min figure FAILED verification — the actual contract shows $0.57/min; present a range and flag the failure."* Writers follow these reliably, and it's what stops a spot-checked-false claim from becoming a confident wiki sentence.
- **An explicit instruction not to fabricate.** If a writer's data doesn't cover something you asked for, it should say so with a low-confidence pointer rather than invent numbers. Good writers will flag this back to you.

Confidence markers travel with every load-bearing claim: **[high]** = multiple independent primary sources, **[medium]**, **[low]** = single/vendor/stale. Vendor-published performance and pricing numbers cap at [medium] — with one useful exception: a vendor documenting its *own product's limitations* is credible against interest and can be [high].

## Phase 5 — Index, log, lint

You (not a subagent) write the connective tissue, because only you have seen every writer's report:

- **`index.md`** — the content catalog, one line per page, grouped by category. This is what the LLM reads first on future queries, so the one-liners should say what's *in* the page, not restate its title.
- **`log.md`** — append-only, entries prefixed `## [YYYY-MM-DD] <ingest|query|lint|build> | <title>` so `grep "^## \["` gives a timeline.
- **A lint entry** recording known issues for the next pass: near-duplicate pages, unresolvable links, evidence a writer flagged as thin, and the highest-value follow-up research.
- **`Evidence Gaps and Open Questions.md`** — the critic's output as a first-class Knowledge Tree page. Blind spots, failed verifications, and contradictions belong *in* the wiki, not in a chat message that scrolls away. It doubles as the standing to-do list.
- **`_Knowledge Tree Overview.md`** and hub pages for Debates and Experts.

## Working with the Obsidian vault

Vault structure (folders are created implicitly by writing into them):

```
<Vault>/<Brainlift folder>/
  CLAUDE.md    — the wiki schema; assets/vault-schema.md is the template
  index.md     — content catalog
  log.md       — chronological record
  Purpose.md
  Knowledge Tree/   Debates/   Experts/   Sources/   Raw/
```

`Raw/` holds an immutable transcription of the source document. Transcribe the PRD into it — the vault should be self-contained and readable without the original PDF.

Two gotchas that will cost you time:

- **On macOS, `~/Documents` is often blocked for shell commands but writable by the Write tool.** If `ls` on the vault returns "Operation not permitted", don't try to fix permissions — just use Read/Write exclusively for vault paths, and tell subagents to do the same. Give them a staging-directory fallback so a permission failure doesn't lose their work.
- **Names that aren't valid filenames.** Expert entries like `"Ewa Jasinska-Davidson / AIIC leads"` contain a path separator. Have writers substitute a parenthetical form and add the original as a frontmatter alias — and note it in the lint entry, since links using the slashed form won't resolve.

## Scale and cost

A full run is roughly 20–25 agents, ~1M+ tokens, and 30–45 minutes of wall clock. That's appropriate for a decision worth 12–18 months of investment and wasteful for a question someone could answer in an afternoon. If the space is narrow, run 4–5 dimensions and skip the debate mapper — the structure degrades gracefully. Say what it will cost before launching.

## Reference files

- `references/research-workflow.md` — dimension prompt template, the output schema, the research workflow script, critic and debate-mapper prompts
- `references/compile-workflow.md` — writer brief, page templates for each page type, the compile workflow script
- `assets/vault-schema.md` — the `CLAUDE.md` schema template that goes *into* the vault so future sessions can maintain it
- `scripts/split_research.py` — splits workflow output into per-dimension files and merges the expert roster