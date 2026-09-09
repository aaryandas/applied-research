# Applied Research

See the [decision audit](decision-audit.md) before interpreting open/unimplemented items below: several have prior recorded selections or later revisions that need reconciliation.

The [active presearch](presearch.md) supersedes older commitments where explicitly stated. The founder now requests [the full desktop application](full-app.md). The [working MVP](mvp.md) describes the existing smaller implementation, not the final delivery target.

## Current direction

A **learning workbench for engineers and product builders**. Learning Path is the primary use case. Analyzing sources and following curiosity is a secondary entry into the same experience.

The central loop is: learning goal → useful learning step → practical work in the learner's own tools → results brought back → explanation and reflection → next step. Reading, cited explanations, and checks support this loop. Deeper foundational learning is also a first-class goal; not every subject needs an artificial build assignment.

Prefer a custom curriculum assembled from individual sources. Use an established course or textbook sequence when it fits the learner's goal, starting knowledge, and time budget.

Entering an arbitrary goal starts a short open-ended diagnostic of real understanding, then a reviewable sourced syllabus. Explicit accept opens the first substantive lesson; later lessons generate when reached. Human profile and interview answers persist with revisions. AI assessments stay separately attributed. Current `generateSourcedLearning` is not this preview/accept flow.

## Experiences

- **Learning Path:** a persistent left-sidebar outline of expandable topics and their concepts/learning items. Selecting an item opens its content in the main workspace. This is the organizing navigation, not a separate overview screen (founder correction, September 8). Direction through concepts and activities still needs evidence for why the next step is useful.
- **Reader:** highlight source text, click Note and summarize it in your own words. Notes preserve the highlighted text and source context. Later, link at least two saved notes or questions into an insight (latest September 8 correction). Reader separates Notes, Insights and Sources; an insight shows the learner’s notes and lets them trace each note to its source highlight. This applies to generated lessons, imports and source material discovered through OpenAlex/Semantic Scholar.
- **Canvas:** automatically collapses the sidebar to an icon rail and groups Distilled/Expanded in a thin top bar to focus on the graph. Leaving Canvas restores the full sidebar. An infinite canvas with a dotted background, navigated by pan and zoom rather than document scrollbars. Show the learning path as a graph using the same topics and chapters as the sidebar. Notes and questions connect to their originating topic/chapter; insights connect to their supporting notes/questions. Distilled view nests those supporting entries inside insights; Expanded exposes the connections and source highlights. Exact reading links remain available. Unassigned origins stay unassigned rather than being inferred from stale navigation.
- **Playbook:** compiled knowledge, observations, and human conclusions for the learner and their coding agents. The current visual assembly was rejected and work is deferred until the rest is built out (September 8); preserve its underlying records while prioritizing the backend.
- **Practical work:** compatible web tools can be embedded, with an external fallback. Selected results can be captured as distinct evidence. The MVP includes a reusable matrix experiment; it does not execute arbitrary generated programs.

"Learning workbench" describes the product; it does not restore the superseded Workbench tab or its older event types.

Learning, building and source research are entry intents into one project, not isolated modes. A learner can explore a question, add a source, read, take notes and return to practical work without restarting from Home. Preserve the originating passage or idea and navigation position when following a branch. The portable specimen demonstrates this navigation with temporary pasted sources and saved questions; live generation and durable navigation are not implemented.

The teammate’s paper argument graph is roadmap work (September 8). It may appear within the same Canvas for a paper; its claim structure, interface and integration await the teammate’s material. It remains distinct from the learner’s notes and insights.

## Invariants

- Human writing and AI contributions keep separate attribution. AI notes and proposed insights are allowed; the MVP represents them as read-only assistant entries rather than editing human conclusions.
- AI explanations distinguish cited evidence, observations from returned artifacts, and inference. An unresolved citation is never presented as verified.
- Attempts and results have provenance. Failed attempts can support learning.
- Reading completion or successful execution alone does not establish understanding or mastery.
- Path changes preserve existing work and its references. Curiosity can branch outside a lesson.
- Local control of saved work, observation and desktop actions is accepted, with bounded remote AI/compute. The MVP saves locally and uses OpenRouter; backup and sync remain open.

## Build status and open decisions

See [the working MVP](mvp.md) for implemented behavior, setup, validation and limits. Learning spaces, movable notes/results/source references, local persistence, OpenRouter assistance, an embedded browser and one reusable math capability are implemented. The structured Learning Path sidebar and its durable model, broad ingestion, sync, durable jobs, hosting and distribution remain unimplemented or awaiting their detailed contracts. No live performance/quality/capacity claim follows from the scaffold or recorded tests.

Historical discussions and the incomplete decision interview remain in the [Obsidian knowledge base](knowledge-base.md). There is no inherited capstone deadline.
