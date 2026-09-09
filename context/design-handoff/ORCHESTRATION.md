# Delivery orchestration

Latest founder direction (9 September 2026) overrides older Fable / local-headless Cursor / native merge-queue language in [next-run](../next-run.md) and [Superset orchestration](SUPERSET-ORCHESTRATION.md). Independent review is **Cursor Cloud Grok 4.6 Extra High**. There is no Fable invocation and no local or headless Cursor inference. Merge and deploy activation stay off until this protocol itself is independently reviewed. Hosted Sonar remains owned by AR-45 / `cursor/enable-hosted-sonar-main-acd0`; this page does not change `sonar.yml`.

PR [#21](https://github.com/aaryandas/applied-research/pull/21) (`codex/ar-41-delivery-workflow`) is the prior Astra/Fable/Luna stack. This orchestration **supersedes** its Fable critic, automatic Claude review, and merge-activation path. It does **not** import that branch's dispatcher, hosted-Sonar worker, or `pull_request_target` gate rewrite.

## Roles

| Role               | Who                                                    | Must not do                                                 |
| ------------------ | ------------------------------------------------------ | ----------------------------------------------------------- |
| Implementer        | Isolated lane PR author (Codex/Cursor/other)           | Review or record itself                                     |
| Cloud verifier     | Existing Cursor cloud walkthrough (frozen revision)    | Independent standards/spec verdict                          |
| Independent critic | Separate Cursor Cloud agent, model Grok 4.6 Extra High | Edit, push, merge, or verify the desktop journey            |
| Recorder           | `linear-demo-record` with the actual desktop recorder  | Independent review                                          |
| Coordinator        | Serialized queue helper                                | Force merge, lower gates, or treat merge refs as head proof |

## Independent review

Workflow: `.github/workflows/claude-review.yml` (filename kept so the old Fable workflow is replaced, not left running in parallel). Helpers: `scripts/delivery-review.mjs`.

1. Resolve the **exact PR head SHA** from GitHub (`pulls/{n}.head.sha`). `refs/pull/*/merge` and other synthetic refs are rejected.
2. If repository secret `CURSOR_API_KEY` is missing, the check **fails closed** as `PENDING` and names the setup dependency. It does not post a fake PASS.
3. If the key is present, retrieve `GET https://api.cursor.com/v1/models` and `GET https://api.cursor.com/v1/agents?prUrl=…`, then the agent, latest run, and artifacts. Only that authenticated payload is proof.
4. PASS requires all of: Cursor Cloud runtime, Grok 4.6 Extra High picker **and** runtime identity, role `independent-reviewer` distinct from implementer/verifier/recorder ids, exact-head SHA, `FINISHED` run, standards PASS, spec PASS, no unresolved material findings, and an immutable `https://cursor.com/agents/bc-…` link.
5. GitHub comments, `cursor[bot]` text, and marker strings (`VERIFICATION_RESULT: PASS`, `INDEPENDENT_REVIEW_PASS`) are **not** proof.
6. Launching a reviewer is opt-in (`CURSOR_REVIEW_LAUNCH=true`) after the secret exists. CI does not wait for a long cloud run; it stays pending until retrieval sees an exact-head PASS.

Documented API only: `https://api.cursor.com/v1/*` with Basic auth as in the [Cloud Agents API](https://cursor.com/docs/cloud-agent/api/endpoints). No guessed private endpoints.

## Serialized queue

Helpers: `scripts/delivery-queue.mjs`. Workflow: `.github/workflows/delivery-queue.yml`.

One candidate at a time (exclusive `queue.lock`). Immediately before any merge the tick rechecks:

- live PR head SHA
- current `main` ancestry (`main` is an ancestor of head; a moved `main` invalidates evidence)
- lane label and Linear ticket **In Review**
- resolved review conversations
- macOS `checks / CI gate`
- hosted Sonar at this SHA for application files (not waived; not run locally)
- independent review PASS at this SHA
- complete cloud acceptance evidence

Head or `main` changes invalidate affected evidence. `DELIVERY_MERGE_ACTIVATION` defaults to false. `pull_request` events never merge even if the variable is later set to `true`. Native merge queues / `merge_group` refs are refused.

## Acceptance recordings

Product PRs still need a nonempty MP4 from [linear-demo-record](../../.cursor/skills/linear-demo-record/SKILL.md) attached on the Linear ticket, bound to the exact head SHA, before In Review. Re-query In Testing per ticket. Do not move a ticket without the file.

Known **partial** recordings (preserve the files; they are not PASS):

- AR-17: insight save was disabled
- AR-24: lacked WebGL orbit / picking / Capture
- AR-19: showed only empty activity

A separate existing cloud verifier is correcting those tickets; do not duplicate that run.

## Deploy

`bindDeployment` ties a release request to the **exact resulting main SHA**. Failed main CI or hosted Sonar, or a `main` that is no longer that SHA, **halts**. `DELIVERY_DEPLOY_ACTIVATION` defaults to false.

After each actual merge or deploy, write a short retrospective (`captureRetrospective`): actual failure, cause, bounded process fix; keep activation off until that fix is reviewed.

## Current GitHub enforcement

`main` protection currently requires only `checks / CI gate` with strict/admin enforcement. There is no required human approval, ruleset merge queue, or native merge queue (`auto-merge` is false). Do not add required checks or enable auto-merge from this change. Build and review this orchestration first.

## Setup dependencies (not yet enabled automation)

1. Repository secret `CURSOR_API_KEY` from [Cursor API keys](https://cursor.com/dashboard/api).
2. Optional repository variables: `IMPLEMENTER_AGENT_ID`, `VERIFIER_AGENT_ID`, `RECORDER_AGENT_ID` (bc- UUIDs) so the critic cannot be those runs; `CURSOR_REVIEW_LAUNCH=true` only when spend for cloud review agents is intended.
3. After independent PASS of this PR, decide whether to require the `Independent review / Cursor Cloud Grok 4.6 Extra High` check on `main`.
4. Only then consider `DELIVERY_MERGE_ACTIVATION=true` on workflow_dispatch, still one candidate at a time.
5. Hosted Sonar remains AR-45. Do not copy `cursor/enable-hosted-sonar-main-acd0`.
6. Do not self-merge or deploy from this work.

## Checks

```sh
npm run test:delivery
npm run check
```

No local Mac Playwright or Sonar. Cloud and GitHub CI own desktop journeys and hosted scans.
