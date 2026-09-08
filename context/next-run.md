# Next-run workflow

The shape for the second gauntlet run, derived from the 2026-09-08 postmortem. The unit of work is a pull request against the integration branch. Linear status changes trigger machines. One coordinator merges and resolves ambiguity; nothing else is serialized on a person or a laptop.

## Roles

| Role               | Who                                                                                      | Owns                                                                                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Implementer        | Codex (Sol for logic, Astra for visual) or Claude, in a Superset worktree or Codex cloud | One lane label, one branch, one PR. Runs `npm run check` and `npm run test:e2e` locally before opening the PR.                                                                 |
| Cloud verifier     | Cursor cloud agent, triggered by Linear                                                  | Runs the Electron suite on the frozen revision, records video, attaches it to the ticket, moves In Testing → In Review. Bugbot review. Autofix limited to formatting and lint. |
| Independent critic | `claude-review.yml` on the PR (pinned `claude-fable-5-1`), plus `@claude` on demand      | Standards and spec verdict as a PR comment. Never edits.                                                                                                                       |
| Coordinator        | One Claude CLI session with visible transcripts                                          | Merge queue, conflict resolution, In Review → Done, decisions put in front of the founder within minutes.                                                                      |
| Founder            | Aaryan                                                                                   | Decisions in the pinned decisions issue, fifteen-minute SLA during a run.                                                                                                      |

No terminal-screen coordination. Nothing is dispatched by typing into another agent's input box; nothing is read from a screen to learn status. `SUPERSET_WORKER_DONE` envelopes are replaced by the PR.

## Lifecycle of a ticket

1. **Todo → In Development** when the implementer opens a draft PR labeled `lane:<name>` (Linear GitHub integration flips it).
2. **In Development → In Testing** when the implementer marks the PR ready. The PR body carries the frozen revision, the local check and e2e results, and the Sonar delta.
3. **In Testing → In Review** by the cloud verifier after it attaches the video and Bugbot results. Failures go back to In Development with the failing spec named.
4. **In Review → Done** by the coordinator after the independent critic's PASS and a green merge-queue run.

Blocked work gets a `Blocked:` paragraph plus a blocker relation, as before, and a line in the decisions issue if the founder must answer.

## Lanes

`.github/lanes.json` maps every lane label to the paths it may change. The `Lane guard` check fails a PR that reaches outside its lane plus the shared allowlist (`context/`, markdown, `.github/`, `package.json`, `tests/e2e/`). Shared contract changes are their own `lane:contracts` PR, reviewed before consumers start. `lane:integration` is reserved for the coordinator.

## Gates on every PR

- `checks / CI gate`: `verify.yml` on macOS is blocking; Linux and Windows report only until they are in scope.
- `Lane guard`.
- Independent review comment with PASS.
- Sonar: zero new violations on the diff. Run `npm run sonar:scan:native` from the PR worktree with `SONAR_HOST_URL=http://127.0.0.1:9000` and `SONAR_TOKEN` in the environment; the Docker scanner cannot reach the server from a second worktree. False positives are listed by issue key in the PR for the founder, never suppressed.
- Playwright records video for every spec (`playwright.config.ts`); CI uploads `test-results/` as the evidence artifact. Link it from the PR and the ticket.

## Traps fixed in tooling

- `npm run native:electron` now forces `@electron/rebuild`; `electron-builder install-app-deps` silently no-ops after `npm run check` flips SQLite to the Node ABI. Symptom was every Electron spec failing with "browser has been closed".
- `scripts/test-packaged.mjs` lists the asar with a 64 MB buffer; the bundle is ~21k files.
- `npm run sonar:scan:native` uses the official npm scanner against the local server.

## Day zero checklist

Run these before any lane starts. Tickets are in `.github/next-run-tickets.json`; seed them with `LINEAR_API_KEY=... node scripts/linear-seed.mjs`.

1. Merge the workflow branch. Add the `ANTHROPIC_API_KEY` secret. Create the `lane:<name>` labels. Set required checks on the integration branch to `checks / CI gate` and `Lane guard`. Enable the merge queue.
2. Linear: enable the GitHub integration; add the automation `status = In Testing → run Cursor cloud agent` with the verification prompt below.
3. Cursor: enable Bugbot on the repository; restrict autofix to formatting and lint (no test, threshold, or Sonar config edits).
4. SonarQube: settle the quality-profile decisions listed in the day-zero Sonar ticket.
5. Build the walking skeleton on the integration branch and merge it. Only then dispatch lanes.

Local concurrency: at most three implementers on the laptop. Close a Superset terminal the moment its PR is open. Stop SonarQube (`npm run sonar:stop`) when no scan is queued.

## Cloud verification prompt

Paste into the Cursor automation. Replace nothing; the ticket supplies the values.

```text
You verify one frozen revision for the Applied Research desktop app.
Ticket: {{ticket.identifier}}. Branch: {{pr.branch}}. Revision: {{pr.head_sha}}. Lane: {{pr.label:lane}}.
1. Check out exactly that revision. Run `npm ci`, then `npm run check`.
2. Run the Electron suite: `xvfb-run --auto-servernum npm run test:e2e` with LIBGL_ALWAYS_SOFTWARE=1. Playwright records video into test-results/.
3. Run `npm run package` and `xvfb-run --auto-servernum npm run test:packaged`.
4. Attach the videos for the specs this ticket names, plus the pass/fail list, to the ticket. Name the exact revision in the comment.
5. If everything named in the ticket's acceptance passes, move the ticket to In Review. Otherwise move it to In Development with the failing spec and the first error line.
Do not edit source, tests, thresholds, or Sonar configuration. Do not use any provider key; the synthetic backend in the specs is sufficient.
```

## Worker prompt shape

Every implementer prompt states: ticket, lane label, base branch and revision, the files it may touch (from `lanes.json`), the acceptance list from the ticket, the design references (`context/design-handoff/DESIGN-CONTRACT.md`, `context/design-handoff/prototype/`), and the hard time box. It ends with: open a PR against the integration branch using the template, with the frozen revision and your local check and e2e results filled in. For Codex CLI, pass the effort explicitly (`-c model_reasoning_effort="high"`); the default is low.

## What the coordinator does all day

Reads PRs in the queue, merges the ones with a green gate and a PASS, resolves conflicts by asking the owning lane to rebase, reruns the integration e2e after each merge, and keeps the decisions issue current. It does not allocate slots, does not route reviews, and does not click dialogs in other agents' terminals.
