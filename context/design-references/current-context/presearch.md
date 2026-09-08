# Active presearch — September 7, 2026

The founder has explicitly reopened every previous product and technical decision. Only explicit answers in this session establish the new baseline. Existing implementation and earlier acceptance are evidence, not renewed approval. The session is incomplete. The founder subsequently redirected work to MVP implementation and deferred the proposed task-recovery hardening; [the working MVP](mvp.md) records that scope. This page preserves requirements and explicit design selections, not a finished architecture.

## Newly stated product requirements

The first release serves engineers and product builders who want to learn and deepen their craft. Examples include learning science for educational-product design; LLM architecture, training, traditional ML, agents and harnesses; mathematics and linear algebra; and robotics or world models motivated by a concrete project. These examples establish intended breadth, not a finalized adapter list or a promise of equally validated coverage in every domain.

The first release must accept arbitrary learning topics immediately. The founder explicitly rejects limiting the product to a few curated topics or a fixed course catalog; it should remain a dynamic tool for continued learning across domains. Testing on representative topics does not limit which goals users may enter. Source availability, activity compatibility and the boundaries of reliable guidance still need explicit policies.

An excellent first win involves meaningful interaction or practical application early. Guided exploration of a model or beginning a fine-tuning process is one example. Practical engagement must be balanced with learning the topic; exhaustive reading should not be a prerequisite for getting started.

The product should help users find high-quality information, identify knowledge gaps, receive personalized guidance, and reduce the navigation and context switching involved in learning. Prioritizing critical ideas should preserve depth and support deeper study, rather than produce shallow, bite-sized entertainment. The founder explicitly requests evidence from learning science to guide this balance.

The founder's “20% / 80%” language expresses an ambition to prioritize useful information. It is not an agreed numerical quality target or a verified scientific law. No promise of expertise from a single session is established.

The founder wants to remove logistical friction while preserving useful cognitive effort. They explicitly accept adaptive instructional help: resolve setup/navigation barriers directly when these are incidental to the learning objective; offer a useful cue when the learner has a plausible approach; explain a missing prerequisite or provide a worked example when needed; gradually return consequential steps to the learner as understanding improves. Keep a complete worked solution directly accessible and offer an independent follow-up with a changed case. The follow-up is offered, not a mandatory gate. An ideal cognitive-load level remains a hypothesis, not an established numerical target. Practical success with assistance does not by itself demonstrate independent understanding.

The founder envisions a Clicky-like companion that always follows the user's cursor and, on command, becomes aware of what is happening within the application's window. Ordinary questions remain one-shot. The first release also supports explicitly started guided activities: a command such as “guide me through this” enables observation and guidance scoped to that activity until it finishes or the user stops it. The visual companion can follow locally; its presence alone does not start observation or coaching. Whether the visual companion follows outside the application, the command mechanism, pointing implementation and detailed observation triggers remain open.

The first-release practical-work boundary is explicitly agreed: embed compatible third-party web tools inside the learning workspace and retain an external-tool fallback when embedding is unsuitable. This boundary choice did not itself select a platform; the subsequent Electron selection is recorded below. A specific browser integration, automatic clicking/typing and a general project execution environment remain open. Third-party accounts and tool state remain distinct from application-owned learning records. Detailed handoff, result-return and compatibility contracts remain open.

First-release visual explanations compose reusable capabilities. When those capabilities cannot express requested mathematical or simulation behavior, the product falls back to another suitable explanation format. The founder selected this scope over generating and executing new custom Python/JavaScript for unsupported behavior. Reusable capabilities can compose explanations for arbitrary topics; they do not establish a fixed course catalog. The supported capability vocabulary, fallback choices, renderer libraries and execution location still require design.

When the assistant cannot substantiate a central factual or mathematical claim, it must give the supported parts and identify the gap. The founder selected this over including a labeled tentative explanation or pausing the entire explanation. This permits useful partial progress without asserting the unsupported central claim. Verification methods, evidence thresholds and streaming behavior remain open; accepting arbitrary topics does not guarantee complete verified coverage.

The assistant may save clearly labeled AI notes and proposed insights alongside the learner's writing, with separate attribution. This revises the earlier human-only saved-note/insight restriction. AI contributions must not be presented as the learner's authored conclusions. Detailed editing/adoption rules, AI-authored theses, export provenance and automatic background capture remain separate decisions; this answer does not authorize unrestricted changes to human work.

## Newly stated usage and performance constraints

The founder expects approximately 1,000 simultaneous users throughout the day. This explicitly clarifies the original “1000 people all day” statement. Concurrent product users are distinct from concurrent AI requests or render jobs; request frequency, workload mix and bursts still need estimates before sizing shared services.

Without an internet connection, users must retain access to the canvas and all their saved learnings, notes and insights. They must also be able to create and edit their canvas, notes and insights offline. This requires client retention of saved state and offline edits, but does not select a platform, database, cloud backup or multi-device synchronization. Offline AI, new explanation generation and availability of linked third-party content remain separate questions.

The product should respond as quickly as possible. The first useful learning step on a fresh topic should arrive within 20 seconds. The founder clarified that clip duration and generation wait need separate treatment: a roughly 10-second clip should not take much longer than 20 seconds to generate; longer waits are acceptable for roughly 30–60-second clips. No exact longer-clip limit or separate live-scene target is selected. This correction supersedes the assistant's initial universal 20-second visual cap. It does not approve the earlier research proposal of 30-second warm/60-second cold generation waits for a 10-second clip.

Proposed measurement includes the full request-to-usable-result path, including queueing, retrieval, generation, verification, rendering and loading where applicable; record clip duration separately from wall-clock wait. A progress indicator alone is not the requested learning step or visual. Exact short-clip tolerance, percentiles, failure behavior, availability targets, workload-specific validation and shorter ordinary-response targets remain open. No renderer or provider has demonstrated these requirements yet.

The operating budget for AI, rendering and hosting is explicitly undecided. The founder would prefer not to lose work, establishing a preservation priority without a quantified acceptable-loss or recovery-time target. This does not select cloud backup, multi-device sync or a storage design. Recovery options and their costs still need comparison; do not promise that edits stored only on an offline device can survive loss of that device.

The founder has set aside team size, developer experience, weekly availability and launch timeline as constraints for this architecture comparison. Do not ask for those inputs again or narrow the design around an assumed solo developer, skills gap or historical deadline. Evaluate technical complexity and operating costs against the product requirements; this answer does not establish unlimited staffing or budget.

## Conditional platform selection

The founder agrees to a desktop first release using Electron, subject to the proposed compatibility, contextual targeting, isolation and offline validation checks. This conditionally reaffirms Electron based on the reviewed product requirements. It does not select the installed version, operating-system coverage, UI stack, package manager, database, providers, agent framework or detailed process layout. No implementation spike or application change is authorized by this design agreement; none of the proposed product validation checks has run.

## Accepted local and remote authority

The founder explicitly accepts local control over saved learning work, observation scope and desktop actions, with bounded remote services for AI and compute. Remote tasks may receive the context needed for their work and return results for the local application to check and apply. Embedded third-party content remains outside the trusted application modules even when it is displayed inside the same window.

This selects responsibility and authority, not a process count, database, agent framework or server topology. Direct provider access versus an application backend, exact data-transfer and retention rules, backup/sync, credentials and automatic clicking/typing remain open. Local authority does not mean that no data leaves the machine or that a single offline device provides disaster recovery. The [architecture page](architecture.md) and its linked diagram record the accepted model; activity/task recovery is the next proposal and is not accepted by this answer.

## Still unresolved

- First validation scenarios and breadth of tested coverage, within the requirement to accept arbitrary learning topics.
- Detailed placement of activities and the handoff/result-return experience within the accepted embedded-tools-plus-external-fallback boundary.
- Exact Electron version, supported desktop operating systems, browser integration and process design. Site/authentication compatibility and contextual targeting still require validation under the conditional platform selection.
- The founder proposes Manim and/or Three.js for visual explanations, demos and breakdowns, with an interactive Mac Studio teardown as a reference. Investigate how rendered clips, live scenes and simpler 2D representations fit the accepted reusable-capability scope. No renderer, cloud service or historical explainer-card contract is selected.
- Which actions AI may execute and how it may edit existing work. Adaptive instructional help and saved, separately attributed AI notes/proposed insights are accepted; tool permissions, editing/adoption rules and detailed authorship contracts remain open.
- Specific source formats, learning path and activity contracts, assessment burden, and remaining quantitative targets. Concurrent use, offline editing and the differentiated waiting requirements above are selected; request frequency, data volumes, exact longer-clip/live-scene waits, cost, availability and recovery targets remain open.
- Storage, orchestration, providers, privacy, licensing and operational selections, plus the other stack choices not covered by the conditional Electron selection.

## Evidence and authority

The founder's first Phase 1 answer is preserved in Obsidian as **Applied Research - Presearch Answers 01 - Audience And Learning 2026-09-07**. The source-linked decision register and running conversation summary are linked from **Applied Research - Presearch Session 2026-09-07**, under `Applied Research/Wiki/`.

Their second answer is preserved as **Applied Research - Presearch Answers 02 - Topic Breadth And Guided Browser 2026-09-07**. It explicitly selects arbitrary-topic input and requests investigation of browser guidance and instructional assistance; only the former is a selected product capability at this point.

Their third answer is preserved as **Applied Research - Presearch Answers 03 - Cursor Companion And Adaptive Help 2026-09-07**. It specifies cursor-following presence with app-window awareness on command and explicitly accepts the assistant's second proposal: adaptive instructional help, including an accessible worked solution and an offered independent follow-up. This updates the earlier unresolved assistance question; it does not select Electron, a provider or browser implementation.

Their additional visual-explanation proposal is preserved as **Applied Research - Presearch Input 04 - Visual Explanations 2026-09-07**. Manim and Three.js are candidates for investigation; their mention does not reaffirm the previous rendering stack or execution model.

Their explicit selections are preserved as **Applied Research - Presearch Answer 08 - Guided Activities 2026-09-07** and **Applied Research - Presearch Answer 09 - Reusable Explanation Capabilities 2026-09-07**. They select activity-scoped ongoing guidance after an explicit start, and reusable explanation capabilities with fallback for unsupported behavior. These choices revise the corresponding previously open questions; they do not authorize application implementation.

Their workload, offline-access and waiting-time answer is recorded as **Applied Research - Presearch Answer 11 - Usage Offline And Latency 2026-09-07**. Their correction, **Applied Research - Presearch Answer 12 - Clip Duration And Generation Wait 2026-09-07**, distinguishes short-clip generation expectations from acceptable longer waits for longer clips. **Applied Research - Presearch Answer 13 - Concurrent Users 2026-09-07** selects roughly 1,000 simultaneous users, and **Applied Research - Presearch Answer 14 - Offline Editing 2026-09-07** selects offline creation/editing as well as viewing. These clarification questions are resolved.

**Applied Research - Presearch Answer 15 - Budget And Work Preservation 2026-09-07** records the undecided budget and preference not to lose work. Specific recovery guarantees and backup/sync architecture remain open.

**Applied Research - Presearch Answer 16 - Supported Explanations And Gaps 2026-09-07** selects supported partial explanations with explicit gaps when a central claim cannot be substantiated. **Applied Research - Presearch Answer 17 - Attributed AI Contributions 2026-09-07** permits saved AI notes and proposed insights with attribution separate from human writing. These product rules do not select verification or persistence technologies.

**Applied Research - Presearch Answer 18 - Team And Timeline Not Constraining 2026-09-07** explicitly sets aside team, time, deadline and experience questions as architecture criteria. No team profile or deadline is inferred.

**Applied Research - Presearch Answer 19 - Embedded Tools And External Fallback 2026-09-07** records agreement to the first-release practical-work boundary: compatible embedded tools with an external fallback. The platform, automation permissions and detailed integration contracts remain open.

**Applied Research - Presearch Answer 20 - Electron Desktop Selection 2026-09-07** conditionally reaffirms Electron for a desktop first release, subject to the proposed validation checks. It resolves the platform question left open by Answer 19; automation permissions, detailed integration contracts and other technologies remain open.

**Applied Research - Presearch Answer 21 - Local Authority And Bounded Remote Work 2026-09-07** preserves “yes” to local control over saved work, observation and desktop actions, with bounded remote AI/compute services. It resolves high-level authority; process placement, durable tasks, provider topology and detailed permission/data contracts remain open.

This page takes precedence over earlier product/stack commitments only to the extent stated above. All remaining historical choices are under review. Consult the [decision audit](decision-audit.md) for their history and the [code map](code-map.md) for implementation facts. Exploratory research and diagrams stay in the [knowledge base](knowledge-base.md); promote architecture only after explicit agreement. The later instruction to build the MVP provides implementation authorization; it does not retroactively approve unresolved design proposals.

## Transition to MVP implementation

**Applied Research - Presearch Answer 22 - Build MVP And Defer Hardening 2026-09-07** preserves “we can do hardening later, lets get mvp done”. This supersedes the earlier implementation hold. The proposed task-recovery contract is deferred, not accepted. The first working loop uses the accepted arbitrary-topic, practical-learning, offline-writing, attributed-AI and embedded-tool requirements. **Applied Research - Presearch Answer 23 - OpenRouter 2026-09-07** preserves the explicit provider selection “use openrouter”. See [MVP scope and implementation choices](mvp.md). Existing isolation and necessary correctness checks remain enabled; comprehensive hardening, durable task recovery and hosting are deferred.
