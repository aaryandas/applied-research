# September 8 delivery automation

AR-41 owns the deterministic dispatcher. The founder selected Astra High implementation with TDD, Cursor cloud verification and Bugbot, Fable 5.1 review, and Luna merge/deployment operations. Up to ten tickets may occupy the pipeline. 11 p.m. Chicago time is the delivery target, not a stop condition: the founder explicitly requested continued completion afterward.

## Local dispatcher

Run with Node 24. The bundled runtime is `/Users/aaryan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`; its directory is prepended to worker PATH. `codex exec --json` uses the existing ChatGPT login and emits the actual task identifier as `thread.started`. Workers use `gpt-6-astra` with `model_reasoning_effort="high"` and automatic approval review. The shared daemon's experimental control proxy did not answer the JSONL initialization probe; this runner uses the verified CLI interface instead. It neither enables remote control nor requires an API key.

```sh
node scripts/dispatch.mjs health
node scripts/dispatch.mjs plan --snapshot /private/tmp/capstone-dispatch-20260908/linear-snapshot.json
node scripts/dispatch.mjs tick --snapshot /private/tmp/capstone-dispatch-20260908/linear-snapshot.json
node --test scripts/dispatch-plan.test.mjs
```

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
- Capture the worker task ID, exit state, linked PR and current GitHub head SHA. Emit In Development → In Testing only after the worker exits successfully and its ticket's non-draft PR exists. Required CI, Sonar, Cursor evidence and Fable review independently decide merge eligibility.
- A returned defect sets `repairRequest: {"id":"stable-unique-finding-id","text":"specific required fix and evidence"}` on a fresh snapshot. The dispatcher resumes the same Codex task, branch and PR, at most three repair rounds. Repeated delivery of the same finding does not launch another repair. Preserve the request until the corresponding completed repair has moved to testing, then clear it.
- Infrastructure failures, missing PRs, interrupted launches and vanished workers emit `attention`; they do not duplicate work or declare completion. Inspect the job receipt and private log before retrying an ambiguous launch. The automation must notify on these actionable failures.
- A tick lock prevents simultaneous claim allocation. If a tick dies, inspect `tick.lock/owner.json` and verify that process is gone before removing the stale lock. Never delete claims as a retry mechanism.

The dispatcher emits exact `{type: "transition", identifier, issueId, from, to, prUrl?, headSha?, threadId?}` records. The connector controller applies them idempotently, verifies current source status, and records the exact revision and PR in Linear. Cursor continues to own the verification verdict and attached recording. Luna must use enforced merge gates and record deployment evidence; a local worker's successful exit never authorizes merging by itself.

## Verification and limits

Focused Node tests cover pipeline capacity, persisted claim accounting, deterministic ordering, unknown/unmet prerequisites, reviewed checkpoints, stale snapshots, historical statuses, continuing after the target time, repeated real claim ticks, clone eligibility, installation reservations, and an actual APFS copy showing independent writes. The authenticated CLI smoke test returned `READY` using Astra High and emitted task ID `01a08394-302d-76f3-90b5-595811414e75` on September 8. Health inspection verified Codex CLI 0.153.4, Node 24.19.0, GitHub access and ChatGPT login. Full repository checks remain required for AR-41; this smoke test is only transport evidence.
