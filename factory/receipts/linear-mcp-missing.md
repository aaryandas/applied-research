# Linear draft — Connect factory graph (MCP)

**Team / project:** Applied Research ([linear.app/aaryan-das/project/applied-research-64943086779b](https://linear.app/aaryan-das/project/applied-research-64943086779b))
**Suggested title:** Connect Linear MCP to Cursor Cloud for the software factory
**Status:** Backlog (founder)
**Labels:** none required

## Outcome

Cursor Cloud Agents can read the Applied Research ticket DAG (Ready / deps / acceptance) so the factory coordinator can dispatch envelopes without inventing AR ids.

## Why

Harness dry-run on 2026-09-08: this agent had GitHub `gh` (read) and factory files, but **no Linear MCP tools**. Coordinator cannot legally move tickets or attach receipts to real AR issues until MCP is connected.

## Acceptance

- Linear MCP available to Cloud Agents on `aaryandas/applied-research`
- Coordinator can list AR tickets and statuses
- Founder confirms which issues are factory graph vs product-decision audit

## Must not

Rewrite `context/product.md` from the 2026-09-08 gauntlet prompt. Stack discrepancies stay on the [decision audit](../../context/decision-audit.md) until a Linear decision is accepted into `context/`.
