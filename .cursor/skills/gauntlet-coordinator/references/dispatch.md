# Dispatch, subscribe, park

## Envelope

Worker extra prompt is only `factory/envelopes/AR-n.md`. Template:

```text
Ticket: AR-n
Outcome:
Ownership glob:
Forbidden paths:
Contract: factory/contracts/<name>.md @ <sha>
Deps satisfied:
Acceptance criteria:
States: empty / loading / error / offline / canceled / retry
Evidence dir: factory/evidence/AR-n/
Proof video: required | harness-only skip
Linear issue:
Do not self-accept. Open a draft PR. Stop.
```

Reviewed **contract checkpoints** can release consumers before the producer is Done. Integration still needs the accepted producer implementation.

## Dispatch

- Assign `implement-sol` or `implement-visual` per envelope. Each worker: own VM and branch.
- Do not hand the worker other tickets, critic history, or secrets.
- After draft PR: confirm the Linear issue has the proof video for this SHA (unless harness-only skip). Then attach `critic-fable` in a **fresh** readonly session (or rely on the founder-enabled Fable automation if it did not already run).
- `integrate` only when `gauntlet:land` + CI gate + Bugbot + Fable WIN + Linear proof video (unless skip).

## Subscribe (do not poll)

Use Cursor Cloud subscriptions:

- GitHub CI on the worker branch / PR SHA (`subscribe_github_ci`)
- GitHub PR events (`subscribe_github_pr`)
- Linear when MCP exists (issue status)

On wake: re-read BOARD + Linear frontier; do not start a product implementation from a status ping.

## Park

Park when blocked, same-cause stall, founder decision needed, critic/model unavailable, merge conflict, Sonar blocker, or **proof video cannot be attached to Linear**. Ping the founder. Parked → Ready only after founder unblocks.

`/loop` and cron **status** automations: summarize BOARD + open PRs + Parked tickets. No code edits.
