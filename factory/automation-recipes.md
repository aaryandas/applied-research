# Automation recipes

Founder creates these at [cursor.com/automations](https://cursor.com/automations) (or `/automate`). There is no repo YAML to commit. **Do not** add a cron that keeps building. **Do not** add deploy-on-green.

Repo for source-control automations: `aaryandas/applied-research`.

---

## 1. Start coordinator

**Name:** Factory coordinator (Ready / Slack)

**Trigger (either):**

- Linear — Status changed → **Ready** (project Applied Research)
- Slack — public channel keyword, e.g. `start factory` (optional second trigger)

**Repository:** `aaryandas/applied-research` (required so the agent can read BOARD and open PRs)

**Tools:** pull request creation on; Linear/Slack MCP if connected; GitHub subscriptions. Memories off or scratch-only.

**Model:** strong reasoning (coordinator). Not required to be Sol.

**Prompt:**

```text
You are the Applied Research factory coordinator on Cursor.
Read context/factory.md and AGENTS.md. Load the gauntlet-coordinator skill.
Do not implement product features in this run.
Dispatch per factory/BOARD.md. Never dispatch without factory/envelopes/AR-n.md.
Never let a worker mark Done. Subscribe to CI/PR instead of polling.
If Linear MCP is missing, draft receipts under factory/receipts/ and say so.
Stop after dispatch/status unless the founder expands scope.
```

---

## 2. Status (no repository)

**Name:** Factory status

**Trigger:** Scheduled cron `0 */4 * * *` (every 4 hours, UTC; may run late, never early)

**Repository:** **No repository**

**Tools:** Send to Slack and/or Linear comment if connected. Memories allowed for last-report pointer only.

**Prompt:**

```text
Summarize open factory PRs on aaryandas/applied-research and Parked tickets.
Read factory/BOARD.md if a prior report linked it; otherwise use GitHub PR list + any Linear you can see.
Do not edit code. Do not open PRs. Do not implement.
Post a short status. If nothing changed, say so.
Memories: store only a pointer to the last report timestamp.
```

---

## 3. Fable critic

**Name:** Factory Fable critic (draft PR)

**Trigger:** Source control — **Draft pull request opened** and **Pull request pushed** (synchronize). Not deploy.

**Repository:** `aaryandas/applied-research`

**Tools:** Comment on pull request. Do **not** enable commit-to-branch. Approvals off.

**Model:** `claude-fable-5-1-thinking-high`

**Prompt:**

```text
Load .cursor/skills/gauntlet-critic/SKILL.md. You are critic-fable: independent acceptance, readonly.
If the coordinator already attached a Fable WIN/LOSE/UNJUDGEABLE for this SHA, do nothing.
Otherwise review the envelope (factory/envelopes/AR-n.md if cited), the frozen SHA, and factory/evidence/AR-n/.
Do not read the implementer transcript. Do not edit files. Do not merge.
Post one PR comment with Verdict WIN | LOSE | UNJUDGEABLE.
```

---

## Explicitly out

- Cron that implements or “continues the gauntlet”
- Deploy on green / Railway / release publish
- Merge-queue agent until label `gauntlet:land` exists and founder confirms auto-land
