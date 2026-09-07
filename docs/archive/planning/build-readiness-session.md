# Build readiness

Working design for the pre-build session, 2026-09-06. Recommendations below are proposals, not implemented infrastructure or replacements for the product decisions.

Founder clarification in this session: stack and hosting are **not decided**; Electron is the current preference. Reconcile the two product specs together before choosing scope. Historical statements that the stack is fixed do not override this clarification. See [the reconciliation draft](spec-reconciliation.md).

Accepted product priority: **Learning Path first**. Source analysis and curiosity-driven exploration are secondary entries into the same experience. The first complete build must exercise a learning goal becoming a useful sourced path, not stop at a standalone paper reader.

Accepted learning direction: custom curricula assembled from sources, using established sequences when appropriate. Practical activities happen in the learner's existing tools; bringing results back supports explanation, reflection, and further learning. Embedded execution is not required. Revise lesson completion and evidence contracts accordingly; reading activity alone is insufficient.

Connected project records found read-only: [GitHub](https://github.com/aaryandas/applied-research), [Linear project](https://linear.app/aaryan-das/project/applied-research-64943086779b), and [AR-1: Scaffold Initial Repo](https://linear.app/aaryan-das/issue/AR-1/scaffold-initial-repo). The remote main tree contains only `LICENSE`; AR-1 is In Progress with no description. The local folder has no remote configured. GitHub connector access works; the local `gh` credential is invalid.

## Repository assessment

- The repository has an initial commit but no tracked files, application manifest, lockfile, production source tree, CI workflow, or configured Git remote. Existing work is untracked; preserve it during cleanup.
- `docs/gauntlet/SURFACES.md` records September 6 decisions and `CONTEXT.md` supplies their vocabulary. The resolved event-vocabulary ticket explicitly withdraws the MVP PRD's counter, resolution, idea, and known events. This is evidence of deliberate product evolution, not merely competing mockups.
- `docs/mvp-prd.md`, `PRODUCT.md`, and `design-system/INTEGRATION.md` still direct a builder toward the September 4 Workbench/paper-only product. Reconcile these entry points before implementation.
- The later surfaces explicitly leave stack, backend, sync, auth, billing, testing, and distribution out of scope. Older implementation decisions therefore need a compatibility review against the newer product.
- `references/` is approximately 226 MB and includes third-party source. `design-system/` is approximately 31 MB. Neither should accidentally become packaged application code or a Sonar analysis target.

## Decisions to settle

| Decision | Evidence and proposed treatment |
|---|---|
| Product authority | Reconcile September 6 surfaces and glossary with the older PRD in this session before choosing scope. Preserve the explicit later product changes and useful earlier behavioral guarantees. |
| First build | Propose Brief → short sourced Learning Path → external activity → returned result → explanation/reflection → next step → Playbook. Reading and checks support this loop. Detailed scope remains to be agreed. |
| Local versus cloud | Electron and local vault remain a useful base. Sync, managed keys, billing, and cloud Manim rendering need separate implementation decisions and deployment ownership. |
| Privacy | Resolve older opt-in telemetry versus newer analytics-on-by-default. Cloud rendering and sync also require an accurate statement of what leaves the machine. |
| Event contract | Promote the resolved September 6 vocabulary from `.scratch/surfaces/issues/26-event-vocabulary.md` into durable architecture documentation. Decide how derived lesson status is persisted or recomputed. |
| Versions | Verify actual package/runtime and provider-model availability before pinning. Prior documents are requirements evidence, not an installable lockfile. |
| Distribution | Repository found; confirm target architectures, signing availability, and whether the first delivery includes any cloud module. |

## Program design

Start with one application package. Avoid a monorepo and empty shared packages until an independently deployed module actually exists. Organize main-process implementation by responsibility, with small interfaces exposing useful operations rather than raw database or IPC primitives.

```text
src/
  main/
    app/           composition, startup, shutdown, IPC registration
    vault/         transactions, event log, migrations, projections, recovery
    sources/       fetch/parse adapters, canonicalization, sentence identities
    research/      cited answers, provider adapters, verification, job lifecycle
    learning/      path and lesson rules, placement/check results
    playbook/      deterministic assembly and context-pack serialization
    credentials/   operating-system protected secrets and key lifecycle
    mcp/           read-only tools over existing application operations
  preload/         narrow contextBridge interface
  renderer/
    shell/
    reader/
    canvas/
    playbook/
    settings/
    ui/            reused controls and adopted design tokens
  contracts/       validated messages and serializable public types
tests/
  integration/     real temporary vaults and recorded provider responses
  e2e/             Electron user journeys
  fixtures/        small, licensed sources and adversarial inputs
evals/             labeled cases, scorers, versioned thresholds
docs/
  architecture/    accepted decisions and module contracts
  development/     setup, verification, release instructions
```

Create directories as their implementation lands. These are proposed ownership locations, not a request to generate placeholder abstractions.

| Module | Small interface | Complexity owned by its implementation |
|---|---|---|
| Vault | Open vault, execute validated human/research commands, read projections, subscribe to changes | Sequence assignment, transactions, author constraints, migrations, durable drafts, mirror/export recovery |
| Sources | Import source, read document, resolve sentence span, retry/cancel import | Format adapters, sanitization, segmentation, immutable identities, resumable stages |
| Research | Request an answer for a question and source refs; subscribe/cancel | Prompt assembly, provider adapters, budgets, retries, verification, durable final result |
| Learning | Read path/status, record check response, apply validated grade | Prerequisite ordering, status derivation, disputed results, deterministic next lesson |
| Playbook | Preview at event revision, export that revision | Preserving human wording, evidence ordering, safe filenames, pack rules, atomic output |
| MCP | Read the same projections and source references | Loopback transport, authorization, request validation; no duplicate research logic |

The renderer owns transient selection, focus, viewport, and unsaved interaction state. Main owns durable state, credentials, networking, and filesystem access. Preload exposes named operations and subscriptions, never arbitrary SQL, file paths, or raw Electron transport.

Use real seams where implementations vary: source formats and model providers. Keep one concrete SQLite implementation; do not create a generic repository interface for every table. Test vault behavior against temporary SQLite files.

### Contracts that need explicit design before coding

1. **Events and drafts:** define a discriminated event union with runtime validation and database constraints. Human notes, insights, and theses cannot be AI-authored. Model incomplete thesis drafts separately from completed theses. Record edits and undo without rewriting history.
2. **Commit and recovery:** commit SQLite first; treat JSONL and Markdown as recoverable projections. Track the mirrored sequence transactionally or use an outbox. A crash between database commit and file write must neither lose nor duplicate an event.
3. **Citation identity:** attach references to an immutable source version and sentence with a specified offset unit. Validate ranges and exact text before returning a verified result. Parser upgrades create a new version rather than mutating old anchors.
4. **Streaming:** reconcile visible token streaming with the requirement that displayed claims are verified. Buffer a claim until validation, or define an explicit provisional display contract before implementing it. Give every request an ID, cancellation, and terminal result; unsubscribe on navigation.
5. **Background work:** persist stage input/version, attempts, output, and completion. Bound concurrency and retries; cancellation and restart must not trigger duplicate paid requests without a stated policy.
6. **Export:** preserve human text according to an agreed normalization contract. The older byte-identical requirement and blanket NFKC sanitization can conflict; normalize untrusted source material separately. Assemble at a fixed event revision, write to a temporary directory, validate, then publish the completed local output.
7. **Generated explainers:** if included, isolate generated executable code in a dedicated rendering environment with constrained inputs, resources, and outputs. Do not execute it with Electron main-process privileges.

## Cleanup sequence

1. Write a root README with product purpose, current build status, and an authoritative reading order.
2. Write the reconciled implementation spec and decision log. Then mark older entry points as superseded where appropriate, with links to the replacement.
3. Preserve research and prototypes in place initially. Promote still-authoritative `.scratch` decisions before ignoring local scratch directories.
4. Inventory third-party licenses and asset provenance. Commit only the reference material needed for reproducibility; retain a source index for large captures and downloaded repositories. Do not delete originals as part of this inventory.
5. Add ignore rules for generated dependencies, build output, local caches, secrets, and real user vaults. Keep synthetic fixtures available to CI.
6. Scaffold the confirmed stack with a lockfile and reproducible commands. Port semantic tokens and approved assets, not the entire standalone reference stylesheet.

## CI and release design

Recommended base: GitHub Actions runs the checks and builds; Sonar supplements them. SonarQube Community Build is self-managed static analysis, not the CI runner or release system.

| Trigger | Required behavior |
|---|---|
| Pull request | Locked install; formatting/lint; type check; deterministic tests; fixture-based citation/export checks; production build; Electron smoke journey. No provider or signing secrets. |
| Default-branch push | Same checks, plus Community Build analysis of first-party production code with coverage imported from tests, if Sonar is configured. |
| Scheduled/manual evaluation | Separately budgeted live-provider evaluations; redact captured data. Keep these distinct from deterministic PR gates. |
| Release candidate | Verify the exact revision; package on macOS, Windows, Linux runners for the confirmed architectures; upload installers and checksums as artifacts. |
| Release approval | Publish the verified candidate as a GitHub Release. Give only this job release-write access; use a protected environment for signing/publishing secrets. |

Use stable required-check names, minimal token permissions, pinned action revisions, job timeouts, and cancellation of superseded PR runs. Run untrusted PR code without privileged secrets. Do not use `pull_request_target` to execute checked-out PR code.

Start meaningful tests with author enforcement, vault crash/replay behavior, sentence identity, verified/unsupported citation outcomes, and preservation of human text in export. Add Electron end-to-end coverage for one complete user journey. A green empty test suite is not build readiness. Generate coverage in the test runner; Sonar consumes it rather than running the tests.

### Sonar choice

- **Community Build:** reasonable if an existing instance is available and default-branch reporting is enough. Requires an operated server, persistent storage, maintenance, and connectivity from the runner. Native multiple-branch and PR analysis are not supported.
- **PR-first alternative:** evaluate SonarQube Cloud against repository visibility and current plan limits if inline PR analysis is the actual requirement. Do not choose a paid plan without reviewing those constraints.
- **Initial recommendation:** establish reliable Actions checks first; add Community Build as a default-branch quality check if desired. Do not make a main-branch-only Sonar check a required PR status.

Official sources checked for this session:

- [Community Build GitHub integration and feature limitations](https://docs.sonarsource.com/sonarqube-community-build/devops-platform-integration/github-integration/introduction)
- [Adding Community Build analysis to GitHub Actions](https://docs.sonarsource.com/sonarqube-community-build/devops-platform-integration/github-integration/adding-analysis-to-github-actions-workflow)
- [Quality gate integration](https://docs.sonarsource.com/sonarqube-community-build/analyzing-source-code/ci-integration/overview)

External setup still needed: connect the local work to the existing GitHub history, branch rules, Sonar project and reachable host if selected, analysis token stored as a secret, release environment, and any signing credentials. No remote setup or CI execution has occurred in this session.

## Ready to build when

- One current product scope and event contract agree across the entry-point documents.
- A clean checkout installs, verifies, and builds using documented commands.
- Required PR checks run on GitHub and a deliberately broken change fails them.
- A release candidate produces installable artifacts from the verified revision.
- Brief → sourced Learning Path → external activity → returned result → explanation/reflection → justified next step → durable vault/export is the first complete validation journey, with agreed Canvas behavior and explicit deferred features.
