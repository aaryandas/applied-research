# Factory BOARD

Generated-style in-flight table. Coordinator owns this file. Empty until Linear tickets are readable and envelopes exist.

**In-flight (implementers + critics + integrate):** 0 / 7

Automation: Linear status → **Ready** is the kick. It is not saved yet (cursor.com login is required). See [automation-recipes.md](automation-recipes.md).

**Live OpenRouter budget (AR-7):** US$2 cumulative / 10 requests — not started; remaining unknown until product live-tests exist.

| Ticket | Outcome | State | Owner | Envelope | PR  | Gates | Notes                                                                                         |
| ------ | ------- | ----- | ----- | -------- | --- | ----- | --------------------------------------------------------------------------------------------- |
| —      | —       | —     | —     | —        | —   | —     | No Ready tickets. Linear MCP was not available at last preflight. See [receipts/](receipts/). |

## States

Backlog → Ready → Implementing → InReview → Repairing → Integrating → Done
Parked from Implementing / InReview / Integrating when blocked.

Ready requires: deps contract-checkpointed, files owned, envelope written.
InReview requires: draft PR + proof video on the Linear issue (unless harness-only skip).
Done requires: on `integration`, Sonar recorded if applicable. Workers never set Done.

## Parked

_None._

## External (not tickets)

| Item                  | Status                                                                           |
| --------------------- | -------------------------------------------------------------------------------- |
| Linear MCP            | Blocked — namespace present but **needsAuth**; cannot attach proof videos        |
| Bugbot                | Blocked — founder must enable on the repo                                        |
| `integration` branch  | Blocked — not created; `codex/integration-20260908` is a different product PR    |
| `gauntlet:land` label | Blocked — label does not exist                                                   |
| Cloud Secrets         | Blocked — founder                                                                |
| gpt-6-astra           | Unavailable in this run’s model catalog; visual fallback is Sol High + Fable     |
| critic-fable          | Blocked — Fable 5 data-retention policy not acknowledged on this account         |
| Proof video on Linear | Blocked until Linear MCP can attach files; required for user-visible tickets     |
| Harness CI            | Pass — `c253fc5` / `2ef06b8` **CI gate** on `cursor/factory-cursor-handoff-6b8a` |

Last updated: 2026-09-08 (harness dry-run; CI success).
