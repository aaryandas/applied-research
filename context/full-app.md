# Full desktop application — build target

The founder clarified: **“at this point I wanted more than the mvp I wanted the full app.”** This is the current delivery objective, recorded in [AR-5](https://linear.app/aaryan-das/issue/AR-5). It supersedes an MVP-only stopping point. Earlier MVP priorities determine implementation order, not which approved parts may be omitted from the finished product.

## Delegated design completion · September 8

The founder delegates Settings/sign-in, Practical Work, Manim/Three.js and companion design completion to the implementation agents, using the established system and discussions. Clicky sets the companion usefulness standard; [3b1b/videos](https://github.com/3b1b/videos) and 3Blue1Brown videos set the Manim explanation-quality standard. Additional assembled reference approvals are not prerequisites for these slices. Apply the concrete criteria and preserved boundaries in the [updated gauntlet](design-handoff/GAUNTLET-PROMPT.md). Playbook remains deferred.

## Product coverage

Deliver the complete desktop experience described in [product](product.md) and the [design contract](design-handoff/DESIGN-CONTRACT.md): Opening/onboarding, a persistent Learning Path sidebar, Reader, Canvas, Practical Work, Playbook and Settings, with shared reusable components and their real states and interactions. The September 8 founder correction removes the separate Learning Path overview screen; the learning-path capability remains required as topic/concept navigation alongside content. Connect them through the complete learning loop. Prototype coverage/review screens remain design tools, not additional product features.

Include the [approved app-managed AI backend and user sign-in](credentials.md), Effect v3 backend work, persistent local learning records and offline editing, the agreed source/AI/result provenance boundaries, practical-tool integration and fallback, and the supporting tests, quality gates and operating behavior needed by these features. No screen counts as complete because it renders static examples or has placeholder controls.

This names the product areas, not every unresolved interaction or data format. Source ingestion formats, learning-path behavior, Canvas editing/linking, reusable explanation capabilities, result-return contracts, Playbook export, authentication, hosting, spending limits and distribution require concrete decisions where not already approved. The latest scope correction is not blanket approval for a particular implementation, new paid service or every historical idea.

The September 8 Canvas correction requires an infinite dotted canvas with pan/zoom, Distilled notes/questions nested within insights, an Expanded graph including the learning path, and exact reading navigation. Topics and chapters are shared with the sidebar; notes/questions link to their origins and insights link to their supporting entries. Learning, source research and practical work share one project; users can follow questions and add material from their current context rather than restart at Home. The teammate’s paper argument graph is recorded on the roadmap, awaiting its interface and a concrete integration contract. It is not represented as implemented by this prototype.

## Explicitly included capabilities

The founder additionally specified **“all the animation/manim/threejs features, the embedded browser, and clicky-like feature.”** These are required parts of the delivery target, not optional post-MVP ideas:

- **Interface animation:** implement the agreed motion throughout screens and reusable components, including interaction feedback and transitions. Verify timing, interruption, performance and reduced-motion behavior in the real app; match the approved visual references.
- **Manim explanations:** implement the supported mathematical/educational animation capabilities and the actual rendering-to-playback flow, with relevant progress, failure and retry behavior. Integrate the result into the learning experience; a prerecorded sample or written explanation alone does not satisfy this capability.
- **Three.js experiences:** implement real interactive 3D explanations, visualizations and simulations using the supported reusable capabilities, integrated with the learning flow. The existing 2D matrix exercise is not a substitute. Define and verify representative interactions and performance targets with the founder.
- **Embedded browser:** deliver compatible third-party source/tool browsing inside the workbench, the agreed contextual guidance and result-return flow, and the external fallback for incompatible tools. Preserve guest isolation and distinct third-party account/session state.
- **Clicky-like companion:** deliver the cursor-following companion, on-command awareness of the application's context, one-shot help and explicitly started/stopped guided activities. Implement its visual presence, motion and useful interaction with the learning/tools flow. Appearance alone is insufficient. The previously agreed observation boundaries remain active; outside-app observation/control and automatic actions still require explicit decisions.

At kickoff, expand each capability into linked implementation and review tickets using the recorded discussions and references. Present missing execution/rendering placement, capability definitions, interaction details, cost/access and acceptance targets as decisions. Manim and Three.js are now in scope; do not reopen whether to omit them merely to simplify delivery. The earlier reusable-capability constraint and fallback for unsupported explanations still apply until explicitly changed; this addition does not authorize arbitrary generated-code execution.

## September 8 sequencing update

The founder rejected the current Playbook assembly and explicitly deferred Playbook until the rest is built out. Keep AR-20 open for later redesign and implementation; the existing specimen is not approved. This is a sequencing deferral, not permanent removal from the product. Playbook review and implementation must not block the active backend and approved-screen work. The founder now prioritizes backend assembly and readiness for the gauntlet.

## Planning and completion

The active delivery ledger is [AR-13](https://linear.app/aaryan-das/issue/AR-13). Its linked tickets cover Opening/shared components (AR-15), Learning Path (AR-16), Reader (AR-17), Canvas (AR-18), Practical Work/browser (AR-19), Playbook (AR-20), Settings (AR-21), interface animation (AR-22), Manim (AR-23), Three.js (AR-24), companion (AR-25), local records/recovery (AR-26), and integrated acceptance (AR-27). Capability decisions are researched in AR-14 and frontend/storage foundations in AR-28; backend identity/credentials remain in AR-12 with architecture reconciliation in AR-6. These tickets record required scope, not completed implementation.

At kickoff, map all current requirements and design-contract rows to a Linear coverage ledger: product outcome, owning ticket, accepted behavior, reference, dependencies, tests/review evidence and remaining decisions. Recover missing requirements from the existing context before asking the founder to repeat them. Present unresolved behavior with recommendations and options; do not ask again whether the target is an MVP or the full app.

Use milestones to sequence complete slices, including an early working end-to-end milestone, then finish all approved product areas. Completing the first milestone is progress, not completion of the request. Do not stop because the existing smaller MVP passes tests.

Reassess MVP-era deferrals against the full application's production requirements. Identify what recovery, security, observability, live AI validation, performance and distribution work is needed; bring concrete tradeoffs and choices to the founder. Do not silently carry a temporary MVP exemption into final acceptance, or select sync, billing, arbitrary automation, mobile/web clients or new infrastructure merely from the words “full app.”

Completion requires all approved coverage items implemented and integrated, resolved material review findings, the Sonar/TypeScript/Effect gauntlet and applicable real Electron/package checks passing, necessary live validation and delivery criteria met, and explicit documentation of any founder-approved exclusions. Missing decisions remain blockers to their dependent work; never relabel those items as done or drop them from scope. Deployment/publication and spending still require their existing authorization.

`context/mvp.md` remains a factual description of the smaller implementation already present. It is not the final acceptance contract. Use the [full-app gauntlet prompt](design-handoff/GAUNTLET-PROMPT.md) to run the build.
