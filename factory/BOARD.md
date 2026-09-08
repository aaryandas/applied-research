# Factory BOARD

Generated-style in-flight table. Coordinator owns this file. Empty until Linear tickets are readable and envelopes exist.

**In-flight (implementers + critics + integrate):** 0 / 7
**Live OpenRouter budget (AR-7):** US$2 cumulative / 10 requests — not started; remaining unknown until product live-tests exist.

| Ticket | Outcome | State | Owner | Envelope | PR | Gates | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — | — | No Ready tickets. Linear MCP was not available at last preflight. See [receipts/](receipts/). |

## States

Backlog → Ready → Implementing → InReview → Repairing → Integrating → Done
Parked from Implementing / InReview / Integrating when blocked.

Ready requires: deps contract-checkpointed, files owned, envelope written.
Done requires: on `integration`, Sonar recorded if applicable. Workers never set Done.

## Parked

_None._

## External (not tickets)

| Item | Status |
| --- | --- |
| Linear MCP | Blocked — not connected to this Cloud Agent |
| Bugbot | Blocked — founder must enable on the repo |
| `integration` branch | Blocked — not created; `codex/integration-20260908` is a different product PR |
| `gauntlet:land` label | Blocked — label does not exist |
| Cloud Secrets | Blocked — founder |
| gpt-6-astra | Unavailable in this run’s model catalog; visual fallback is Sol High + Fable |

Last updated: 2026-09-08 (harness dry-run).
