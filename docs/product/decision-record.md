# Product and implementation reconciliation

Draft for discussion, 2026-09-06. The founder requested reconciliation before scope selection and clarified that stack/hosting remain open, with Electron preferred. This document proposes how the existing decisions fit together; it does not freeze scope or authorize a particular stack.

## Repository foundation update

Development scaffolding has now been requested and implemented with Electron, React, and TypeScript. See [architecture](../architecture/README.md) and [development](../development/README.md) for current tooling. The discussion below preserves accepted product decisions and labeled proposals; the old implementation decision order is historical. Root `PRODUCT.md` takes precedence.

## Accepted use-case priority

The founder clarified that the Learning Path is the primary use case. Design for it first; analyzing sources and following research/curiosity is a secondary entry into the same product. This priority is accepted; detailed release scope and stack remain open.

The proposed primary journey is: learning intent → human-owned Brief → sourced Learning Path → practical activity in the learner's own tools → results brought back → explanation, reflection, and next activity → human insights → Playbook. Reading, questions, and checks support the activity throughout. A source-first journey remains supported by the same source, question, and reasoning records, without requiring every exploratory item to belong to a lesson.

## Accepted practical-learning direction

The founder prefers a custom curriculum assembled from individual sources, with an established curriculum used when it fits. The curriculum should support both immediately useful building and deeper foundational understanding; a long reading sequence is not a prerequisite for beginning practical work.

The founder agrees that hands-on work can happen in an external editor, notebook, or other tool, with results brought back into Applied Research to supplement learning. An embedded execution environment is not required for this experience. Specific import formats, integrations, and release scope remain undecided.

### Proposed learning loop

1. Establish what the learner wants to do or understand, their starting knowledge, and available time.
2. Propose a small activity with an observable outcome, the concepts it exercises, and sources relevant to decisions or likely confusion.
3. Hand off enough context to attempt the activity in the learner's own tools. Include a question or prediction that makes the learning purpose explicit.
4. Let the learner bring back selected results and describe what they tried, expected, and observed. Failed attempts are useful learning material too.
5. On request, interpret the results against the activity and sources, distinguish observation from inference, and identify what remains uncertain. The learner writes their own conclusions.
6. Propose a next experiment or a deeper explanation tied to the result. Keep changes to the path inspectable and preserve existing work.

Initial return-flow proposal: explicit attachment/paste plus a short reflection. Dedicated repository/notebook integrations can follow if this proves too cumbersome. This is a proposed starting point, not a selected integration design.

### Changes required in the existing surface spec

- A lesson needs an intended capability, activity, expected evidence, relevant concepts/sources, and a check of understanding; it cannot be represented solely by reading material. Foundation-oriented lessons need not have a contrived build assignment.
- Canvas must connect attempts and results to lessons, questions, source passages, and human insights. Reader remains available when a result raises a conceptual question.
- Opening all sources is insufficient to complete a practical lesson. Revise the existing completion rule to distinguish activity completion from demonstrated understanding. A successful run is not automatic mastery.
- User artifacts need their own provenance and locators: an imported metric, log excerpt, or code snippet is observed evidence, not a scholarly source sentence. Preserve the source-citation contract while defining a separate reference contract for artifacts.
- AI interpretations remain labeled as AI and must identify the supplied evidence, cited explanations, and uncertainty. Bringing in results does not authorize AI to write human insights or theses.
- Playbook should preserve what was tried, what was observed, and the human's conclusions alongside cited knowledge. Context-pack export remains deliberate about which artifacts are included.

Proposed acceptance journey: a learner completes a short activity outside the app, returns a result (including an unsuccessful one), receives an evidence-grounded explanation on request, records their own insight, and can see why the next learning step is relevant. This is an addition to curriculum-quality and citation tests, not proof of mastery by itself.

## Proposed product statement

Applied Research helps a builder turn a learning goal into a source-grounded Learning Path, work through it, and develop their own understanding and positions. The Reader preserves source context; the Canvas connects the Learning Path, cited answers, notes, insights, and theses; the Playbook compiles that work for the human and their coding agents. AI supplies cited explanations and evidence. The human owns notes, insights, theses, and the Brief. Direct source analysis and curiosity-driven exploration use the same records and surfaces as a secondary entry.

This retains the earlier PRD's core intellectual-ownership guarantee while adopting the newer learning-tool framing. A limited first implementation need not redefine the full product as a paper-only reaction tool.

## Reconciliation matrix

| Area               | Earlier MVP PRD                                       | Later surfaces / resolved decisions                                                       | Proposed reconciliation                                                                                                                                                                    |
| ------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Product purpose    | Paper-first reaction engine                           | Learning tool addressing sourcing, comprehension, knowledge gaps, and synthesis           | Founder prioritizes the Learning Path. Validate intent-to-path-to-learning first; preserve source-led exploration as a secondary entry.                                                    |
| Main surfaces      | Reader, Workbench, stretch Map                        | Reader, Canvas with Learning Path, read-only Playbook                                     | Canvas replaces the Workbench; Playbook becomes its own compiled view. Do not implement both organization systems.                                                                         |
| Learning structure | Paper citation DAG and calibration marks              | Topics and lessons ordered by prerequisites; checks and computed status                   | A paper citation graph is evidence for a curriculum, not the curriculum itself. Keep curriculum structure separate from source argument graphs.                                            |
| Source kinds       | Papers only                                           | Papers, chapters, HTML/EPUB, courses and timestamped lectures                             | Define a shared immutable source/sentence contract; choose ingestion adapters and delivery order separately. Lecture locators include time.                                                |
| Reader writing     | Explain, Note, Counter, Idea                          | Explain, Note, Insight; positions on the Canvas                                           | Use current verbs. Preserve the useful ability to challenge a claim through a Critique thesis, without resurrecting withdrawn counter/resolution event types.                              |
| Event vocabulary   | Counter, resolution, idea, known                      | These explicitly withdrawn in ticket 26; new learning/check/explainer events              | Base a new contract on the resolved vocabulary; recover durability and author validation from the older PRD. Specify edits, drafts, undo, settings, and derived records explicitly.        |
| Human authorship   | Type and SQL constraints; byte-identical human export | Same doctrine; human Brief ownership after edit                                           | Keep enforcement outside prompts, at write interfaces and storage. Model AI Brief proposals separately from human-owned Brief records.                                                     |
| AI interaction     | Cited inline answers and background distillation      | On-request answers, visual explainers, pointing, checks; bounded sourcing/explainer loops | Define a common request/job lifecycle. Distinguish requested background work from unsolicited content. Added verbs do not justify an always-running autonomous agent.                      |
| Verification       | Verify spans before rendering; stream tokens          | Unsupported claims rendered as badges, never prose                                        | Resolve streaming at claim granularity; source existence/string matching alone is not semantic entailment. Keep anchor validity and answer-faithfulness evaluations separate.              |
| Local ownership    | SQLite plus JSONL and Markdown; no backend            | Full local vault at every tier, paid cloud replica and compute                            | Preserve local durable ownership. Decide sync and cloud module contracts independently from the desktop renderer choice.                                                                   |
| Privacy            | Opt-in telemetry; provider calls in main              | Analytics on by default; claim that content never leaves the machine                      | This is unresolved: provider inference, cloud rendering, and sync send selected content off-device. Choose analytics default and write accurate data-flow language.                        |
| Export and MCP     | Context pack files plus four read-only tools          | More explicit agent-specific paths and copyable setup                                     | Keep one compiled projection for file export and MCP. Separate generated application instructions from untrusted source quotations. Confirm placement and normalization rules before code. |
| Settings/account   | BYOK and GitHub device flow                           | Managed keys, plan, sync, account, voice/keyboard preferences                             | GitHub identity is not automatically the product account system. Choose authentication after deciding the paid/cloud architecture.                                                         |
| Visuals            | Older colors/type restrictions                        | Field Atlas and later approved surface behavior                                           | Use DESIGN.md and approved assets for visual language, reconciled surfaces for interaction. Prototypes are evidence, not production state or persistence implementations.                  |
| Timeline           | September 9 demo and dated five-day build plan        | Wayfinder explicitly says no deadline                                                     | Do not inherit the old deadline or its cuts. Establish delivery milestones after agreeing scope.                                                                                           |
| Repository license | Apache-2.0 stated in PRD                              | Existing GitHub LICENSE contains GNU GPL version 3                                        | Record this mismatch and confirm intended license before scaffolding package metadata. Preserve the remote license in the meantime.                                                        |
| Stack              | Specific Electron/React/SQLite/provider versions      | Some historical notes call these fixed                                                    | Founder explicitly reopens stack and hosting in this session. Treat old choices as candidates, verify compatibility and availability before selection.                                     |

Sources: `docs/archive/planning/mvp-prd.md`; `docs/archive/gauntlet/SURFACES.md`; `docs/archive/gauntlet/wayfinder-prompt.md`; `CONTEXT.md`; `docs/archive/surface-decisions/issues/26-event-vocabulary.md`; `DESIGN.md`; `design-system/INTEGRATION.md`.

## Program implications

- Learning Path generation, source selection, prerequisite ordering, and next-lesson behavior belong in the first end-to-end design, rather than being stretch additions after a paper reader. A short complete path is a better first validation journey than a large reader-only implementation.
- Lesson-to-source relationships must allow multiple sources per lesson and reuse of a source across lessons. Questions and notes may be project-scoped or source-anchored without mandatory lesson membership, so curiosity can branch naturally.
- Keep user work stable when a path changes: lessons need durable identities; path revisions must not delete questions, notes, source references, or completed work. Define revision and reassessment policy before adaptive replanning.
- Curriculum quality needs its own evaluation: fit to the Brief, prerequisite coherence, useful source coverage, and a practical next lesson. Citation-valid answers alone do not establish that the Learning Path is good.
- Source identity, sentence anchors, authorship, and event persistence are shared foundations across both product versions. Design these first.
- Reader and Canvas are projections over shared records. Opening an answer in both places must not duplicate it or produce separate edits.
- Learning Path, source argument graph, and Canvas placement are different data: curriculum prerequisites, evidence relationships, and user presentation. Avoid one overloaded graph schema.
- Durable content and temporary interaction state have different lifetimes. Selection, viewport, and hover belong to the renderer; drafts must survive interruption if the product promises that recovery.
- A source parser and a model provider are concrete variation points. Choose adapters there; do not add generic layers around every operation.
- Cloud rendering is independently deployed work if included. It changes hosting, job durability, cost control, and release design; an Electron decision alone does not resolve it.

## Decision order for this session

1. Learning Path primacy, custom-source curriculum preference, and external practical work with results brought back are agreed. Define activity/result contracts and how evidence informs the next step, retaining citation, authorship, durability, and export guarantees.
2. Define the first complete release journey and which source kinds, explainers, learning checks, pointing, and cloud features it includes. Do not equate implementation order with permanently dropping a feature.
3. Choose local/cloud responsibilities, offline behavior, managed keys versus BYOK, and privacy defaults.
4. Evaluate Electron and the supporting stack against those responsibilities; run targeted spikes for the uncertain capabilities.
5. Freeze module interfaces and the event/source contracts, then scaffold.
6. Connect the existing GitHub history, establish deterministic CI and installer builds, then select/configure the Sonar deployment.
7. Turn accepted decisions into concrete Linear issues with dependencies and observable acceptance criteria.

Next design decision: what the handoff and return experience contains. Work through one concrete example to specify the activity brief, selected artifacts, learner reflection, interpretation, and resulting next step before choosing integrations.
