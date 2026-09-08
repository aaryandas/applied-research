# Factory working set

Index for the Cursor software factory. **Law** is [context/factory.md](../context/factory.md). This directory is the coordinator’s working graph, not product context.

| Path | Role |
| --- | --- |
| [BOARD.md](BOARD.md) | In-flight table. Coordinator updates; start empty. |
| [envelopes/](envelopes/) | One extra prompt per worker (`AR-n.md`). No envelope → no dispatch. |
| [contracts/](contracts/) | Reviewed contract checkpoints (SHA-pinned) that can release consumers. |
| [evidence/](evidence/) | Per-ticket artifacts for Fable (`factory/evidence/AR-n/`). |
| [automation-recipes.md](automation-recipes.md) | Copy-paste for [cursor.com/automations](https://cursor.com/automations). Founder clicks Save. |
| [receipts/](receipts/) | Drafted Linear notes when Linear MCP is missing. |

Envelope shape (worker’s entire extra prompt):

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
Do not self-accept. Open a draft PR. Stop.
```

Promotion: chat/memory may notice; Linear records; `context/` governs; code implements; Obsidian explains history. Agents write **down** that ladder.
