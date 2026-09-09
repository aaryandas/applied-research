# Linear gate duplicate-attachment race (2026-09-09)

Incident and process note for AR-41. Not product acceptance, not a hosted Sonar waiver, and not permission to skip tests.

## Failure

Two valid Linear gate invocations ran for the same new PR before either attachment existed:

| PR                                                                            | Losing job                                                                                      | Winning job                                                                           |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [#70](https://github.com/aaryandas/applied-research/pull/70) AR-50 draft/open | [34364163522](https://github.com/aaryandas/applied-research/actions/runs/34364163522) attempt 1 | [34364162944](https://github.com/aaryandas/applied-research/actions/runs/34364162944) |
| [#71](https://github.com/aaryandas/applied-research/pull/71) AR-53 draft      | [34364415496](https://github.com/aaryandas/applied-research/actions/runs/34364415496) attempt 1 | [34364417073](https://github.com/aaryandas/applied-research/actions/runs/34364417073) |

Both jobs queried attachments, saw a missing PR URL, and called `attachmentLinkURL`. Linear returned `INPUT_ERROR` 400 `Duplicate attachment for duplicate url` / “An attachment with the same URL already exists.” The winner classified expected lifecycle (draft → In Development). That classification was already green and is not a request to fake Linear status. Root reran only the failed existing jobs; those reruns succeeded after the URL existed.

## Cause

`scripts/linear-gate.mjs` treated “URL absent on first query” as “create,” and treated every GraphQL error as a hard failure. Parallel `opened`/`labeled` work on one PR is expected. Same-PR Actions concurrency can reduce duplicate work but cannot be the proof: a cancelled run is not PASS, and overlapping mutations can still finish.

## Bounded fix

If `attachmentLinkURL` fails, re-query the exact intended AR issue and accept the error only when that issue already has the exact PR URL. Missing issue, wrong issue id/identifier, wrong or missing URL, and every other Linear error stay fail-closed. Do not globally swallow GraphQL failures.

## Cursor CI Autofix (paused)

Default Cursor CI Autofix opened [#69](https://github.com/aaryandas/applied-research/pull/69) (`cursor/ci-autofix-automation-28d5`) from automation `456211ac-abf0-11f1-b532-320a589b8025`. Its prompt told the agent to skip flaky tests (`PracticalSession` Ask and companion pointer e2e). Root rejected that PR: skips, retries, lowered thresholds, and weakened expected behavior are out of policy. **Do not reactivate that external automation.** Owned repairs stay with the ticket owner (AR-50 reflection readiness for the Ask race). Report-only Linux/Windows results remain classified, not skipped.

## Honesty limits

Main hosted Sonar [34361091356](https://github.com/aaryandas/applied-research/actions/runs/34361091356) **FAILED** and analysis was **SKIPPED** after the macOS job failed. That remains a real resulting-main failure until a later exact-main analysis passes. This Linear-gate repair does not restore Sonar, merge activation, or production scope. AR-41 stays Incomplete until trusted launch/evaluate/queue flow is observed working. No ticket is Done because a gate job turned green.
