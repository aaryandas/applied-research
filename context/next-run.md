# Next-run workflow

The shape for the second gauntlet run, derived from the 2026-09-08 postmortem. The unit of work is a pull request against the integration branch. Linear status changes trigger machines. One coordinator merges and resolves ambiguity; nothing else is serialized on a person or a laptop.

## Roles

| Role               | Who                                                                                      | Owns                                                                                                                                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Implementer        | Codex (Sol for logic, Astra for visual) or Claude, in a Superset worktree or Codex cloud | One lane label, one branch, one PR. Runs `npm run check` and `npm run test:e2e` locally before opening the PR.                                                                                                                 |
| Cloud verifier     | Cursor cloud agent, triggered by Linear                                                  | Launches the frozen revision on its cloud desktop, walks the ticket's acceptance journey by hand, attaches its built-in screen recording, moves In Testing → In Review. Bugbot review. Autofix limited to formatting and lint. |
| Independent critic | `claude-review.yml` on the PR (pinned `claude-fable-5-1`), plus `@claude` on demand      | Standards and spec verdict as a PR comment. Never edits.                                                                                                                                                                       |
| Coordinator        | One Claude CLI session with visible transcripts                                          | Merge queue, conflict resolution, In Review → Done, decisions put in front of the founder within minutes.                                                                                                                      |
| Founder            | Aaryan                                                                                   | Decisions in the pinned decisions issue, fifteen-minute SLA during a run.                                                                                                                                                      |

No terminal-screen coordination. Nothing is dispatched by typing into another agent's input box; nothing is read from a screen to learn status. `SUPERSET_WORKER_DONE` envelopes are replaced by the PR.

## Lifecycle of a ticket

Every transition has a trigger. Nobody moves a ticket by hand except the founder, and only to cancel or reprioritize.

| From → To                   | Trigger                                              | Fired by                                                                                  |
| --------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Todo → In Development       | Draft PR opened on a branch named `…/ar-NN-…`        | Linear GitHub integration (team setting "PR opened")                                      |
| In Development → In Testing | PR marked ready for review                           | Linear GitHub integration (team setting "PR ready for review")                            |
| In Testing → In Review      | Cloud verifier's walk-through passes                 | Cursor automation on In Testing (moves back to In Development with the failing criterion) |
| In Review → Done            | PR merged                                            | Linear GitHub integration (team setting "PR merged")                                      |
| Merge                       | Ticket In Review + CI gate + Lane guard + Fable PASS | `Linear gate` required check reads the ticket state; the merge queue does the rest        |

Branch names come from Linear's "Copy git branch name" so the ticket id is in the branch (`aaryanmakesstuff/ar-17-reader-…`). The `Linear gate` check also links the PR on the ticket, so evidence never has to be attached by hand. After the verifier moves a ticket to In Review, re-run `Linear gate` from the PR's Checks tab (or push an empty commit); it re-evaluates on every PR event.

Blocked work gets a `Blocked:` paragraph plus a blocker relation, and a line in the decisions issue if the founder must answer.

## Lanes

`.github/lanes.json` maps every lane label to the paths it may change. The `Lane guard` check fails a PR that reaches outside its lane plus the shared allowlist (`context/`, markdown, `.github/`, `package.json`, `tests/e2e/`). Shared contract changes are their own `lane:contracts` PR, reviewed before consumers start. `lane:integration` is reserved for the coordinator.

## Gates on every PR

- `checks / CI gate`: `verify.yml` on macOS is blocking; Linux and Windows report only until they are in scope.
- `Lane guard`.
- `Linear gate`: the ticket is In Review. Needs the `LINEAR_API_KEY` repository secret (read plus attachment write).
- Independent review comment with PASS.
- Sonar: zero new violations on the diff. Run `npm run sonar:scan:native` from the PR worktree with `SONAR_HOST_URL=http://127.0.0.1:9000` and `SONAR_TOKEN` in the environment; the Docker scanner cannot reach the server from a second worktree. False positives are listed by issue key in the PR for the founder, never suppressed.
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

1. Merge the workflow branch. Store two repository secrets: `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` (the review action runs on the Claude subscription, not the API) and `LINEAR_API_KEY` (a Linear personal key) for the Linear gate. Create the `lane:<name>` labels. Set required checks on the integration branch to `checks / CI gate`, `Lane guard` and `Linear gate`. Enable the merge queue.
2. Linear, team AR settings: enable the GitHub integration and set its status automation to PR opened → In Development, PR ready for review → In Testing, PR merged → Done. Add the Cursor automation `status = In Testing → run Cursor cloud agent` with the verification prompt below. Configure that automation as: repository `aaryandas/applied-research`, **starting branch = `main`** (the integration branch since the consolidation), Linear MCP connected, computer use left on. Paste the prompt verbatim — Cursor will not fill `{{…}}` tokens. One In Testing transition at a time.
3. Cursor: enable Bugbot on the repository; restrict autofix to formatting and lint (no test, threshold, or Sonar config edits).
4. SonarQube: settle the quality-profile decisions listed in the day-zero Sonar ticket.
5. Build the walking skeleton on the integration branch and merge it. Only then dispatch lanes.

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
