# Delivery orchestration

Independent review is **Cursor Cloud Grok 4.6 Extra High** (`GET /v1/models` id `grok-4.6` with `effort=xhigh` and `fast=false`). There is no Fable invocation and no local or headless Cursor inference. Merge and deploy activation stay off until this protocol itself is independently reviewed. Hosted Sonar remains owned by AR-45 / `cursor/enable-hosted-sonar-main-acd0`; this page does not change `sonar.yml`.

PR [#21](https://github.com/aaryandas/applied-research/pull/21) (`codex/ar-41-delivery-workflow`) is the prior Astra/Fable/Luna stack. This orchestration **supersedes** its Fable critic, automatic Claude review, and merge-activation path. It does **not** import that branch's dispatcher, hosted-Sonar worker, or `pull_request_target` gate rewrite.

## Trust boundary

Repo settings, workflow YAML, prompts, and PR payloads are separate trust classes.

| Path                                                                                                                                                              | Executable checkout                                   | `CURSOR_API_KEY`                                                  | What it does                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/claude-review.yml` (`pull_request`)                                                                                                            | PR head (tests only)                                  | **Never referenced**                                              | Runs `npm run test:delivery` and `node scripts/delivery-review.mjs untrusted`. Fails closed if a key is present. Does not evaluate agents.                                                                                        |
| `.github/workflows/independent-review-trusted.yml` (`workflow_run` on CI / untrusted-pending `pull_request` completions, plus default-branch `workflow_dispatch`) | **Default branch only**, `persist-credentials: false` | Existing GitHub Environment `trusted-main` (branch policy `main`) | Resolves live PR number/SHA as data, scans PR workflow YAML for stolen secret references, authenticates to `https://api.cursor.com/v1/*`, posts the `Independent review / Cursor Cloud Grok 4.6 Extra High` check on the PR head. |
| `.github/workflows/delivery-queue.yml` `pull_request`                                                                                                             | PR head                                               | No                                                                | Helper tests + untrusted notice. Does **not** load GitHub/Linear/`main`/checks.                                                                                                                                                   |
| `.github/workflows/delivery-queue.yml` default-branch `workflow_dispatch`                                                                                         | Default branch                                        | No Cursor key; uses `GITHUB_TOKEN` + `LINEAR_API_KEY`             | Live exact-head eligibility under concurrency group `delivery-queue-live` (`cancel-in-progress: false`). Never merges.                                                                                                            |

`workflow_run` always executes the trusted workflow file from the default branch, and only when the originating event is `pull_request` (main `push` CI does not evaluate). `workflow_dispatch` is skipped unless `github.ref` is the default branch.

Repo settings currently mark `.github/workflows/claude-review.yml` workflow id **353522718** (Actions name `Independent review (Claude)`) as **`disabled_manually`** to stop Fable. That is a settings trust class, separate from this PR's YAML. Delivery tests still run inside `verify.yml` / `delivery-queue.yml`. After merge, trusted `workflow_run` listens to **CI** as well as the untrusted-pending workflow so evaluation is not dormant while that workflow stays disabled. Re-enabling it is a human Actions setting; this PR does not flip it.

Until `independent-review-trusted.yml` exists on the default branch, `workflow_run` will not start this evaluator. Coordinator API launch remains the live critic path for this PR, but coordinator JSON is **not** merge-gate model proof. After merge, the trusted job owns the receipt via `maybeLaunchReview` when `CURSOR_REVIEW_LAUNCH=true`. `workflow_dispatch` `launch_receipt_json` is ignored.

**Residual platform hole (not claimed closed):** a same-repo PR can add a _new_ `pull_request` workflow that references a **repository** secret. The authorized key already lives only on Environment `trusted-main` (deployment branch policy: type=`branch`, name=`main`). The repository-level `CURSOR_API_KEY` was removed after that protected copy was verified. The remaining hole is only if someone **re-adds** a repository secret. This PR's `pull_request` workflows do not receive the key. The trusted job also fails a PR that adds `secrets.CURSOR_API_KEY` to any workflow other than `independent-review-trusted.yml`. Do not create a new secret or environment.

## Roles

| Role               | Who                                                    | Must not do                                                 |
| ------------------ | ------------------------------------------------------ | ----------------------------------------------------------- |
| Implementer        | Isolated lane PR author (Codex/Cursor/other)           | Review or record itself                                     |
| Cloud verifier     | Existing Cursor cloud walkthrough (frozen revision)    | Independent standards/spec verdict                          |
| Independent critic | Separate Cursor Cloud agent, model Grok 4.6 Extra High | Edit, push, merge, or verify the desktop journey            |
| Recorder           | `linear-demo-record` with the actual desktop recorder  | Independent review                                          |
| Coordinator        | Default-branch queue dispatch + launch receipts        | Force merge, lower gates, or treat merge refs as head proof |

## Independent review (implemented)

Helpers: `scripts/delivery-review.mjs`, `scripts/delivery-trust.mjs`, `scripts/delivery-cursor-api.mjs`.

Documented Cloud Agents GET payloads (`V1Agent` / `V1Run`) include id, name, status, `env.type`, `repos[].startingRef`, url, dates, `latestRunId`, run `result`, `durationMs`, and `git`. They **do not** include `originalModelName` or `model`. This gate does not invent those fields.

PASS requires all of:

1. Trusted default-branch invocation (`TRUSTED_DEFAULT_BRANCH=true` and `workflow_run` / default-branch `workflow_dispatch`).
2. Repository variables `IMPLEMENTER_AGENT_ID`, `VERIFIER_AGENT_ID`, and `RECORDER_AGENT_ID` set to documented `bc-` UUIDs. Empty values fail closed. Role identity is authenticated `agent.id` isolation plus `agent.name` matching `/^Independent review\b/i`. `run.result` JSON `role` is not identity (forbidden JSON roles still fail).
3. Live GitHub PR `head.sha` (exact 40 characters). `refs/pull/*/merge` is rejected.
4. `GET /v1/models` contains `grok-4.6` with params `effort=xhigh` and `fast=false`.
5. A **launch receipt** (`kind: cursor-cloud-independent-review-launch`, `source: trusted-launch-job`) bound to authenticated `GET /v1/agents/{id}`, `GET /v1/agents/{id}/runs/{runId}`, and `GET /repos/.../actions/runs/{githubRunId}`: `receipt.agentId === agent.id`, `receipt.runId === run.id`, `receipt.headSha === live head === agent.repos[0].startingRef`, `receipt.workflowPath` is the trusted evaluator, `receipt.githubEvent` is `workflow_run` or `workflow_dispatch`. Receipt `modelId`/`modelParams` record what **that trusted launch job** POSTed. `verdict.model` and coordinator/self-authored receipts are rejected. Undocumented GET model fields are ignored and fail closed if present so tests cannot stub them as proof.
6. `agent.env.type === 'cloud'` (missing type fails).
7. FINISHED run (`run.status` required), verdict `headSha` required and equal to the live head, `findings` required as an array, standards PASS, spec PASS, no unresolved material findings, immutable `https://cursor.com/agents/bc-…` URL.

The GitHub check of the same name is not proof by name. Queue eligibility treats that check as **display only**. Binding is a trusted-run Actions artifact named `independent-review-{pr}-{headSha}` whose zip contains `independent-review-receipt.json` (`kind: independent-review-run-receipt`). The queue lists that artifact by name, `GET`s `artifact.workflow_run.id` (not `details_url` / summary `githubRunId=`), requires `run.path === .github/workflows/independent-review-trusted.yml`, expected job `Cursor Cloud Grok 4.6 Extra High` with `conclusion: success`, and receipt `customCheckId ===` the display check id plus exact PR number and head SHA. `POST /check-runs` assigns a custom check id that is **not** the native job `check_run_url` id. Trusted workflow `run.head_sha` is the default-branch revision that ran the evaluator and **legitimately differs** from the reviewed PR head. Same-name checks, borrowed run URLs, and copied summary strings fail closed.

GitHub comments, `cursor[bot]` text, and marker strings are **not** proof. The trusted job posts a human comment and a check run; neither comment is authentication.

### Launch (opt-in, still off)

`CURSOR_REVIEW_LAUNCH` defaults unset/false. Keep it unset until a human observes the first **explicit** trusted default-branch `workflow_dispatch` launch after this file exists on `main`.

- **`workflow_run` evaluates receipts only.** It must not POST `/v1/agents`. Completed untrusted/CI `pull_request` workflows, including forks, cannot mint a critic.
- **Fresh launch** is explicit default-branch `workflow_dispatch` for one `pr_number` + `expected_sha`. Before POST the job rechecks the live GitHub PR: `open`, non-draft, `head.repo.full_name === base.repo.full_name ===` this repository, `head.sha === expected_sha`, and `GET /repos/.../collaborators/{username}/permission` for **both** `github.actor` and `github.triggering_actor` is `admin`, `maintain`, or `write`. Reruns still check both identities (Actions may set `github.actor` to `github-actions[bot]` while `github.triggering_actor` is the human). Bot-only identities and missing permission fail closed. Reject those cases before any Cursor POST.
- POST `/v1/agents` uses the documented create body: `model.id=grok-4.6`, `params: [{id:"effort",value:"xhigh"},{id:"fast",value:"false"}]`, `env.type=cloud`, `repos[0].startingRef=<exact head SHA>` (no `prUrl`), **`mode: agent`**, `workOnCurrentBranch=false`, `autoCreatePR=false`, client-supplied `agentId` (UUID v5) and header `Idempotency-Key: independent-review:{repo}:{pr}:{sha}`. The create response must include the **original** `run.id`. That exact trusted POST receipt is persisted as Actions artifact `independent-review-launch-{pr}-{sha}` (`independent-review-launch-receipt.json`) owned by the default-branch launch run. Later trusted `workflow_dispatch` evaluate and `workflow_run` load that artifact (GitHub-owned `artifact.workflow_run.id`, trusted workflow path, `workflow_dispatch` on the default branch, expected job success, receipt repo/PR/frozen SHA/agentId/original runId/model/params/workflow SHA+path+run) and `GET` that original run. They must not POST a new agent. A fresh Cloud `RUNNING` run is **PENDING** (exit 0, no completed review check / review-PASS artifact), not FAIL. `latestRunId` is not a launch receipt. HTTP 409 on an existing agent, including a matching deterministic id or claimed prompt, is **fail-closed**; it does not mint a receipt from `GET`/`latestRunId`.
- **Honesty:** documented Cloud Agents `mode` is only `agent` or `plan`. There is no Ask, `readOnly`, or `toolProfile` field. `autoCreatePR:false` / `workOnCurrentBranch:false` do **not** make the agent read-only; `workOnCurrentBranch:false` still pushes a new `cursor/…` branch under the Cursor GitHub App. `plan` is not a security sandbox. Explicit dispatch is an authorized cloud review session using existing project write access, not a least-privilege sandbox.
- **Create body omits `repos[].prUrl`.** Documented `prUrl` ignores `startingRef`. Evaluation fails if GET `startingRef` ≠ live head.
- Do not auto-relaunch a paid review on `RUNNING` or an ambiguous GET error. Account the project-wide seven-agent cap by not minting extras; the existing coordinator launch budget still applies. This job does not invent a new Cloud Agents quota API.

A coordinator-controlled dispatch input is **not** model proof. PASS requires a `trusted-launch-job` receipt recovered from the launch-run Actions artifact (not caller JSON, comments, check summaries, `details_url`, or log extraction) whose `githubRunId` authenticates via `GET /repos/.../actions/runs/{id}` to `.github/workflows/independent-review-trusted.yml` on default-branch `workflow_dispatch` for the original POST. Evaluate-only `workflow_run` may resume that original run. Missing GET model fields do not authorize self-authored `modelId` JSON. If no such artifact exists, the gate stays PENDING/FAIL and `workflow_run` must not mint.

Documented API only: `https://api.cursor.com/v1/*` with Basic auth as in the [Cloud Agents API](https://cursor.com/docs/cloud-agent/api/endpoints).

## Serialized queue (implemented)

Helpers: `scripts/delivery-queue.mjs`.

Live evaluation is **only** `node scripts/delivery-queue.mjs evaluate` on default-branch `workflow_dispatch` with `TRUSTED_DEFAULT_BRANCH=true`. That job loads the live PR, default-branch SHA, `compare` ancestry, check runs, review threads, and Linear issue. It then runs `assessCandidate`. `DELIVERY_MERGE_ACTIVATION` defaults to false, so a fully eligible candidate still has `merge: false`. Cross-runner serialization is GitHub Actions concurrency group `delivery-queue-live`. Local `queue.lock` (`O_EXCL`) is same-filesystem only and is not the live lease.

`pull_request` jobs log `untrusted-notice` and do not fetch. Native merge queues / `merge_group` refs are refused.

`assessCandidate` and `linear-gate.mjs` map GitHub PR shape to expected Linear state (open draft → In Development, open ready → In Testing) and still require **In Review** for merge eligibility. They do not treat Backlog, In Development, or In Testing as In Review, and they do not move Linear status. Expected Linear In Development and nonblocking Windows Verify failures are classified `ignore` for coding-agent autofix; they are not a stale-head code defect. `checks / CI gate` on the live PR head remains the blocking CI signal.

**Hosted Sonar (pre-merge vs post-merge):** PR code receives no `SONAR_TOKEN` / environment secrets. Hosted analysis stays main-only (AR-45 / `sonar.yml`). Pre-merge app-candidate eligibility requires independent source review at the exact PR head, not a PR-head Sonar check. Serialized queue eligibility plus **exact main** hosted Sonar after merge (`bindDeployment` / `evaluateSonar` `phase: postmerge`). Fabricated PR-head Sonar checks are not that analysis. Independent review still fails closed on unresolved material findings.

Current-delivery walkthrough integration root remains `codex/ar-walkthrough-integration` @ `8d0a8154ade3ede7302f6595789aea1e31663707`. This orchestration does not retarget that branch.

**Observed GitHub↔Linear status automation gap:** [next-run.md](../next-run.md) documents Linear GitHub integration PR opened → In Development and ready → In Testing. GitHub PRs [#45](https://github.com/aaryandas/applied-research/pull/45) (AR-52) and [#46](https://github.com/aaryandas/applied-research/pull/46) (AR-53) opened as drafts against the walkthrough candidate with the PR URL attached on Linear, but those tickets **remained Backlog** (`startedAt` null) after the PRs existed. Owned mapping reports that gap when Linear is still Backlog with an open PR; it does not invent In Review.

## Acceptance recordings

Product PRs still need a nonempty MP4 from [linear-demo-record](../../.cursor/skills/linear-demo-record/SKILL.md) attached on the Linear ticket, bound to the exact head SHA, before In Review. Delivery-only PRs (no `src/`, `drizzle/`, or e2e/integration tests) are exempt from that MP4. Known **partial** recordings (AR-17/19/24) are not PASS; do not count them for this ticket.

## Deploy

`bindDeployment` ties a release request to the **exact resulting main SHA**. Failed main CI or hosted Sonar, or a `main` that is no longer that SHA, **halts**. `DELIVERY_DEPLOY_ACTIVATION` defaults to false.

## Current GitHub enforcement

`main` protection currently requires only `checks / CI gate` with strict/admin enforcement. This change does **not** add required review/queue checks, enable auto-merge, or alter branch protection.

## Setup (existing; do not create a new secret or environment)

1. GitHub Environment `trusted-main` already holds the authorized Cursor key. Deployment branch policy: type=`branch`, name=`main`. The repository-level `CURSOR_API_KEY` was removed after that protected copy was verified. The trusted job binds `environment: trusted-main`. Do not create a new secret or environment.
2. Repository variables (required for PASS): `IMPLEMENTER_AGENT_ID=bc-3fdd5333-ab18-489b-9451-d54173ecce33` (this PR's implementer), `VERIFIER_AGENT_ID=bc-ff6622d1-cb38-4688-8562-028b9761e3e0` (existing cloud verifier), `RECORDER_AGENT_ID` set to the recorder agent's `bc-` UUID when known.
3. Keep `CURSOR_REVIEW_LAUNCH` unset until a human observes the first explicit trusted default-branch `workflow_dispatch` launch. `workflow_run` must not mint agents.
4. After that PASS, merge, and explicit human re-enable of the appropriate Actions workflow, decide whether to require the `Independent review / Cursor Cloud Grok 4.6 Extra High` check on `main`. Only then consider `DELIVERY_MERGE_ACTIVATION=true` on default-branch dispatch.
5. Hosted Sonar remains AR-45. Do not copy `cursor/enable-hosted-sonar-main-acd0`. Do not self-merge or deploy from this work.

## Activation order

Keep launch and merge activation off until all of the following happen, in order:

1. Independent review PASS of this orchestration at the exact head (`trusted-launch-job` receipt bound to authenticated agent/run/`startingRef` and `GET` `/actions/runs/{githubRunId}`). Coordinator dispatch JSON is not that proof.
2. Merge this trusted replacement onto the default branch so `independent-review-trusted.yml` exists for `workflow_run` and untrusted `claude-review.yml` is no longer Fable.
3. A human **explicitly re-enables** the appropriate Actions workflow after that merge. Workflow id `353522718` stays `disabled_manually` until then. Do not re-enable it while `main` still contains Fable.
4. Keep `CURSOR_REVIEW_LAUNCH` unset until a human observes the first explicit trusted default-branch `workflow_dispatch` launch (open same-repo ready PR, matching SHA, write/maintain/admin on both `github.actor` and `github.triggering_actor`). `workflow_run` must not mint agents.
5. Only after steps 1–4, consider requiring the review check and `DELIVERY_MERGE_ACTIVATION`.

## Checks

```sh
npm run test:delivery
npm run check
```

No local Mac Playwright or Sonar. Cloud and GitHub CI own desktop journeys and hosted scans. `verify.yml` uploads coverage from **macOS** (gating platform) for Sonar consumers.
