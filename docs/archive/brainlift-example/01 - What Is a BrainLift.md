*The concept, the problem it solves, and the four layers every BrainLift is built from.*

## The definition

A BrainLift is a structured knowledge artifact that captures expert thinking on a well-bounded topic, designed to be read and used by both humans and LLMs. Its job is to *lift* the reasoning of anyone working on that topic — so a designer, developer, or model can make a sound decision without reading the entire underlying literature.

## Why it exists

Two problems.

**First: expertise that isn't written down isn't defensible.** If you "know" a topic but can't point to the evidence, name the concepts, or state the positions you'd stake, you don't yet have expertise — you have impressions. A BrainLift forces the impressions into claims with trails behind them.

**Second: AI makes average, un-owned content cheap.** Anyone can ask a model to summarize a field. That output is generic and belongs to no one. A BrainLift is the opposite: it's the specific, contrarian, evidence-backed view that *you* hold and are willing to defend. The point is to build your own expertise and a defensible spiky point of view — not to generate text.

## What it is NOT

- A **wiki** describes; a BrainLift **takes positions**.
- A **literature review** surveys; a BrainLift **synthesizes and commits**.
- A **style guide** prescribes; a BrainLift **explains *why***, with evidence and failure modes.

The defining feature: **the author is willing to be wrong in public.** Every spiky POV is a falsifiable claim. Every insight is a decision rule that evidence could contradict. Every blueprint is an operational bet. If nothing in your document could be proven wrong, you've written a wiki page, not a BrainLift.

## The four layers (DOK)

BrainLifts are organized using Webb's **Depth of Knowledge** levels. The idea: a reader enters at whatever level of abstraction they need, and every higher layer is grounded in the ones below it.

| Layer | Name | What lives here | Who writes it |
|-------|------|-----------------|---------------|
| **DOK1** | Recall / raw facts | Source summaries, findings, numbers, citations | AI may help gather |
| **DOK2** | Skills & concepts | **Knowledge Tree** — the concepts, in your own words | **You** |
| **DOK3** | Strategic thinking | **Insights** (decision rules) + **Blueprints** (workflows) | **You** |
| **DOK4** | Extended thinking | **Spiky Points of View** — contrarian, falsifiable claims | **You** |

The dependency runs upward: **an SPOV that isn't grounded in the DOK1/DOK2 layers is just an opinion.** A skeptical reader should be able to take any DOK4 claim and trace it down through DOK3 → DOK2 → DOK1 to the evidence.

This is also why AI is bounded below DOK3 (see `06 - Working With AI`): the facts (DOK1) are gatherable, but the *synthesis* — the concepts, rules, and positions — has to pass through your brain to be real.

## Two shapes a BrainLift can take

Not every BrainLift looks identical. Two styles show up in practice:

**Topic / pedagogy BrainLift.** Scope is a bounded domain (e.g. "how to design multiple-choice questions"). Uses strict DOK tiering. Purpose: establish defensible positions that inform many downstream decisions. This is the classic shape — the example in `03`/`04` is one.

**Product-spec BrainLift.** Scope is a specific product being designed. Looser tiering, organized around the product's natural sections (curriculum, design, build spec) — but with the same DOK-style rigor *inside* each section: evidence base, explicit decisions with *why*, named exclusions, open tensions. Purpose: let a reviewer evaluate and approve the design.

Both are legitimate. A team often has both — a product spec that cites topic BrainLifts for the claims it depends on. When in doubt, start with the topic style; it's the more disciplined default.

## The mindset

> **The value is in the reaction, not the construction.**

A BrainLift only becomes *yours* through the act of engaging with it: reading each claim, comparing it against what you know, pushing back where it's wrong, sharpening where it's close. A BrainLift that has never been argued with is still a draft — no matter how polished it looks. You build it in many small passes, not one long sitting.

Next: `02 - Anatomy & Structure` — the actual sections and what each is for.
