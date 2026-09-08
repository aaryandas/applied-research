# Linear draft — Connect factory graph (MCP)

**Team / project:** Applied Research ([linear.app/aaryan-das/project/applied-research-64943086779b](https://linear.app/aaryan-das/project/applied-research-64943086779b))
**Suggested title:** Connect Linear MCP to Cursor Cloud for the software factory
**Status:** Backlog (founder)
**Labels:** none required

## Outcome

Cursor Cloud Agents can read the Applied Research ticket DAG **and attach proof videos** to issues so the founder can verify a feature without opening the PR.

## Why

Harness dry-run on 2026-09-08: Linear MCP namespace exists but **needsAuth**. Coordinator cannot list AR tickets or **attach proof videos** until you authenticate it for Cloud Agents.

## Acceptance

- Linear MCP available to Cloud Agents on `aaryandas/applied-research` (read + **file attach**)
- Coordinator can list AR tickets and statuses
- Worker can attach `proof.mp4` to the Linear issue for a user-visible ticket
- Founder confirms which issues are factory graph vs product-decision audit

## Must not

Rewrite `context/product.md` from the 2026-09-08 gauntlet prompt. Stack discrepancies stay on the [decision audit](../../context/decision-audit.md) until a Linear decision is accepted into `context/`.
