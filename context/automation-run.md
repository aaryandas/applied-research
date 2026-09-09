# September 8 delivery automation

AR-41 owns the deterministic dispatcher. The founder selected Astra High implementation with TDD, Cursor cloud verification and Bugbot, Fable 5.1 review, and Luna merge/deployment operations. Up to ten tickets may occupy the pipeline. 11 p.m. Chicago time is the delivery target, not a stop condition: the founder explicitly requested continued completion afterward.

The founder’s current disk-saving instruction places all Playwright execution in Cursor cloud and GitHub CI. Local workers run focused TDD/unit tests and `npm run check`; they must not run Playwright, `npm run test:e2e`, or Playwright-backed `npm run test:packaged`, or create local test traces/videos. This supersedes earlier local desktop-test requirements. Workers still author the needed tests and may mark a PR ready after permitted local checks pass, recording remote checks as pending rather than failed or waived. Cursor runs targeted Playwright scenarios and a recorded hands-on walkthrough at the frozen SHA. The full macOS GitHub CI suite remains blocking; package commands, tests and gates stay enabled.

## Local dispatcher

Run with Node 24. The bundled runtime is `/Users/aaryan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`; its directory is prepended to worker PATH. `codex exec --json` uses the existing ChatGPT login and emits the actual task identifier as `thread.started`. Workers use `gpt-6-astra` with `model_reasoning_effort="high"` and automatic approval review. The shared daemon's experimental control proxy did not answer the JSONL initialization probe; this runner uses the verified CLI interface instead. It neither enables remote control nor requires an API key.

Operate from the stable workflow checkout `/private/tmp/capstone-workflow-recovery` on `codex/ar-41-delivery-workflow`. The shared source checkout may be on a separate CI repair branch and must not be used as the controller script location. The dispatcher resolves its worker executable and lane catalog relative to its own module, not the shell's working directory. Use the absolute script path below and preserve the same state/snapshot arguments when updating automations. `health` reports `workflowRoot` for verification. Existing worker jobs continue using their recorded worktrees; do not recreate claims when changing controller location.

```sh
node /private/tmp/capstone-workflow-recovery/scripts/dispatch.mjs health
node /private/tmp/capstone-workflow-recovery/scripts/dispatch.mjs plan --state-dir /private/tmp/capstone-dispatch-20260908 --snapshot /private/tmp/capstone-dispatch-20260908/linear-snapshot.json
node /private/tmp/capstone-workflow-recovery/scripts/dispatch.mjs tick --state-dir /private/tmp/capstone-dispatch-20260908 --snapshot /private/tmp/capstone-dispatch-20260908/linear-snapshot.json
node --test /private/tmp/capstone-workflow-recovery/scripts/dispatch-plan.test.mjs
```

Use the Node 24 executable named above or put its directory first on PATH. The recovery checkout need not install its own dependencies: dispatcher modules use Node built-ins. If a new worker cannot be seeded from a complete matching local installation, the normal per-worker installation reservation applies; do not run `npm ci` just to bootstrap the controller.

The state directory defaults to `/private/tmp/capstone-dispatch-20260908`, outside Git. It holds mode-600 claims, private worker events, and isolated Git worktrees. Keep it until delivery and review complete. Nothing automatically deletes branches or worktrees. Do not commit private snapshots or logs. Temporary storage survives agent turns, but is not a long-term backup.

The snapshot bridge uses the authenticated Linear connector, avoiding extraction or duplication of its credentials. A controller refreshes the snapshot, executes a tick, applies only its emitted Linear transitions, refreshes again, and executes another tick. The application automation is the scheduler only; it must not choose different tickets, invent readiness, or bypass emitted blockers. No recurring service is installed by these scripts.

## Snapshot contract

Supply actual latest Linear records and all dependency records. `generatedAt` must describe when Linear was read, not merely when an old file was rewritten. Snapshots older than five minutes fail closed.

```json
{
  "generatedAt": "2026-09-09T00:40:00Z",
  "issues": [
    {
      "id": "linear-uuid",
      "identifier": "AR-32",
      "title": "Implement the adapter",
      "description": "Acceptance criteria and current scoped ownership",
      "status": "Todo",
      "priority": 1,
      "createdAt": "2026-09-08T18:02:59.667Z",
      "labels": ["Reader"],
      "blockedBy": ["AR-30"],
      "lane": "lane:semantic-scholar",
      "activeRun": false,
      "prerequisiteCheckpoints": [
        {
          "identifier": "AR-30",
          "revision": "abcdef1",
          "evidence": "Replace this example with the real reviewed contract evidence."
        }
      ],
      "preexistingCode": "Existing reviewed branch/commits to inspect and recover",
      "repairRequest": null
    }
  ]
}
```

`normalizeIssue` exported from `scripts/dispatch-plan.mjs` accepts connected Linear records (including `uuid`, `priority.value`, `relations.blockedBy`) and the private queue's `assignment.lane` and `assignment.scope`. The scope is appended as the current ownership instruction, superseding earlier owner/model text. Call it while producing the snapshot; a raw list is not itself a snapshot.

Unfinished prerequisite tickets ordinarily block dispatch. A specific reviewed prerequisite checkpoint may release implementation against its stable contract without claiming the entire prerequisite is Done. Every such checkpoint names the prerequisite, an actual revision and the approval/review evidence. A bare readiness boolean is insufficient. Completion/deployment still require the downstream acceptance gates.

## Deterministic behavior

- Sort ready Todo issues by priority (unprioritized last), creation time, then ticket number. Require a description and known lane; skip Epic, Playbook and Deferred labels.
- Reserve a persistent claim before emitting Todo → In Development. Launch only after the next fresh snapshot confirms In Development. Repeated ticks reuse the claim and worker job receipt.
- Count all outstanding dispatcher claims across development, testing and review toward ten. Mark a preexisting live run or open-PR pipeline issue `activeRun: true` to count it too. Historical status alone does not imply an active worker; reconcile historical integrated tickets separately.
- Create one `codex/ar-NN-20260908` branch and isolated worktree from fetched `origin/main`. Pass the exact revision, expanded allowed paths and preexisting implementation into the worker prompt.
- Seed each fresh worktree from the complete root `node_modules` only when lockfiles match, both directories are on the same filesystem, and the filesystem is APFS. macOS `cp -cR` requests `clonefile`; subsequent writes are private to each copy, including native rebuilds. Record the lock SHA-256 and seeding receipt. This is not a symlink or mutable shared installation. Workers reuse the copy unless manifests/locks changed or dependencies are missing. A failed clone removes only its newly created partial destination. Unseeded concurrent workers each reserve 1 GB above a 2 GB free-space floor; delay launches when reservations cannot fit. APFS copies still need free space for subsequent writes.
- Capture the worker task ID, exit state, linked PR and current GitHub head SHA. Emit In Development → In Testing only after the worker exits successfully and its ticket's non-draft PR exists. Required CI, hosted Sonar, Cursor evidence and Fable review independently decide merge eligibility. Workers must not run local Sonar scans or start a local server; local scan receipts do not authorize a merge.
- A returned defect sets `repairRequest: {"id":"stable-unique-finding-id","text":"specific required fix and evidence"}` on a fresh snapshot. The dispatcher resumes the same Codex task, branch and PR, at most three repair rounds. Repeated delivery of the same finding does not launch another repair. Preserve the request until the corresponding completed repair has moved to testing, then clear it.
- A crash after writing a worker job but before saving its claim pointer is recovered from that round’s existing job receipt before disk/seeding checks. The dispatcher saves the recovered pointer and inspects the existing job; it does not launch a duplicate worker. An ambiguous pending launch emits attention.
- Infrastructure failures, missing PRs, interrupted launches and vanished workers emit `attention`; they do not duplicate work or declare completion. Inspect the job receipt and private log before retrying an ambiguous launch. The automation must notify on these actionable failures.
- A tick lock prevents simultaneous claim allocation. If a tick dies, inspect `tick.lock/owner.json` and verify that process is gone before removing the stale lock. Never delete claims as a retry mechanism.

The dispatcher emits exact `{type: "transition", identifier, issueId, from, to, prUrl?, headSha?, threadId?}` records. The connector controller applies them idempotently, verifies current source status, and records the exact revision and PR in Linear. Cursor continues to own targeted cloud Playwright execution, the verification verdict and the attached hands-on recording. Luna must use enforced merge gates and record deployment evidence; a local worker's successful exit never authorizes merging by itself.

Luna uses direct serialized merges. After each merge, wait for the current main CI outcome. In the merge helper's existing creation-time order, select only the first stale PR whose other current-head gates pass for branch maintenance. Resume its existing owner to rebase the same branch and rerun permitted local checks, with renewed cloud/CI checks pending; preserve all other branches. Record a maintenance request keyed by PR and main SHA separately from product-defect `repairRequest`, so rebasing does not consume defect repair rounds. Do not repeat a request while that owner is active. Any new head needs renewed Cursor recording and all exact-head gates before merging. Use the same one-at-a-time refresh after the bootstrap merge to acquire the macOS coverage workflow. A failed main CI run emits attention and permits a scoped repair PR, without claiming release success.

Luna independently validates each PR's label and changed paths against `.github/lanes.json` fetched at the exact live-main SHA. Both old and new paths of renamed files count. The PR's own lane check/configuration cannot authorize files that the trusted policy refuses.

The dependency-free controller uses Node24 `path.matchesGlob`, while the advisory PR lane check uses the installed minimatch with `dot: true`. The controller deliberately fails closed for hidden paths that the advisory matcher permits; such a PR needs an explicit trusted lane pattern before merging. Do not infer merge eligibility solely from the advisory check. A gate status `error` is reported as infrastructure trouble, distinct from a product `failure`.

After a release request, later ticks observe its original requested SHA, pin the matching release run ID and report installer and GitHub deployment outcomes separately. When plan emits `release-observation`, run the helper with `--apply` to persist that observation; this does not merge or request another release. Unchanged observations allow normal candidate selection on later ticks. Successful installer creation does not prove a deployment: absent deployment evidence stays pending and never permits Done by itself.

Cursor's Linear connection posts as the founder's account, so its author identity alone cannot distinguish verification from an implementer comment. The Linear gate requires configured `CURSOR_LINEAR_USER_ID` (`889a33ac-cedf-4e7e-b62c-813c5557b6da`) plus a matching PR comment or review from the independently authenticated Cursor GitHub bot (`cursor[bot]`, numeric ID `206951365`). Cursor posts the same single SHA, PASS and VIDEO lines in both systems before In Review. The recording must be an actual uploaded Linear asset on `uploads.linear.app`; signatures may renew but the asset path must match. Missing bot publishing capability is a verification blocker, never permission for an implementer to impersonate it. Delivery-only N/A evidence requires the same identity checks. These identities were verified from AR-40's actual Linear comment and GitHub review; the non-secret Linear identity repository variable is configured.

## Verification and limits

Focused Node tests cover pipeline capacity, persisted claim accounting, deterministic ordering, unknown/unmet prerequisites, reviewed checkpoints, stale snapshots, historical statuses, continuing after the target time, repeated real claim ticks, clone eligibility, installation reservations, and an actual APFS copy showing independent writes. The authenticated CLI smoke test returned `READY` using Astra High and emitted task ID `01a08394-302d-76f3-90b5-595811414e75` on September 8. Health inspection verified Codex CLI 0.153.4, Node 24.19.0, GitHub access and ChatGPT login. Full repository checks remain required for AR-41; this smoke test is only transport evidence.

## Hosted Sonar gate

The founder replaced local Sonar with Railway hosting. `.github/workflows/sonar.yml` selects one human source PR whose current revision has successful CI and coverage, scans it on a GitHub runner, and records the remote server's task, analysis ID, quality gate, revision and findings as an artifact. The candidate checkout is data only: no candidate package scripts, hooks or tests execute with Sonar credentials.

Community Build remains a single-project, serialized full analysis. It does not provide native PR or branch analysis. Each candidate temporarily becomes that project's current analysis; the workflow checks zero unresolved findings on the actual changed source lines and requires the server quality gate to pass, then publishes `Sonar gate` on the exact SHA. This immutable GitHub result survives the next candidate replacing the server's current view. Missing patches, stale heads, incomplete server results and unreviewed hotspots fail closed. CI still owns the full test/coverage thresholds.

GitHub can omit or truncate a file patch for large changes or binaries. The current hosted helper refuses those inventories rather than guessing changed lines; automatic or manual retry of unchanged input cannot repair that limitation. Report this as a changed-line inventory blocker requiring a supported full-diff path or a reviewable PR split, not as a transient server outage. Do not mark Sonar passed without the complete changed-line evidence.

Set non-secret repository variables `SONAR_ENABLED=true`, `SONAR_HOST_URL` to the HTTPS Railway endpoint and `SONAR_PROJECT_KEY=applied-research-hosted`; store `SONAR_TOKEN` only in the GitHub secret. The workflow uses a single concurrency group and a five-minute reconciliation schedule so coalesced CI events do not strand a candidate. Infrastructure retries stop after two attempts at the same SHA; product failures wait for a fix. An explicit workflow dispatch with `pr_number` retries a reviewed exception or infrastructure failure. Luna accepts only the GitHub Actions-published exact-head hosted status for source changes, never a local receipt. Require the remote status in repository policy only after a real hosted run confirms it.
