# Cursor software factory

Owning page for running Applied Research’s autonomous SDLC on Cursor. Product behavior stays in [product](product.md). This page owns the factory graph, context/memory rules, and the implementation handoff.

**New Cloud Agent session:** start at [Implementation handoff](#implementation-handoff-new-session). Do not rebuild the product in that session unless the founder explicitly expands scope. The first deliverable is the factory harness in git.

Source of the loop: founder gauntlet prompt (2026-09-08) originally at `~/.superset/projects/capstone/context/design-handoff/GAUNTLET-PROMPT.md`. That file is not in this GitHub tree. Operational rules below are the Cursor mapping of that prompt plus the conservative defaults for still-open founder questions.

## Conservative defaults (override only with a Linear decision)

Until the founder records otherwise:

- Factory is **session-bound**. Automations may **start** a coordinator or send **status**. They must not keep implementing after the coordinator run ends.
- Land reviewed slices to an **`integration` branch** (create it). Do **not** auto-merge to `main`, deploy, publish, sign, or change billing.
- Merge only with label `gauntlet:land` after CI gate + Bugbot + independent Fable review. No merge-queue agent until that label exists.
- **Playbook** remains deferred. Do not resurrect its rejected design.
- **Seven concurrent workers** including reviewers.
- Models: **gpt-5.6-sol High** implementer; **claude-fable-5-1-thinking-high** independent critic. If gpt-6-astra is unavailable, visual implementation uses Sol High plus a **different-model** visual critic (Fable). Do not let the author accept its own work.
- Live OpenRouter tests: **US$2 cumulative and 10 requests** (AR-7). Not a fresh allowance.
- Cursor Automation Memories are **scratch only**. Product law lives in `context/` and Linear.
- Local Sonar stays coordinator-owned and serialized; it is **not** a GitHub PR required check until hosting is decided.
- Do not paste secrets into chat, Linear, renderer variables, or reviewer envelopes.

---

## Full factory graph

### System graph

```mermaid
flowchart TB
  subgraph founder [Founder]
    Start[Start / unblock / gauntlet:land]
    Sleep[Away: status only]
  end

  subgraph kick [Automations - kick and report only]
    LinKick[Linear: ticket Ready]
    SlackKick[Slack: start factory]
    Status[Cron: Slack/Linear status - no code]
  end

  subgraph coord [Coordinator Cloud Agent]
    Preflight[Preflight: tools, Linear, models, budget]
    Frontier[Read Linear DAG + factory/BOARD.md]
    Envelope[Write factory/envelopes/AR-n.md]
    Dispatch[Dispatch up to 7 in-flight]
    Subscribe[Subscribe CI / PR / Linear]
    Park[Park + ping founder]
  end

  subgraph workers [Isolated Cloud Agents - own VM and branch]
    Sol[implement-sol]
    Visual[implement-visual]
    Explore[Built-in explore/bash/browser]
  end

  subgraph gates [Review gates]
    PR[Draft PR per ticket]
    CI[GitHub Actions: CI gate]
    Bugbot[Bugbot + .cursor/BUGBOT.md]
    Fable[critic-fable readonly - fresh session]
  end

  subgraph land [Integrate - mutex]
    Label[gauntlet:land]
    Integrate[integrate agent: rebase + merge to integration]
    Sonar[Serialized local Sonar if configured]
    Main[main: human only]
    Deploy[Railway / Releases: founder only]
  end

  subgraph memory [Knowledge planes]
    Law[context/ + DESIGN-CONTRACT]
    Graph[Linear AR tickets]
    Scratch[Automation MEMORIES.md]
    Archive[Obsidian - human only]
  end

  Start --> LinKick
  Start --> SlackKick
  Sleep --> Status
  LinKick --> Preflight
  SlackKick --> Preflight
  Preflight --> Frontier
  Frontier --> Envelope
  Envelope --> Dispatch
  Dispatch --> Sol
  Dispatch --> Visual
  Sol --> Explore
  Visual --> Explore
  Sol --> PR
  Visual --> PR
  PR --> CI
  PR --> Bugbot
  PR --> Fable
  Dispatch --> Subscribe
  Subscribe -->|wake| Frontier
  CI --> Label
  Bugbot --> Label
  Fable --> Label
  Start --> Label
  Label --> Integrate
  Integrate --> Sonar
  Integrate -.-> Main
  Main -.-> Deploy
  Park --> Start
  Law --> Envelope
  Graph --> Frontier
  Scratch -.-> Status
  Archive -.-> Preflight
```

### Ticket state graph

```mermaid
stateDiagram-v2
  [*] --> Backlog: created with outcome, deps, acceptance
  Backlog --> Ready: deps contract-checkpointed, files owned, envelope written
  Ready --> Implementing: worker dispatched
  Implementing --> InReview: draft PR + evidence on frozen SHA
  InReview --> Repairing: Fable or Bugbot blocking findings
  Repairing --> InReview: same critic criteria, new evidence
  InReview --> Integrating: CI + Bugbot + Fable pass, gauntlet:land
  Integrating --> Done: on integration, Sonar recorded if applicable
  Implementing --> Parked: blocked / same-cause stall / needs founder
  InReview --> Parked: critic/model unavailable
  Integrating --> Parked: merge conflict or Sonar blocker
  Parked --> Ready: founder unblocks
  Done --> [*]
```

### Inner loop (one ticket)

```mermaid
flowchart LR
  S[Specify] --> B[Build]
  B --> E[Exercise Electron]
  E --> C[Compare vs reference]
  C --> K[Independent critique]
  K -->|LOSE: one largest gap| B
  K -->|WIN| I[Integrate mutex]
  K -->|UNJUDGEABLE| P[Park + inspection fix]
```

Cap inner rounds at **3** then Park. Each critique is a **new** Fable session: spec + artifacts only, never the implementer transcript.

### Knowledge / memory graph

```mermaid
flowchart TD
  Chat[Session chat - ephemeral]
  Mem[Automation Memories - scratch]
  Board[factory/BOARD.md + envelopes]
  Linear[Linear - graph and in-flight decisions]
  Ctx[context/ - accepted law]
  Code[git - implementation]
  Obs[Obsidian - archive]

  Chat -->|notice| Linear
  Chat -->|notice| Board
  Mem -->|hint only| Board
  Linear -->|founder accepts| Ctx
  Ctx --> Code
  Obs -->|named conflict only| Linear
  Code --> Ctx
```

Promotion rule: chat/memory may notice; Linear records; `context/` governs; code implements; Obsidian explains history. Agents write **down** that ladder, never **up** from Memories into product law.

---

## Roles and Cursor primitives

| Role | Primitive | Model | Sees | Must not see |
| --- | --- | --- | --- | --- |
| Coordinator | One Cloud Agent | Strong reasoning | BOARD, Linear frontier, envelopes, PR URLs, spend | Full diffs, screenshots, Effect tree, vault |
| implement-sol | Cloud subagent, own branch | `gpt-5.6-sol` High | One envelope + owning context pages + ownership glob | Other tickets, critic history, secrets |
| implement-visual | Cloud subagent | Astra if available, else Sol High | Visual/motion/Manim/Three.js envelopes | Independent acceptance of its own PR |
| critic-fable | Fresh readonly subagent | `claude-fable-5-1-thinking-high` | Spec, criteria, artifacts, references | Builder rationale, Memories |
| integrate | Small Cloud Agent | Fast/cheap OK | Frozen SHA, CI, Bugbot, Fable verdict | Redesign |
| Explore/Bash/Browser | Built-in subagents | Fast | Noisy search/logs/DOM | Decisions |
| Status | Scheduled Automation, **no repo** | Any | BOARD + open PRs | Code edits |
| Bugbot | Managed PR review | Bugbot | Diff + `.cursor/BUGBOT.md` | Product vault, secrets |

Concurrency: count coordinator? **No.** Count implementers + critics + integrate that are in-flight. Max **7**. Status Automation does not count.

---

## Context packing

Do **not** always-apply the full gauntlet prompt.

| Layer | Location | When loaded |
| --- | --- | --- |
| Index | Root `AGENTS.md` | Always; keep short |
| Path law | `.cursor/rules/*.mdc` | Matching globs |
| Playbooks | `.cursor/skills/gauntlet-*/` | Coordinator `@`s or agent-decides |
| Node payload | `factory/envelopes/AR-*.md` + Linear | Worker prompt |
| Evidence | `factory/evidence/AR-*/` + PR artifacts | Critic |
| Graph | Linear + `factory/BOARD.md` | Coordinator |
| Archive | Obsidian | Human; coordinator only on a named conflict |

Envelope (worker’s entire extra prompt):

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

Reviewed **contract checkpoints** can release consumer tickets before the producer is Done. Integration still requires the accepted producer implementation.

Coupling: parallelize uncoupled slices only. Serialize record/source-version/link schema, design tokens, preload bridges, integration merge, desktop/Playwright, and Sonar.

---

## Implementation handoff (new session)

You are implementing the **Cursor factory harness** for `aaryandas/applied-research`, not the Applied Research product UI/backend (Reader, Canvas, Railway, OpenRouter app-managed AI, Clicky, Manim). Stop at a working harness: files in git, recipes for Automations the founder enables, and a dry-run coordinator prompt. If you expand into product implementation, you have left scope.

### Read first

- This file.
- [AGENTS.md](../AGENTS.md), [conventions](conventions.md), [development](development.md), [releases](releases.md).
- [knowledge-base.md](knowledge-base.md) only to know the vault is **out of band**.
- Do not load `context/repos/effect/` as application code.

### Out of scope

- Building product surfaces or Effect runtime adoption.
- Creating Automations via undocumented APIs (write `cursor.com/automations` recipes; founder clicks Save).
- Deploy, signing, SonarQube Cloud purchase, importing the SuperSet worktree.
- Weakening CI, CSP, or coverage to look green.
- Committing secrets, real vault data, or OpenRouter keys.

### Deliverable tree

```text
AGENTS.md                                 # add factory row + short Cursor Cloud section
context/factory.md                        # this page (already exists; keep it true)
.cursor/rules/electron.mdc                # always-ish isolation for main/preload
.cursor/rules/renderer-design.mdc         # globs src/renderer/**
.cursor/rules/gauntlet-loop.mdc           # apply intelligently for factory work
.cursor/BUGBOT.md                         # provenance, no mock success, no renderer secrets
.cursor/agents/implement-sol.md
.cursor/agents/implement-visual.md
.cursor/agents/critic-fable.md            # readonly: true; Fable 5.1 High
.cursor/agents/integrate.md
.cursor/skills/gauntlet-coordinator/SKILL.md
.cursor/skills/gauntlet-implement/SKILL.md
.cursor/skills/gauntlet-critic/SKILL.md
.cursor/skills/gauntlet-integrate/SKILL.md
factory/README.md                         # index of BOARD, envelopes, contracts, evidence
factory/BOARD.md                          # generated-style table; start empty/template
factory/envelopes/.gitkeep
factory/contracts/.gitkeep
factory/evidence/.gitkeep
factory/automation-recipes.md             # copy-paste for cursor.com/automations
```

Keep skill `SKILL.md` files short; put long protocol in `references/` under each skill so context stays progressive.

### Subagent frontmatter (required)

- `implement-sol`: `model` gpt-5.6-sol High (use the repo’s supported id form, e.g. `gpt-5.6-sol[effort=high]` if that is what Cursor honors).
- `critic-fable`: `readonly: true`, Fable 5.1 High, description must say **independent acceptance**; never the author.
- `implement-visual`: visual/motion/Manim/Three.js; cannot supply the acceptance verdict for its own PR.
- `integrate`: merge to `integration` only when `gauntlet:land` + CI gate + Bugbot success + Fable WIN.

If a configured model is unavailable, record the actual id that ran in BOARD and Park visual-Astra tickets rather than silently swapping into self-review.

### Coordinator skill must enforce

1. Preflight: Node 24 / `npm ci` documented; Linear access; GitHub; computer-use; remaining live-test budget; Fable launch probe (one bounded call). Surface failures in the conversation **and** a drafted Linear note; continue independent harness work.
2. Never dispatch without an envelope.
3. Never let a worker mark Done.
4. Subscriptions instead of polling.
5. Stop-hook / `/loop` must not implement the factory. `/loop` is status-only if used at all.
6. `preCompact` reminder: persist BOARD + Linear before the window is summarized (hook may only observe; the skill must write early).

### Automation recipes to document (founder enables)

1. **Start coordinator** — Linear issue status → Ready *or* Slack keyword. Repo: this repo. Prompt: “You are the factory coordinator. Read `context/factory.md`. Do not implement product features. Dispatch per BOARD.”
2. **Status** — cron 4 hours, **no repository**. Prompt: summarize open factory PRs and Parked tickets; do not edit code. Memories allowed for last-report pointer only.
3. **Fable critic** — draft PR opened / PR pushed, only if coordinator did not already attach a critic. Prompt: load `gauntlet-critic` skill; readonly.
4. **Do not** add a cron that keeps building. **Do not** add deploy-on-green.

### GitHub (document; founder/admin clicks)

- Require **CI gate** on PRs into `integration` and `main`.
- Enable Bugbot on this repo; prefer fail-on-unresolved if the plan supports it.
- Create `integration` from current development branch. Protect it. No auto-deploy.

### Verification for this harness change

- `npm run check` still passes (docs/config only should not break it).
- Skills/subagents are valid markdown with required frontmatter.
- `AGENTS.md` factory row exists; this page stays the owner.
- Dry-run: in the PR description, paste a coordinator kickoff prompt a human can give a Cloud Agent.

### Kickoff prompt to leave in the PR

```text
You are the Applied Research factory coordinator on Cursor.
Read context/factory.md and AGENTS.md.
Do not implement product features in this run.
Confirm the harness files exist, BOARD is readable, and list Ready vs blocked
founder actions (Linear MCP, Bugbot, integration branch, secrets).
If Linear is missing, draft receipts under factory/ and say so.
Stop after the dry-run report unless the founder expands scope.
```

### Founder actions this session cannot do

- Connect Linear MCP and Slack.
- Enable Bugbot and branch rules.
- Add Cloud Secrets (Linear, OpenRouter for later product work, Sonar).
- Paste design-handoff from the SuperSet worktree into git.
- Confirm Astra availability and auto-land vs `gauntlet:land` (defaults above).

Record those as a short “external setup” list in the PR, not as fake completions.

---

## Relationship to the product gauntlet

When the founder later starts a **product** gauntlet, the coordinator reads this page **and** the product context. That later run may implement Reader/Canvas/backend per `GAUNTLET-PROMPT.md`. It still must use envelopes, Fable isolation, the 7-worker cap, and must not treat Memories or Obsidian as law.

This checkout still describes storage/providers/hosting as open in [product.md](product.md) while the 2026-09-08 gauntlet prompt treats Railway, Better Auth + GitHub, OpenRouter, and Effect v3.22.1 as selected. Do **not** silently rewrite product.md in the harness session. Open or reuse a Linear decision ticket and wait; the [decision audit](decision-audit.md) exists so agents surface discrepancies instead of inventing a new stack.
