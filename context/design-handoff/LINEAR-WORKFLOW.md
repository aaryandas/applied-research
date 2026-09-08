# Linear is the work and decision ledger

Use project `applied-research` (`ef2d7ec5-3650-4ad8-a8cc-f04cd447a996`), team `AR` (`b9f474b3-6722-45fd-ab47-c3a1123c9925`). Inspect existing issues and current team statuses first. AR-1 already tracks the initial scaffold; AR-4 owns this handoff. Do not overwrite their status based on assumptions.

Every substantial research, decision, implementation, review and integration unit belongs to an issue. Comments/checklists can track review rounds within the owning issue; do not create a ticket for every command. No untracked side work. Relate issues and record dependencies before dispatching agents. A coordinator owns issue transitions to avoid conflicting updates.

Use the actual workflow states. At the founder's September 8 request, the team now includes **In Development, In Testing and In Review**, alongside Backlog, Todo, historical In Progress, Done, Canceled and Duplicate. Use In Development for implementation, In Testing for integrated validation and In Review while independent acceptance is pending. Use blocker relations and a clearly labeled status paragraph for blocked work. Ready work needs approved prerequisites and testable acceptance criteria. Done requires integrated code, applicable passing checks and resolved independent-review findings. Mark a decision Done only after the founder’s explicit response is recorded.

The team All issues view is a favorited status board with all completed issues, empty columns, sub-issues and labels visible; its display configuration is saved as the team default. Use feature-area labels (Opening, Learning Path, Reader, Canvas, Practical Work, Settings & Auth, Explanations, Companion, Storage, Quality & Delivery, Architecture, Motion & Design and Playbook) and Epic for the parent delivery/scope issues. Preserve existing labels when adding relevant areas. The Active view excludes completed work; use All issues to inspect the complete delivery ledger.

## Implementation issue

```markdown
## Outcome

[User-visible behavior and why it matters.]

## Scope

[Included work; explicit exclusions only where needed to prevent ambiguity.]

## Dependencies and decisions

[Issue links, approved decision IDs, design reference and relevant architecture contract.]

## Acceptance

- [Observable happy path.]
- [Relevant empty/error/offline/restart/accessibility cases.]
- [Visual criteria at agreed viewports and content.]

## Evidence

[Commit/PR, tests and environment, actual screenshots, reviewer verdict, remaining limits.]
```

## Decision issue

```markdown
Status: proposed | awaiting founder | accepted | superseded
Question: [One concrete decision.]
Why now: [Behavior/tickets blocked and conflicting evidence.]
Options: [2–3 viable choices with tradeoffs; small code/interface example if useful.]
Recommendation: [Preferred choice and specific reason; supporting official sources.]
Decision: [Founder’s exact chosen option, date and source; pending until answered.]
Rationale: [One short paragraph.]
Consequences: [Migration, dependencies, limitations and what this supersedes.]
Affected work: [Issue links.]
```

## Blocker — send to the founder immediately

```markdown
Blocked: [Ticket and exact missing input/access/decision.]
Impact: [What cannot proceed or be honestly validated.]
Recommendation: [Specific next step.]
Options: [Viable alternatives and consequences.]
Your action: [Exact safe unblocking step; no secret values.]
Continuing: [Independent work still ready.]
```

Do not wait for a daily summary to surface a blocker. Use the active conversation as well as Linear; a buried ticket is not immediate notice. Missing credentials require secure configuration, not a request to paste them into a conversation. If Linear itself is unavailable, tell the founder immediately, retain an unposted local draft, and pause new dependent work; do not silently run an alternative ticketing system.

## Independent review round

For Superset workers, follow [the orchestration protocol](SUPERSET-ORCHESTRATION.md). The parent plan preserves ticket-to-workspace/branch/host/terminal mappings, role, verified model/preset/effort, dependencies, source identity and status. Each review records both author and reviewer model identity; different sessions alone do not establish cross-model review. The coordinator alone transitions issues after validating worker evidence and integrated acceptance. Record authentication/model-access blockers immediately under AR-7 or the affected ticket.

Record reference/candidate versions, same viewport/data/state, concrete findings with severity and affected acceptance criteria, required fix, evidence, and per-finding resolved/partial/unresolved verdict. Keep one current findings list; preserve prior rounds as history. A self-written “looks great” is not evidence. Linked review tasks are appropriate where independent ownership is useful.

Keep descriptions concise and current. Use real newlines and fenced code only where an example resolves ambiguity. Link source documents instead of pasting transcripts. Never attach keys, private review state, real vault data or personal notes. Linear records decisions; the repository mirrors accepted implementation contracts and links back to the authoritative issues.
