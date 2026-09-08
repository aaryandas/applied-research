# Linear draft — Preflight 2026-09-08 (harness dry-run)

Paste as a comment on the Linear MCP issue (or a factory ops issue). Not a completion of founder setup.

## Preflight

| Check                  | Result                                                                                                                                                                                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node 24 / `npm ci`     | **Partial.** Repo requires Node 24 (`engine-strict`). This Cloud VM PATH defaulted to Node 22; Node 24.20.0 was installed via nvm for verification. Documented in development context; no engine check was weakened.                                                  |
| Linear MCP             | **Fail.** Namespace `Linear` is `needsAuth`. Cannot list tickets or attach proof videos. Receipts under `factory/receipts/`.                                                                                                                                          |
| Proof video on Linear  | **Blocked.** User-visible tickets must attach a recording to Linear. Upload is impossible until MCP is authenticated.                                                                                                                                                 |
| GitHub                 | **Pass (read).** `gh` authenticated read-only. Secrets/rulesets not listable (403 / no admin).                                                                                                                                                                        |
| Computer-use           | Not exercised; no visual product tickets dispatched.                                                                                                                                                                                                                  |
| OpenRouter live budget | **N/A.** No product live-tests this run. Cap remains US$2 / 10 requests when AR-7 exists.                                                                                                                                                                             |
| Fable probe            | **Fail.** Bounded `critic-fable` launch was refused: “You must acknowledge Claude Fable 5's data retention policy to use the model.” Founder must accept that policy in Cursor before InReview tickets can be independently accepted. Do not let authors self-accept. |
| gpt-6-astra            | **Unavailable** in this run’s model catalog. Visual tickets would Park or use Sol High + Fable, not self-review.                                                                                                                                                      |

## Founder-blocked (not done by the agent)

- Authenticate Linear MCP so agents can attach proof videos to tickets
- Enable Bugbot on this repo (prefer fail-on-unresolved)
- Create and protect `integration` from current development; require **CI gate** on PRs into `integration` and `main`
- Add label `gauntlet:land`
- Cloud Secrets: Linear, OpenRouter (later product), Sonar
- Confirm auto-land vs label `gauntlet:land` (conservative default: label required)
- Acknowledge Claude Fable 5 data retention so `critic-fable` can launch
- Paste SuperSet design-handoff into git if that remains founder-owned

## Harness work that continued without Linear

Skills, subagents, rules, `BUGBOT.md`, `factory/` BOARD/envelopes/recipes. No product features. No AR worker dispatch. GitHub **CI gate** passed on `c253fc5` (4 checks).
