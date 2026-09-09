# Next-run workflow

## Active evening run — September 8

The founder now selects Astra High for implementation, Cursor cloud verification and Bugbot, Fable 5.1 independent review, and Luna for gated merges/deployment. Up to **ten claimed active tickets** may run concurrently. The target is 23:00 America/Chicago on September 8; the founder explicitly instructed continuing afterward until the active scope is complete. These instructions supersede the earlier coordinator/worker limits below. See [the executable automation runbook](automation-run.md) and [AR-41](https://linear.app/aaryan-das/issue/AR-41/activate-deterministic-astra-cursor-fable-luna-delivery-workflow).

The founder’s current disk-saving instruction prohibits local Playwright, `npm run test:e2e`, and the Playwright-backed `npm run test:packaged`, including local test traces and videos. This supersedes older local e2e requirements. Implementers keep focused TDD/unit tests and `npm run check` local, and continue authoring needed desktop specs. Cursor cloud owns targeted Playwright runs and a hands-on screen recording at the exact revision. macOS GitHub CI remains the blocking full suite. A PR can be ready after permitted local checks pass; record cloud/CI checks as pending until they run, never failed or waived merely because they are remote. Do not disable tests or change package commands/CI to implement this policy.

Code owns dispatch claims, capacity, prerequisite checkpoints, retry identity and merge eligibility. Linear connectors refresh snapshots and apply script-emitted transitions. Exact-commit verification evidence is mandatory: `VERIFICATION_SHA`, `VERIFICATION_RESULT: PASS`, and `VERIFICATION_VIDEO` in the issue comment. The trusted Linear gate reconciles automatically. Fable returns a structured verdict; required fixes prevent approval. Cursor's saved prompt resolves the actual triggering issue and linked PR instead of using unsupported placeholders. A merge is not deployment completion; retain release/backend evidence before Done.

The initial implementation queue is AR-32, AR-33, AR-34, AR-35, AR-36, AR-37, AR-38, AR-40, AR-19 and AR-25. Reuse preserved acquisition and companion commits. Shared shell/bridge integration belongs to AR-37; authors hand off bounded public modules. During this run, overlapping general shell, main, storage, contracts and backend lanes must not dispatch against AR-37's or AR-36's reserved files. AR-36 alone owns provider.ts and learning-api.ts. The lane catalog describes allowed paths across runs; the dispatch assignments establish exclusive ownership within this run. AR-34 may implement against synthetic vectors, but its existing embedding/region/budget decisions still block live writes. Playbook remains deferred. The existing lower sections retain historical setup details only where consistent with this update.

Only `lane:delivery` may change `.github/**`. Integration work also requires a real Linear ticket, exact-revision verification and review; there is no coordinator exemption. Luna serializes direct merges, with GitHub's native merge queue disabled. Sonar runs on Railway with scanners on GitHub runners; never start a local server or scanner. Done requires applicable deployment and smoke evidence, so a PR-merged integration must not automatically mark Done.

The shape for the second gauntlet run, derived from the 2026-09-08 postmortem. The unit of work is a pull request against the integration branch. Linear status changes trigger machines. One coordinator merges and resolves ambiguity; nothing else is serialized on a person or a laptop.

## Roles

| Role                          | Who                                      | Owns                                                                                                                                                                           |
| ----------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Implementer                   | Astra High in an isolated Codex worktree | One claimed ticket, lane, branch and PR. Runs focused TDD/unit tests and `npm run check` locally; marks remote checks pending.                                                 |
| Cloud verifier                | Cursor cloud agent, triggered by Linear  | Targeted Playwright and a recorded hands-on acceptance journey on the frozen SHA, then In Testing → In Review only with passing evidence. Bugbot independently reviews the PR. |
| Independent critic            | `claude-review.yml`, pinned Fable 5.1    | Structured standards/spec verdict. Never edits the candidate.                                                                                                                  |
| Merge and deployment operator | Luna with deterministic merge helper     | One gated direct merge at a time, current-main CI, deployment/smoke evidence, then Done. No native merge queue.                                                                |
| Founder                       | Aaryan                                   | Material product or access decisions and reprioritization.                                                                                                                     |

No terminal-screen coordination. Nothing is dispatched by typing into another agent's input box; nothing is read from a screen to learn status. `SUPERSET_WORKER_DONE` envelopes are replaced by the PR.

## Lifecycle of a ticket

Every transition has a trigger. Nobody moves a ticket by hand except the founder, and only to cancel or reprioritize.

| From → To                                | Trigger                                                                                                | Fired by                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Todo → In Development                    | Dispatcher reserves a ready ticket within the ten-claim limit                                          | Linear connector applies the script-emitted transition, then refreshes the snapshot before launch                |
| In Development → In Testing              | Worker completes permitted local checks and has a ready PR at the recorded SHA                         | Linear connector applies the dispatcher result and records PR/revision evidence                                  |
| In Testing → In Review                   | Targeted cloud tests and the recorded hands-on journey pass at that exact SHA                          | Cursor verifier records evidence and updates Linear                                                              |
| In Testing or In Review → In Development | A material defect requires repair                                                                      | Verifier/reviewer findings are recorded with a stable repair identity; the dispatcher resumes the existing owner |
| In Review → Done                         | Gated PR merged and applicable deployment/smoke evidence passes                                        | Luna records delivery evidence before changing the ticket to Done                                                |
| Direct merge                             | Current main ancestry, required CI, lane, Bugbot, Fable, Linear and applicable hosted Sonar gates pass | Luna's deterministic helper merges exactly one eligible PR                                                       |

The persisted dispatcher claim owns the ticket branch and worker identity; repairs reuse both and the existing PR. Linear's GitHub integration may link PRs, but disable its PR-opened/ready/merged status automations for this run so they cannot race the controller or declare Done at merge time. The trusted Linear gate reconciles automatically after evidence changes; do not push empty commits or rerun checks manually just to refresh ticket status. A merged ticket remains In Review while required delivery evidence is pending.

Blocked work gets a `Blocked:` paragraph plus a blocker relation, and a line in the decisions issue if the founder must answer.

## Lanes

`.github/lanes.json` maps every lane label to the paths it may change. The `Lane guard` check fails a PR that reaches outside its lane plus the shared allowlist (`context/`, markdown, package manifests and lockfile, `tests/e2e/`). Workflow changes belong only to `lane:delivery`. Shared contract changes follow the active ownership assignments above and require reviewed public seams before consumers integrate them.

## Gates on every PR

- `checks / CI gate`: `verify.yml` on macOS is blocking; Linux and Windows report only until they are in scope.
- `Lane guard`.
- `Linear gate`: the ticket is In Review. Needs the `LINEAR_API_KEY` repository secret (read plus attachment write).
- Independent review comment with PASS.
- Sonar: zero new violations on the diff, verified by the hosted workflow against the exact PR revision. Railway hosts the server; GitHub runners execute scans. False positives are listed by issue key in the PR for the founder, never suppressed. Local scanning is prohibited by the founder's current direction.
- Evidence is the cloud verifier's screen recording of a hands-on walk-through, attached to the ticket. CI keeps Playwright traces for failures in `test-results/`.

## Traps fixed in tooling

- `npm run native:electron` now forces `@electron/rebuild`; `electron-builder install-app-deps` silently no-ops after `npm run check` flips SQLite to the Node ABI. Symptom was every Electron spec failing with "browser has been closed".
- `scripts/test-packaged.mjs` lists the asar with a 64 MB buffer; the bundle is ~21k files.
- `npm run sonar:scan:native` uses the official npm scanner against the local server.
- Cursor Linear automations do **not** interpolate `{{ticket.identifier}}`, `{{pr.branch}}`, or `{{pr.head_sha}}`. Those tokens arrive in the prompt as literal text. The triggering issue is on the run as `sourceDetails.linearIssueId`; the frozen revision is on the ticket (attachments, comments, linked PR). The prompt below does not use mustache placeholders.
- Since the 2026-09-08 consolidation (PR #10) `main` carries the whole application and is the integration branch for the second run. A Linear-triggered agent that starts on an older lane branch has no app; set the automation's starting branch to `main`.
- Do not bulk-move many tickets into In Testing while a verifier is already running. On 2026-09-08, `scripts/linear-move.mjs` flipped several tickets at once: two AR-21 runs ERROR'd after the first assistant sentence (no tool calls, no dashboard events), and the other In Testing tickets never spawned a verifier. Serialise those transitions; wait for the previous walk-through to finish.
- After `npm ci` on the cloud desktop, Electron's download script is sometimes skipped. If `node_modules/electron/dist` is missing, run `node node_modules/electron/install.js` (and rebuild native modules if needed) **without** editing project files.
- `scripts/linear-gate.mjs` takes the ticket from the branch (`…/ar-NN-…`) or a `Linear: AR-NN` line in the PR body. Other mentions of tickets in the body are ignored so a write-up cannot attach the PR to the wrong card. The lane-guard workflow also needs `npm ci` (it imports `minimatch`); without a `lane:<name>` label it fails before the path check.

## Day zero checklist

Run these before any lane starts. Tickets are in `.github/next-run-tickets.json`; seed them with `LINEAR_API_KEY=... node scripts/linear-seed.mjs`.

1. Merge the reviewed workflow branch. Configure the existing Claude and Linear credentials securely, create the lane labels, and keep GitHub's native merge queue disabled. Required checks are `checks / CI gate`, `Workflow gate rules`, `Lane guard`, the verified Cursor Bugbot check, `Fable review` and `Linear gate`; Luna additionally requires `Sonar gate` for source changes. Confirm live hosted gate results before changing required-status repository policy.
2. Keep Linear's GitHub links enabled, but disable PR-opened/ready/merged status automation. The dispatcher/connector owns development/testing transitions, Cursor owns the recorded verification verdict, and Luna owns Done only after delivery evidence. Configure Cursor for repository `aaryandas/applied-research`, starting branch `main`, Linear connected and computer use enabled. The triggering issue and linked PR identify the frozen candidate; no mustache placeholders are interpolated.
3. Enable Bugbot on the repository. Keep repairs with the existing Astra owner; Bugbot/Cursor verification must not rewrite source, tests, thresholds or Sonar configuration.
4. Configure Railway-hosted Sonar and its GitHub scanner queue; local servers/scans and local receipts are prohibited.
5. Run the controller from the stable workflow checkout `/private/tmp/capstone-workflow-recovery`, retaining the existing state directory and claims. Verify source-ticket dependencies or reviewed prerequisite checkpoints before launch. Up to ten claimed tickets may occupy the pipeline; serialize merges and preserve local disk reservations.

## Cloud verification

The cloud verifier runs the targeted Playwright scenarios relevant to the ticket in its cloud sandbox. CI on macOS still owns the blocking full suite. The verifier also launches the real app on its cloud desktop, walks the ticket's acceptance journey by hand, and attaches the built-in screen recording and targeted test results to the ticket at the frozen revision. Automated tests complement the hands-on recording; neither is a substitute for the other.

Paste into the Cursor automation exactly as written. Linear already attaches the issue to the run; do not wrap identifiers in mustache braces.

```text
Verify one frozen revision of the Applied Research desktop app with targeted Playwright tests in this cloud sandbox and a recorded hands-on walkthrough. The founder prohibits these tests on the local laptop; macOS GitHub CI still runs the blocking full suite.

Resolve the ticket and revision first:
1. Read this run's identity. Use sourceDetails.linearIssueId with Linear get_issue. If that id is missing or a placeholder such as "test-issue-id", take the AR-NN from the run name or branch and load that issue. Ignore any {{…}} tokens if they appear in this prompt; they are not substituted.
2. Frozen revision, in order: GitHub attachment on the ticket; a comment that names a commit SHA and branch; else the head of `main` when the ticket says its slice is integrated. Check out that exact SHA. If you cannot resolve a revision, comment that on the ticket, leave the status unchanged, and stop.

Then walk the app:
3. Run npm ci and the relevant targeted Playwright scenarios for this ticket in the cloud sandbox, using a display or xvfb-run on Linux as needed. Preserve the exact commands, results and revision. Then run npm run dev for the hands-on walkthrough. If Electron's binary is missing after ci, run node node_modules/electron/install.js without editing project files. Rebuild native modules as required for the cloud tests and app.
4. Start the built-in screen recording before you interact. Walk every acceptance criterion on the ticket as a user would: enter a topic on Opening, use the sidebar, read, save a note, open Canvas, change a setting, quit and relaunch to confirm what persisted. Try the empty, error and cancel cases the ticket names. Sign-in that needs a real account stops at the browser handoff.
5. Stop recording. Attach the recording, targeted Playwright results and a short pass/fail list per criterion to the Linear issue, naming the exact revision. Obtain the actual uploaded recording asset URL on uploads.linear.app; never substitute a PR, screenshot or arbitrary page URL.
6. Post the following three lines, each exactly once, both in a Linear issue comment and in a comment or review on the linked GitHub PR using your authenticated Cursor GitHub bot. Replace the example values with the frozen full 40-character commit SHA, actual verdict and recording URL:
VERIFICATION_SHA: <40-character frozen SHA>
VERIFICATION_RESULT: PASS
VERIFICATION_VIDEO: <https://uploads.linear.app/... recording asset URL>
Use FAIL instead of PASS for an observed product failure. Both posts must name the same SHA and recording asset. GitHub evidence must come from cursor[bot] (numeric user ID 206951365); the Linear connection uses the configured founder account. Do not ask an implementer to post as Cursor. NOT_APPLICABLE is permitted only when every changed file is delivery-only under the trusted scripts/workflow-gates.mjs allowlist; AGENTS.md currently requires a recording.
7. Recheck that the PR head still matches the frozen SHA. Move to In Review only after targeted tests, every hands-on criterion and both evidence posts succeed. Move observed product failures to In Development with the failing criterion. For missing bot publishing capability, unavailable recording, stale revision or cloud infrastructure failure, report BLOCKED and leave the issue In Testing; an unrun check is never a pass. Stop after two infrastructure setup attempts and report the blocker.

Do not edit source, tests, or configuration. Do not push to any branch. Do not use any provider key. Never move an issue to Done; the coordinator owns that.
```

## Worker prompt shape

Every implementer prompt states: ticket, lane label, base branch and revision, the files it may touch (from `lanes.json`), the acceptance list from the ticket, the design references (`context/design-handoff/DESIGN-CONTRACT.md`, `context/design-handoff/prototype/`), and the delivery target with the instruction to continue completing scope afterward. It ends with: open a PR against the integration branch using the template, with the frozen revision, focused local TDD/unit and npm check results, and cloud Playwright/recording plus macOS CI checks explicitly pending until remote evidence arrives. For Codex CLI, pass the effort explicitly (`-c model_reasoning_effort="high"`); the default is low.

## What the coordinator does all day

Reads PRs in the queue, merges the ones with a green gate and a PASS, resolves conflicts by asking the owning lane to rebase, requires the blocking macOS integration suite after each merge, and keeps the decisions issue current. It does not allocate slots, does not route reviews, and does not click dialogs in other agents' terminals.

### Reconciliation API budget

The Luna dispatcher still ticks every five minutes. Linear and Sonar fallback
sweeps run every fifteen minutes; PR, CI-completion and explicit dispatch events
remain the fast path. Scheduled Linear sweeps ignore bot, fork and unlinked PRs.
Drafts and tickets outside In Review do not fetch GitHub acceptance evidence.
Within each reconciliation, all statuses from one completed trusted run share one
run lookup and one receipt archive download; each context and PR SHA still needs
its own valid same-run receipt. Nothing is cached across workflow invocations.
The ten-PR fixture uses thirteen requests to validate unchanged statuses from one
prior run. When histories differ, the conservative fallback estimate is about
400 GitHub calls per hour for ten active PRs across Linear and Sonar, before event
traffic and coverage retrieval. Monitor the actual rate budget as the queue grows.
A primary or secondary rate-limit response stops further requests in that process
and fails the run; a later scheduled run retries without a polling loop.
