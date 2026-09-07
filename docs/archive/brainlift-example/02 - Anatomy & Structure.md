*Every section of a BrainLift and what it's supposed to do. Adapted from our internal "Anatomy of a BrainLift" reference.*

## The full section order

A topic/pedagogy BrainLift has these sections, in this order. Sections 4–9 are the substance; 1–3 and 10 are framing and provenance.

| # | Section | DOK | Purpose |
|---|---------|-----|---------|
| 1 | **Title** | — | Name the object of study, not the activity |
| 2 | **Purpose** (In scope / Out of scope) | — | Who it's for, what they can do after, what it commits to |
| 3 | **Owner / Author** | — | Named accountability — no anonymous BrainLifts |
| 4 | **DOK4 — Spiky Points of View** | 4 | The contrarian, falsifiable claims you stake |
| 5 | **DOK3 — Insights** | 3 | Decision rules |
| 6 | **DOK3 — Blueprints** | 3 | Executable workflows |
| 7 | **Experts** | — | The people whose work underpins this |
| 8 | **DOK2 — Knowledge Tree** | 2 | The concepts, in your own words |
| 9 | **DOK1 — Key facts & source summaries** | 1 | The evidence base |
| 10 | **Reference list** | — | Clean citations |

Note the order: the **positions come first** (DOK4 at the top), and the evidence sits at the bottom. A reader who trusts you reads the SPOVs; a skeptic scrolls down and checks the trail.

## Section by section

### Title
Short and specific. Name the *object*, not the activity. "MCQs," not "How to write MCQs." "Sync Checks," not "Using Sync Checks Well."

### Purpose
One or two paragraphs answering: Who is this for? What will they be able to do after reading it? What claim about the world does it commit to? Then two explicit lists:

- **In scope** — the concrete decisions/deliverables a reader can produce after reading. Be specific.
- **Out of scope** — what it deliberately doesn't cover, with pointers to where that material lives. Out of scope isn't a disclaimer; it's the boundary that keeps the BrainLift sharp.

### Owner / Author
A named person. BrainLifts take positions, so a position needs an author. Co-authors are fine; anonymous ones are not.

### DOK4 — Spiky Points of View (the most important section)
Each SPOV is a **contrarian, defensible, falsifiable** claim you're willing to stake. A good one has six parts:

- **Claim** — one sentence, crisp enough to disagree with.
- **Why this is contrarian** — the default view it challenges. If any reasonable practitioner would already agree, it's not an SPOV — it's a fact; demote it.
- **Evidence / reasoning** — why it holds; cite the DOK1 sources.
- **Operational consequences** — what concretely changes if the claim is accepted.
- **Guardrails & failure modes** — where the claim breaks, what edge cases weaken it.
- **Falsifiable test** — what evidence would make you abandon it. If nothing could falsify it, it's a belief, not an SPOV.

Quality tests: Would a thoughtful practitioner disagree on first reading? Is the claim narrow enough to be wrong? Did you name the conditions under which you'd retract? Typical count: **3–6**. Fewer and you're not committing to enough; more and they're probably not spiky.

### DOK3 — Insights
Decision rules that sit between the abstract SPOVs and the raw concepts. Each insight has a short declarative title, explains the *mechanism* (why the rule holds, grounded in DOK1/DOK2), states the design implication (what you do differently), and names where it breaks.

Insights are usually *uncontroversial once stated, but non-obvious before*. Contrast: "Wrong answers are diagnostic, not random" is an **Insight**. "MCQs are learning events first" is an **SPOV**.

### DOK3 — Blueprints
Operational workflows. The test: could a competent newcomer (or an LLM) pick this up and execute it? A blueprint typically contains: **domain context** (what it applies to / assumes), **workflow** (numbered imperative steps), **judgment calls** (decisions the workflow can't automate, with trade-offs), **quality control** (checks before/after), and optional **reviewer checks**. Each step should cite the insight or concept it rests on.

### Experts
A standalone list of the domain authorities whose work underpins the BrainLift. Name, affiliation, area of contribution — two or three lines each. This names the *people* to follow, not the specific papers (those are in DOK1).

### DOK2 — Knowledge Tree
The conceptual backbone. A numbered set of branches covering the concepts a reader needs. A reliable per-branch template:

- **What it is** — plain-language definition.
- **Why it matters** — the claim that makes this concept load-bearing.
- **Where it breaks** — conditions/populations where it weakens.
- **Implication** — what the reader should do differently because of it.

Branches are numbered (KT1, KT2, …) so Insights, Blueprints, and SPOVs can cite them. Typical count: **6–12**.

### DOK1 — Key facts & source summaries
The evidentiary bedrock. For each source: **full citation**, **key facts** (specific findings/effect sizes as bullets, not abstracts), **limitations** (every source has them — naming them is how you stay honest), and **relevance** (which SPOVs/Insights/KT branches it grounds). Mark the two or three most load-bearing "anchor" sources. An SPOV without a DOK1 trail is a hunch.

### Reference list
Standard citation format. Every source referenced anywhere appears here, kept separate from DOK1 so readers who only want citations don't scroll through summaries.

## Cross-referencing — make it traversable

A well-made BrainLift is *traceable*. From any claim, a reader can follow the evidence trail:

- Each SPOV cites the Insights and KT branches supporting it.
- Each Insight cites the KT branches and DOK1 sources it rests on.
- Each Blueprint step cites the Insight or KT branch that justifies it.
- Each KT branch cites the DOK1 sources that define it.

Short inline tags do the work: `(KT2, KT4)`, `[Readings 7, 8]`, `(Insight 6)`. The goal: a skeptical reader can follow any claim to its grounding in under a minute. You'll see this all over the example in `04`.

## The minimal skeleton

```markdown
# [Topic]

## Purpose
[What this BrainLift does and who it's for.]

**In scope**
- …
**Out of scope**
- …

## Owner
[Name]

## DOK4 — Spiky Points of View
### SPOV 1: [Claim]
- Why this is contrarian
- Evidence / reasoning
- Operational consequences
- Guardrails and failure modes
- Falsifiable test

## DOK3 — Insights
### Insight 1: [Rule]
[Mechanism. Design implication. Where it breaks.]

## DOK3 — Blueprints
### Blueprint 1: [Workflow name]
- Domain context
- Workflow (numbered steps)
- Judgment calls
- Quality control
- Reviewer checks

## Experts
- [Name — affiliation — contribution]

## DOK2 — Knowledge Tree
### KT1. [Concept]
- What it is
- Why it matters
- Where it breaks
- Implication

## DOK1 — Key facts and source summaries
### Reading 1: [Citation]
- Key facts
- Limitations
- Relevance

## Reference list
…
```

A ready-to-use copy of this (with the "YOURS — don't AI-generate" markers) is in `07 - Templates`.
