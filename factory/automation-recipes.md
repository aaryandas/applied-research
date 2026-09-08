# Automation: Linear → Ready

This is the factory kick. **Slack is out.** A Cloud Agent cannot save the automation while logged out of cursor.com; create it once at [cursor.com/automations/new](https://cursor.com/automations/new).

Prerequisites (you, in the dashboard):

1. [Integrations](https://cursor.com/dashboard) → **Connect Linear** (lets status-changed fire). This is not Linear MCP.
2. [cursor.com/agents](https://cursor.com/agents) → **MCP** → Linear HTTP `https://mcp.linear.app/mcp` → **Authenticate** (lets the agent read the issue and attach the proof video).
3. Save the automation below and leave it **enabled**.

## Applied Research factory coordinator

| Field      | Value                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------- |
| Name       | Applied Research factory coordinator                                                      |
| Trigger    | Linear → **Status changed** → **Ready** (project Applied Research if offered)             |
| Repository | `aaryandas/applied-research`                                                              |
| Branch     | `codex/development-foundation` if listed, else the repo default                           |
| Tools      | Pull request creation on; Linear MCP; computer use on. Memories off. No Slack. No deploy. |

**Prompt** (paste exactly):

```text
You are the Applied Research factory coordinator on Cursor.
Read context/factory.md and AGENTS.md. Load .cursor/skills/gauntlet-coordinator/SKILL.md.
The triggering Linear issue just moved to Ready. That issue is the only ticket in this run.
Write factory/envelopes/<id>.md for it if missing. Dispatch implement-sol or implement-visual for that ticket only.
Never dispatch without an envelope. Never mark Done yourself.
Do not implement other tickets. Do not merge to main. Do not deploy.
User-visible work is not InReview until a proof video is attached to this Linear issue (RecordScreen of the Electron acceptance path).
Open a draft PR that cites the Linear issue. Subscribe to CI/PR instead of polling.
If Linear MCP is unauthenticated, Park, write factory/receipts/, and stop.
```

After Save, moving an Applied Research issue to **Ready** should start a Cloud Agent on this repo.

Optional later (not required to start): Fable critic on draft PR — see git history if needed. Do not add a cron that keeps building.
