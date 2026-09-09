# Current delivery policy

Execution policy reflecting the founder’s decisions and current delivery evidence, updated September 9, 2026. Read this before [next-run](next-run.md). It supersedes conflicting execution instructions in older handoffs, workflow examples and agent files. Product requirements, process isolation, credential ownership and substantive quality gates remain in force.

## Founder integration override — September 9, 2026

The founder explicitly instructed the coordinator to integrate all implemented project work, resolve merge conflicts, and merge it into main without waiting for CI or Sonar. This overrides the merge prerequisites below for this consolidation. Existing CI and Sonar outcomes remain truthful; failures are not relabeled as passes. Product acceptance, provider budgets, credential isolation and deployment authorization remain separate. Obsolete overlapping implementations are reconciled to the newer behavior rather than restored over it.

## Execution and ownership

- Implementation and independent standards/spec criticism run on **Cursor Cloud, Grok 4.6, Extra High (`xhigh`)**. Do not launch Fable, local/headless Cursor inference or replacement local coding workers. Use the existing cloud worker for a ticket when continuing its work.
- **Seven concurrent Cursor Cloud agents maximum across the project**, counting implementers, critics, verifiers and recorders together. The other task's **AR57** work occupies one of those slots while active; it is not an extra allocation. Resolve current active runs before dispatching another.
- **One coordinator** owns dispatch, slot accounting, shared contracts, integration, status reconciliation and the merge/deploy sequence. Other tasks report through that coordinator. One ticket has one lane, branch and PR; `lane:integration` belongs to the coordinator. Shared allowlists do not give two workers ownership of the same file.
- Branch creation, commits, publishing coherent checkpoints and PR creation/updates are authorized within the assigned scope. This is not permission for unchecked merges, production deployment, purchases, provider-budget changes or weakened checks. AR41 owns delivery workflow code; other lanes hand off precise changes to that owner.

## Verification and acceptance

- Do **not** run Electron E2E, packaged-app tests, video recording/rendering or Sonar on the founder's Mac. Use cloud/CI capacity for these tasks. Do not restart local services or repeat local verification to work around a cloud failure.
- **macOS CI is the blocking application platform.** Linux and Windows remain reporting-only for the general application suite. A specialized cloud/Ubuntu render-evidence job may prove its own bounded behavior; it does not replace the macOS gate.
- Product acceptance requires the real app at a frozen revision on the **Cursor Cloud desktop**, with an actual nonempty MP4 recorded and attached to the Linear ticket and a criterion-by-criterion result. Follow [linear-demo-record](../.cursor/skills/linear-demo-record/SKILL.md). A terminal fixture, screenshot, empty state, simulated artifact or recording of an older revision proves only what it actually demonstrates. Missing interactions and failed criteria remain incomplete.
- Independent criticism requires a different cloud agent from the implementer and acceptance roles, the actual selected model, the exact reviewed SHA and authentic run provenance. A bot name, marker, submitted model string, check name or status column is not proof. No self-PASS or fabricated receipt.
- Hosted Sonar analyzes **main**. Require successful analysis of the actual resulting main SHA before the next queued merge or deployment. Do not run a feature checkout into hosted main history or add a local scan as a substitute. Preserve thresholds and address material findings.
- Before merging, reconcile current main with the candidate, complete applicable macOS CI/lane/Linear checks, independent standards/spec review and actual acceptance evidence. Serialize integration; a changed head invalidates claims that depended on the previous head. Preserve valid historical evidence with its original scope.

## Automation and credentials

The Cursor orchestration key is secured in the existing GitHub environment **`trusted-main`**, restricted to deployment branch **`main`**. The repository-scoped copy was removed. The legacy Fable reviewer workflow is disabled. Do not create replacement keys/environments, restore Fable, or expose credentials to PR-controlled executable code. Trusted evaluators execute reviewed default-branch code and treat PR numbers/SHAs as data.

**End-to-end workflow activation is not yet proven.** A green notice, helper test or eligibility calculation does not establish a functioning reviewer, status trigger, serialized queue or deployer. Keep automatic launch/merge/deploy activation off until the concrete implementation is independently reviewed and observed working. Record failures and ownership; do not repeatedly change settings or spend on new agents to compensate for the same unresolved configuration issue.

While status automation is being repaired, the coordinator may manually reconcile **Backlog → In Development** for work that has actually started. Do not advance a ticket merely to satisfy a check. In Testing requires a frozen, ready candidate; In Review requires the completed cloud recording and passing criteria; Done requires the actual reviewed merge and required resulting-main checks. A broken trigger is recorded and repaired without inventing acceptance. Process In Testing handoffs one at a time and confirm the intended run actually starts.

## Lessons applied to this run

1. **Probe contracts before consumers.** Independently test forged identities/provenance, missing fields, stale revisions, bounds, cancellation and late results before expanding dependent implementation.
2. **Publish a coherent checkpoint before widening scope.** Freeze the contract/code/test revision, make it reviewable, resolve material findings, then hand its exact SHA to consumers. Avoid parallel implementations against changing assumptions.
3. **Resolve configuration once.** Inspect the real run and authoritative settings, assign one owner, apply one bounded fix and verify it. Repeated setup attempts or duplicate workers do not replace that evidence.
4. **Keep provenance through integration.** Bind source, launch, review, recording and CI evidence to exact revisions and actual owners. A merge or new commit requires reassessing the affected evidence.
5. **Make status reflect work.** Reconcile started work conservatively while automation is repaired. Partial demos, unavailable runtimes and blocked authentication remain explicit gaps, never completion signals.

## Linear gate duplicate-attachment incident

Parallel Linear gate jobs on [PR70](https://github.com/aaryandas/applied-research/pull/70)/[PR71](https://github.com/aaryandas/applied-research/pull/71) both called `attachmentLinkURL`; the loser failed `INPUT_ERROR` 400 duplicate URL. Draft/In Development classification was already the expected green lifecycle and is not a status defect. The repair is idempotent re-query of the intended issue/URL ([incident](linear-gate-duplicate-attachment-2026-09-09.md)). Cursor CI Autofix [PR69](https://github.com/aaryandas/applied-research/pull/69) was rejected for skipping tests; that automation stays paused. Original main Sonar skip after macOS failure [34361091356](https://github.com/aaryandas/applied-research/actions/runs/34361091356) remains a real failure, not a waiver.

## Current consumer leases

AR47 owns Opening, new onboarding UI/main modules, LearnerProfile files and migration `0005_learning_onboarding.sql`; the coordinator owns journal/shared store/App/Shell/preload application of its precise integration patches. AR50 keeps migration0004. AR51 owns migration0006_contextual_retention for retained explanations; AR56 reserves0007 for entry origins if needed. AR58 owns six new backend boundary test files; AR48 retains existing backend production and tests. Final AR52 `bca886a` and AR53 `32d3344` passed independent Cloud review and are integrated at `f32b548`; consumer implementation may proceed.

AR51 owns the new contextual main/backend modules, contextual explanation UI and migration0006; AR54 retains clip player/media/render-worker files. Shared store/IPC/Reader/Canvas mounts stay coordinator-owned patches.
