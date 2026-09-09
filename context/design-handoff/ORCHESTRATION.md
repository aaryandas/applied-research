# Delivery orchestration

Independent review is **Cursor Cloud Grok 4.6 Extra High** (`GET /v1/models` id `grok-4.6` with `effort=xhigh` and `fast=false`). There is no Fable invocation and no local or headless Cursor inference. Merge and deploy activation stay off until this protocol itself is independently reviewed. Hosted Sonar remains owned by AR-45 / `cursor/enable-hosted-sonar-main-acd0`; this page does not change `sonar.yml`.

PR [#21](https://github.com/aaryandas/applied-research/pull/21) (`codex/ar-41-delivery-workflow`) is the prior Astra/Fable/Luna stack. This orchestration **supersedes** its Fable critic, automatic Claude review, and merge-activation path. It does **not** import that branch's dispatcher, hosted-Sonar worker, or `pull_request_target` gate rewrite.

## Trust boundary

Repo settings, workflow YAML, prompts, and PR payloads are separate trust classes.

| Path                                                                                                     | Executable checkout                                   | `CURSOR_API_KEY`                                      | What it does                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/claude-review.yml` (`pull_request`)                                                   | PR head (tests only)                                  | **Never referenced**                                  | Runs `npm run test:delivery` and `node scripts/delivery-review.mjs untrusted`. Fails closed if a key is present. Does not evaluate agents.                                                                                        |
| `.github/workflows/independent-review-trusted.yml` (`workflow_run` / default-branch `workflow_dispatch`) | **Default branch only**, `persist-credentials: false` | GitHub Environment `trusted-cursor`                   | Resolves live PR number/SHA as data, scans PR workflow YAML for stolen secret references, authenticates to `https://api.cursor.com/v1/*`, posts the `Independent review / Cursor Cloud Grok 4.6 Extra High` check on the PR head. |
| `.github/workflows/delivery-queue.yml` `pull_request`                                                    | PR head                                               | No                                                    | Helper tests + untrusted notice. Does **not** load GitHub/Linear/`main`/checks.                                                                                                                                                   |
| `.github/workflows/delivery-queue.yml` default-branch `workflow_dispatch`                                | Default branch                                        | No Cursor key; uses `GITHUB_TOKEN` + `LINEAR_API_KEY` | Live exact-head eligibility under concurrency group `delivery-queue-live` (`cancel-in-progress: false`). Never merges.                                                                                                            |

`workflow_run` always executes the trusted workflow file from the default branch. `workflow_dispatch` is skipped unless `github.ref` is the default branch.

**Residual platform hole (not claimed closed):** a same-repo PR can add a _new_ `pull_request` workflow that references a **repository** secret. Until `CURSOR_API_KEY` lives only as an environment secret on `trusted-cursor` restricted to the default branch, and the repository secret is deleted, that hole remains. This PR's `pull_request` workflows do not receive the key. The trusted job also fails a PR that adds `secrets.CURSOR_API_KEY` to any workflow other than `independent-review-trusted.yml` (too late for a first-run steal if the repo secret still exists).

Until `independent-review-trusted.yml` exists on the default branch, `workflow_run` will not start this evaluator. Coordinator API launch remains the live critic path for this PR.

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
5. A **launch receipt** (`kind: cursor-cloud-independent-review-launch`) bound to authenticated `GET /v1/agents/{id}` and `GET /v1/agents/{id}/runs/{runId}`: `receipt.agentId === agent.id`, `receipt.runId === run.id`, `receipt.headSha === live head === agent.repos[0].startingRef`. Receipt `modelId`/`modelParams` record what the trusted launcher POSTed (or what a coordinator attests they POSTed). `verdict.model` is rejected. Undocumented GET model fields are ignored and fail closed if present so tests cannot stub them as proof.
6. `agent.env.type === 'cloud'` (missing type fails).
7. FINISHED run, standards PASS, spec PASS, no unresolved material findings, immutable `https://cursor.com/agents/bc-…` URL.

GitHub comments, `cursor[bot]` text, and marker strings are **not** proof. The trusted job posts a human comment and a check run; neither comment is authentication.

### Launch (opt-in, still off)

`CURSOR_REVIEW_LAUNCH` defaults unset/false. When a trusted job sets it to `true` after independent review of this orchestration:

- POST `/v1/agents` with `model.id=grok-4.6`, `params: [{id:"effort",value:"xhigh"},{id:"fast",value:"false"}]`, `env.type=cloud`, `repos[0].startingRef=<exact head SHA>`, `workOnCurrentBranch=false`, `autoCreatePR=false`, client-supplied `agentId` (UUID v5) and header `Idempotency-Key: independent-review:{repo}:{pr}:{sha}`.
- **Create body omits `repos[].prUrl`.** Documented `prUrl` ignores `startingRef` and bases `workOnCurrentBranch=false` on the PR **base**. PR URL is bound on the receipt and in the prompt. Evaluation fails if GET `startingRef` ≠ live head.
- 409 on the client-supplied id GETs the existing agent (bounded idempotent dispatch).

A coordinator-controlled receipt is accepted on default-branch `workflow_dispatch` input `launch_receipt_json` when it binds to those GET identities. That is coordinator attestation for model params (the platform GET does not return them), not a substitute for agent/run/SHA binding. If no receipt exists, the gate stays PENDING/FAIL and names that remaining requirement.

Documented API only: `https://api.cursor.com/v1/*` with Basic auth as in the [Cloud Agents API](https://cursor.com/docs/cloud-agent/api/endpoints).

## Serialized queue (implemented)

Helpers: `scripts/delivery-queue.mjs`.

Live evaluation is **only** `node scripts/delivery-queue.mjs evaluate` on default-branch `workflow_dispatch` with `TRUSTED_DEFAULT_BRANCH=true`. That job loads the live PR, default-branch SHA, `compare` ancestry, check runs, review threads, and Linear issue. It then runs `assessCandidate`. `DELIVERY_MERGE_ACTIVATION` defaults to false, so a fully eligible candidate still has `merge: false`. Cross-runner serialization is GitHub Actions concurrency group `delivery-queue-live`. Local `queue.lock` (`O_EXCL`) is same-filesystem only and is not the live lease.

`pull_request` jobs log `untrusted-notice` and do not fetch. Native merge queues / `merge_group` refs are refused.

## Acceptance recordings

Product PRs still need a nonempty MP4 from [linear-demo-record](../../.cursor/skills/linear-demo-record/SKILL.md) attached on the Linear ticket, bound to the exact head SHA, before In Review. Delivery-only PRs (no `src/`, `drizzle/`, or e2e/integration tests) are exempt from that MP4. Known **partial** recordings (AR-17/19/24) are not PASS; do not count them for this ticket.

## Deploy

`bindDeployment` ties a release request to the **exact resulting main SHA**. Failed main CI or hosted Sonar, or a `main` that is no longer that SHA, **halts**. `DELIVERY_DEPLOY_ACTIVATION` defaults to false.

## Current GitHub enforcement

`main` protection currently requires only `checks / CI gate` with strict/admin enforcement. This change does **not** add required review/queue checks, enable auto-merge, or alter branch protection.

## Setup (human / coordinator; not silently claimed done)

1. Create GitHub Environment `trusted-cursor`, restrict deployment branches to the default branch, put `CURSOR_API_KEY` there, **delete the repository secret** so `pull_request` workflows cannot inject it.
2. Repository variables (required for PASS): `IMPLEMENTER_AGENT_ID=bc-3fdd5333-ab18-489b-9451-d54173ecce33` (this PR's implementer), `VERIFIER_AGENT_ID=bc-ff6622d1-cb38-4688-8562-028b9761e3e0` (existing cloud verifier), `RECORDER_AGENT_ID` set to the recorder agent's `bc-` UUID when known.
3. Keep `CURSOR_REVIEW_LAUNCH` unset until this orchestration is independently reviewed.
4. After that PASS, decide whether to require the `Independent review / Cursor Cloud Grok 4.6 Extra High` check on `main`. Only then consider `DELIVERY_MERGE_ACTIVATION=true` on default-branch dispatch.
5. Hosted Sonar remains AR-45. Do not copy `cursor/enable-hosted-sonar-main-acd0`. Do not self-merge or deploy from this work.

## Checks

```sh
npm run test:delivery
npm run check
```

No local Mac Playwright or Sonar. Cloud and GitHub CI own desktop journeys and hosted scans. `verify.yml` uploads coverage from **macOS** (gating platform) for Sonar consumers.
