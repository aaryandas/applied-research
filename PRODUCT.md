# Applied Research

## Current direction

A **learning workbench for product builders and hobbyists**. Learning Path is the primary use case. Analyzing sources and following curiosity is a secondary entry into the same experience.

The central loop is: learning goal → useful learning step → practical work in the learner's own tools → results brought back → explanation and reflection → next step. Reading, cited explanations, and checks support this loop. Deeper foundational learning is also a first-class goal; not every subject needs an artificial build assignment.

Prefer a custom curriculum assembled from individual sources. Use an established course or textbook sequence when it fits the learner's goal, starting knowledge, and time budget.

## Experiences

- **Learning Path:** direction through concepts and activities, with evidence for why the next step is useful.
- **Reader:** source context, cited explanations, questions, and human notes.
- **Canvas:** relationships among lessons, questions, attempts, results, insights, and theses.
- **Playbook:** compiled knowledge, observations, and human conclusions for the learner and their coding agents.
- **External work:** experiments happen in the learner's editor, notebook, or other tools. Explicitly returning selected results is part of the core experience. No embedded execution environment is required.

"Learning workbench" describes the product; it does not restore the superseded Workbench tab or its older event types.

## Invariants

- Human notes, insights, and theses remain human-authored; AI does not write the learner's conclusions.
- AI explanations distinguish cited evidence, observations from returned artifacts, and inference. An unresolved citation is never presented as verified.
- Attempts and results have provenance. Failed attempts can support learning.
- Reading completion or successful execution alone does not establish understanding or mastery.
- Path changes preserve existing work and its references. Curiosity can branch outside a lesson.
- Durable local ownership remains the intended direction; storage and any cloud responsibilities require explicit design.

## Build status and open decisions

The current deliverable is an Electron + React + TypeScript development foundation. This follows the desktop preference and is a reversible starting point, not a settled backend architecture.

Still open: detailed lesson/activity/result contracts, import formats, completion and assessment policy, first-release scope, storage, AI providers, authentication, telemetry defaults, sync, cloud compute, signing, and hosting. There is no inherited capstone deadline.

Historical discussions, research, and superseded specifications live in the [Obsidian knowledge base](docs/knowledge-base.md). This document contains the current product direction and takes precedence over that historical material.
