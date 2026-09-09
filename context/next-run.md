# Next-run workflow

**9 September 2026 founder override:** independent review is Cursor Cloud Grok 4.6 Extra High. Do not invoke Fable or local/headless Cursor inference. Merge/deploy activation stays off until the orchestration in [ORCHESTRATION.md](design-handoff/ORCHESTRATION.md) is reviewed. Hosted Sonar and macOS `checks / CI gate` stay in force; do not edit the AR-45 Sonar worker branch.

The shape for the second gauntlet run, derived from the 2026-09-08 postmortem. The unit of work is a pull request against the integration branch. Linear status changes trigger machines. One coordinator merges and resolves ambiguity; nothing else is serialized on a person or a laptop.

## Roles

| Role               | Who                                                                                                                                                                                     | Owns                                                                                                                                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Implementer        | Codex (Sol for logic, Astra for visual) or Claude, in a Superset worktree or Codex cloud                                                                                                | One lane label, one branch, one PR. Runs `npm run check` and `npm run test:e2e` locally before opening the PR.                                                                                                                 |
| Cloud verifier     | Cursor cloud agent, triggered by Linear                                                                                                                                                 | Launches the frozen revision on its cloud desktop, walks the ticket's acceptance journey by hand, attaches its built-in screen recording, moves In Testing → In Review. Bugbot review. Autofix limited to formatting and lint. |
| Independent critic | Cursor Cloud Grok 4.6 Extra High via default-branch `.github/workflows/independent-review-trusted.yml` (replaces Fable). Untrusted `claude-review.yml` never receives `CURSOR_API_KEY`. | Standards/spec verdict from authenticated Cloud Agents API + launch receipt bound to agentId/runId/`startingRef`. Never edits.                                                                                                 |
| Coordinator        | Default-branch `delivery-queue.yml` dispatch (merge activation off)                                                                                                                     | Live GitHub/Linear/`main`/check recheck under `delivery-queue-live` concurrency; must not force merge or treat merge refs as head proof.                                                                                       |
| Founder            | Aaryan                                                                                                                                                                                  | Decisions in the pinned decisions issue, fifteen-minute SLA during a run.                                                                                                                                                      |

No terminal-screen coordination. Nothing is dispatched by typing into another agent's input box; nothing is read from a screen to learn status. `SUPERSET_WORKER_DONE` envelopes are replaced by the PR.

## Lifecycle of a ticket

Every transition has a trigger. Nobody moves a ticket by hand except the founder, and only to cancel or reprioritize.

| From → To                   | Trigger                                                                                                  | Fired by                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Todo → In Development       | Draft PR opened on a branch named `…/ar-NN-…`                                                            | Linear GitHub integration (team setting "PR opened")                                      |
| In Development → In Testing | PR marked ready for review                                                                               | Linear GitHub integration (team setting "PR ready for review")                            |
| In Testing → In Review      | Cloud verifier's walk-through passes                                                                     | Cursor automation on In Testing (moves back to In Development with the failing criterion) |
| In Review → Done            | PR merged                                                                                                | Linear GitHub integration (team setting "PR merged")                                      |
| Merge                       | Ticket In Review + macOS CI gate + lane + independent Cloud PASS; hosted Sonar on exact main after merge | `delivery-queue.mjs` evaluates one candidate; merge activation remains off                |

That GitHub→Linear status automation is a **team setting**, not something this repository's workflows perform. **Observed gap:** GitHub PRs [#45](https://github.com/aaryandas/applied-research/pull/45) (AR-52) and [#46](https://github.com/aaryandas/applied-research/pull/46) (AR-53) opened as drafts against the walkthrough candidate with the PR URL attached, but both Linear issues **remained Backlog** (`startedAt` null) after those PRs existed. Owned `assessCandidate` / `linear-gate.mjs` mapping is: open draft → expected In Development; open ready → expected In Testing; merge eligibility still **In Review** only. Backlog with an open PR is reported as that automation gap. Those helpers do **not** treat Backlog (or In Development / In Testing) as In Review and do **not** move Linear status.

Branch names come from Linear's "Copy git branch name" so the ticket id is in the branch (`aaryanmakesstuff/ar-17-reader-…`). The `Linear gate` check also links the PR on the ticket, so evidence never has to be attached by hand. After the verifier moves a ticket to In Review, re-run `Linear gate` from the PR's Checks tab (or push an empty commit); it re-evaluates on every PR event.

Blocked work gets a `Blocked:` paragraph plus a blocker relation, and a line in the decisions issue if the founder must answer.

## Lanes

`.github/lanes.json` maps every lane label to the paths it may change. The `Lane guard` check fails a PR that reaches outside its lane plus the shared allowlist (`context/`, markdown, `.github/`, `package.json`, `tests/e2e/`). Shared contract changes are their own `lane:contracts` PR, reviewed before consumers start. `lane:integration` is reserved for the coordinator.

## Gates on every PR

- `checks / CI gate`: `verify.yml` on macOS is blocking; Linux and Windows report only until they are in scope.
- `Lane guard`.
- `Linear gate`: the ticket is In Review. Needs the `LINEAR_API_KEY` repository secret (read plus attachment write).
- Independent Cursor Cloud Grok 4.6 Extra High review at the exact head, fail-closed until authentic PASS. See [orchestration](design-handoff/ORCHESTRATION.md).
- Hosted Sonar: **post-merge** on the exact resulting `main` SHA (AR-45 / `cursor/enable-hosted-sonar-main-acd0`). PR code receives no Sonar secrets. Pre-merge app eligibility is independent source review at the exact head, not a PR-head Sonar check. Do not run Sonar on a local Mac or waive introduced-material findings. False positives are listed by issue key for the founder, never suppressed.
- Evidence is the cloud verifier's screen recording of a hands-on walk-through, attached to the ticket, bound to the exact revision. Existing AR-17/AR-19/AR-24 recordings are partial proof. CI keeps Playwright traces for failures in `test-results/`.
- Expected Linear In Development (draft PR) and nonblocking Windows Verify coverage failures are **not** coding-agent autofix work. `scripts/delivery-ci-classify.mjs` and Linear gate classification stay green for those cases; `checks / CI gate` on the live PR head is the blocking CI signal. Do not autofix superseded SHAs.

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

1. Merge the reviewed orchestration branch after independent PASS. Store `LINEAR_API_KEY` for the Linear gate. `CURSOR_API_KEY` already lives on existing GitHub Environment `trusted-main` (deployment branch policy: type=`branch`, name=`main`); the repository-level secret was removed after that protected copy was verified. Do not create a new secret or environment. Set `IMPLEMENTER_AGENT_ID`, `VERIFIER_AGENT_ID`, and `RECORDER_AGENT_ID`. Keep `CURSOR_REVIEW_LAUNCH` unset until this orchestration is independently reviewed. After merge, a human must **explicitly re-enable** the appropriate Actions workflow; workflow id `353522718` (`.github/workflows/claude-review.yml`, Actions name `Independent review (Claude)`) stays `disabled_manually` until then. Create the `lane:<name>` labels. Current `main` protection requires only `checks / CI gate`; do not add required review/queue checks or enable auto-merge until then.
2. Linear, team AR settings: enable the GitHub integration and set its status automation to PR opened → In Development, PR ready for review → In Testing, PR merged → Done. That automation did not fire for PR #45 / AR-52 or PR #46 / AR-53 (tickets stayed Backlog despite linked draft PRs); repair the team setting rather than treating Backlog as In Review. Add the Cursor automation `status = In Testing → run Cursor cloud agent` with the verification prompt below. Configure that automation as: repository `aaryandas/applied-research`, **starting branch = `main`**, Linear MCP connected, computer use left on. Paste the prompt verbatim — Cursor will not fill `{{…}}` tokens. One In Testing transition at a time. Demos use `.cursor/skills/linear-demo-record/SKILL.md` with a nonempty MP4.
3. Cursor: enable Bugbot on the repository; restrict autofix to formatting and lint (no test, threshold, or Sonar config edits). Independent standards/spec review is a **separate** Cloud Grok 4.6 Extra High agent, not Bugbot and not the verifier.
4. Hosted Sonar: leave AR-45 / `cursor/enable-hosted-sonar-main-acd0` as the scan owner. Do not run Sonar on a local Mac.
5. Keep `DELIVERY_MERGE_ACTIVATION` and `DELIVERY_DEPLOY_ACTIVATION` unset/false until a reviewed PASS of this orchestration.

Local concurrency: at most three implementers on the laptop. Close a Superset terminal the moment its PR is open. Stop SonarQube (`npm run sonar:stop`) when no scan is queued.

## Cloud verification

The cloud verifier does not run Playwright. CI on macOS owns the automated suite. The verifier launches the real app on its cloud desktop, walks the ticket's acceptance journey by hand, and its built-in screen recording is the evidence attached to the ticket.

Paste into the Cursor automation exactly as written. Linear already attaches the issue to the run; do not wrap identifiers in mustache braces.

```text
You verify one frozen revision of the Applied Research desktop app by using it, not by running its test suite.

Resolve the ticket and revision first:
1. Read this run's identity. Use sourceDetails.linearIssueId with Linear get_issue. If that id is missing or a placeholder such as "test-issue-id", take the AR-NN from the run name or branch and load that issue. Ignore any {{…}} tokens if they appear in this prompt; they are not substituted.
2. Frozen revision, in order: GitHub attachment on the ticket; a comment that names a commit SHA and branch; else the head of `main` when the ticket says its slice is integrated. Check out that exact SHA. If you cannot resolve a revision, comment that on the ticket, leave the status unchanged, and stop.

Then walk the app:
3. npm ci, then npm run dev. If Electron's binary is missing after ci, run node node_modules/electron/install.js without editing project files. Rebuild native modules the same way if the window fails to start.
4. Start the built-in screen recording before you interact. Walk every acceptance criterion on the ticket as a user would: enter a topic on Opening, use the sidebar, read, save a note, open Canvas, change a setting, quit and relaunch to confirm what persisted. Try the empty, error and cancel cases the ticket names. Sign-in that needs a real account stops at the browser handoff.
5. Stop recording. Attach the recording and a short pass/fail list per criterion to the Linear issue, naming the exact revision.
6. If every criterion passes, move the issue to In Review. Otherwise move it to In Development with the failing criterion and what you saw.

Do not edit source, tests, or configuration. Do not push to any branch. Do not use any provider key. Never move an issue to Done; the coordinator owns that.
```

## Worker prompt shape

Every implementer prompt states: ticket, lane label, base branch and revision, the files it may touch (from `lanes.json`), the acceptance list from the ticket, the design references (`context/design-handoff/DESIGN-CONTRACT.md`, `context/design-handoff/prototype/`), and the hard time box. It ends with: open a PR against the integration branch using the template, with the frozen revision and your local check and e2e results filled in. For Codex CLI, pass the effort explicitly (`-c model_reasoning_effort="high"`); the default is low.

## What the coordinator does all day

Reads PRs in the queue, merges the ones with a green gate and a PASS, resolves conflicts by asking the owning lane to rebase, reruns the integration e2e after each merge, and keeps the decisions issue current. It does not allocate slots, does not route reviews, and does not click dialogs in other agents' terminals.
