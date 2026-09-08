# Superset coordination and cross-model review

Latest reviewer-access update (September 8): the prior Fable login failure is historical. The founder can refresh it and expects it to work now. The next implementation session must verify one bounded real reviewer launch/model/effort/tool check before recording recovery or a current blocker. The current maximum is seven concurrent workers, including reviewers; do not waive independent review or silently substitute its required model.

Founder decision: use Superset to coordinate Fable agents and other model-backed implementers/reviewers for the full-app gauntlet. Superset transports agent sessions; the coordinator owns dependencies, evidence, integration and Linear transitions. This replaces generic same-runtime subagent fan-out as the primary build workflow. It does not start the build or authorize new paid plans.

## Verified capability and remaining preflight

The installed CLI is `/Users/aaryan/.superset/bin/superset`; it is not currently on this task's PATH. Its help exposes `agents create`, `agents list`, `workspaces create` and terminal `list/read/send/close`. `agents create` accepts an agent preset or HostAgentConfig UUID and optional supported effort. It does **not** expose a `--model` option in the inspected version.

The founder completed sign-in and Superset authentication, local agent discovery, workspace discovery and terminal inventory now pass. The local host is healthy. Sandboxed checks misleadingly reported a stale PID and failed networking; supported checks with the required host/network access succeeded without restarting or changing the host. Cloud host discovery returns an empty list and the local host reports `cloudRegistered: false`; use the verified local control path, not an assumed remote host connection.

| Item                           | Verified configuration                                                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local capstone workspace       | `8c734b89-7c4a-4b1f-92f7-6afe41f121dc`                                                                                                              |
| Superset project               | `8e086b8a-496e-40ed-872f-64a1ca2ac3b1`                                                                                                              |
| Local host                     | `95fcc012606c7d57b011ea080d2c3328`                                                                                                                  |
| Fable-capable preset           | `claude`, config `3ee1eade-2ff0-4843-b646-8ecd2be055df`; launches `claude --permission-mode auto`                                                   |
| Inherited Claude configuration | User settings select `fable[1m]`, effort `high`; no project settings override was found. Claude CLI help explicitly supports the Fable model alias. |
| Sol implementation preset      | `codex-sol-high`, config `831b3eab-1092-42a3-a4c9-fdb619d676f6`; explicitly selects `gpt-5.6-sol`, effort `high`                                    |
| Agent authentication           | Claude signed in through its existing subscription; Codex CLI signed in through ChatGPT. Secret values were not inspected.                          |

Accepted founder allocation: **gpt-5.6-sol High and gpt-6-astra implement; Fable 5.1 High independently reviews both; the existing running build task coordinates and integrates.** The founder additionally selected Astra for visual work, including Manim and Three.js. Route bounded visual/interaction/motion and Manim/Three.js tickets to Astra, with Sol High handling other approved implementation tickets. This supersedes the reversed recommendation and makes Sol a nonexclusive implementer. Do not ask again which model fills each role. The founder named Fable **5.1**, so the inherited `fable[1m]` alias is insufficient proof of the required version. Resolve the supported exact identifier, configure a dedicated reviewer through supported Superset/agent controls without changing unrelated global settings, and verify runtime model identity before accepting a review. Surface actual version/access blockers; do not silently substitute another release or model.

On 2026-09-08, the founder increased the prior two-worker maximum to seven active workers, including reviewers, in the build-speed audit task (answer: “Could we increase to 7”). This later decision supersedes the two-worker cap. Rotate ready implementation and review roles within seven; keep the existing build task as sole coordinator. No new paid access or automatic purchase is authorized. Configuration is not evidence of live inference. No worker was launched by this handoff-preparation task. Quota, tool/visual capability and live terminal launch/read/send still require checks at dispatch. AR-7 records decisions and evidence.

## Preflight and model allocation

Build-task configuration receipt, 2026-09-08 UTC ([AR-7](https://linear.app/aaryan-das/issue/AR-7)): dedicated reviewer config `8d27061a-1320-4d59-b9a6-4037dbb7a2e4` launches `claude --model claude-fable-5-1 --effort high --permission-mode auto`. The [official model identifier](https://platform.claude.com/docs/en/models/fable-5-1/overview) and saved argv were verified. Dedicated Astra config `0f71d64a-71c1-4294-adad-6e2b58bacbd7` now launches `/Applications/ChatGPT.app/Contents/Resources/codex --model gpt-6-astra --sandbox workspace-write --ask-for-approval on-request`, with normal approval controls and no effort override; the existing local effort was High at verification and must be rechecked at launch. Neither preset changes global Claude/Codex configuration. This configuration receipt alone does not prove review success. The first Opening worker failed on standalone CLI 0.147.0 before edits, then successfully resumed with bundled CLI 0.153.4 and runtime gpt-6-astra High. The dedicated preset was updated through Superset Settings and its saved argv verified by the CLI; no global Codex configuration changed.

The founder also selected fresh Astra visual-critic sessions for Sol-authored work. These supplement required Fable 5.1 High review. On Astra-authored work, Fable owns independent acceptance; Astra cannot accept its own implementation. Preserve matched screenshot/motion/interaction evidence and rotate all roles within the separately approved concurrency bound.

Read the available `superset-orchestrate` skill and current CLI help. Resolve the executable, then run:

```sh
superset auth whoami --json
superset terminals --help
superset agents list --local --json
superset hosts list --json
superset workspaces list --local --json
superset agents create --help
superset workspaces create --help
```

Use the absolute executable above if PATH has not been configured. Select the actual project/workspace/host from discovery; never guess IDs or assume a workspace defaults to this repository. Use `--host` consistently for remote operations. Require terminal-capable agents: `--agent superset` creates a chat session and is unsuitable for the terminal read/send protocol.

The model roles below are selected. Verify the exact configured identities and resolve any remaining concurrency limit before affected dispatch; do not reopen the role decision.

| Role                          | Selected assignment                                                                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Coordinator/integrator        | Existing running Codex build task; sole owner of dependencies, integration, Linear transitions and Sonar scans.                                                                                              |
| Sol implementation            | `gpt-5.6-sol`, High effort, using the verified Sol High Superset preset; other approved implementation tickets.                                                                                              |
| Astra implementation          | `gpt-6-astra` for visual/interaction/motion, Manim and Three.js tickets. Verify a supported Superset config and runtime identity; preserve already-selected effort rather than inventing an effort decision. |
| Code and architecture critic  | Fable **5.1**, High effort, fresh independent session; review specification and TS/Effect standards separately.                                                                                              |
| Visual and interaction critic | Fable **5.1**, High effort, fresh independent session with verified image/motion inspection and Electron/browser evidence access.                                                                            |

The founder also highlighted Astra's visual reasoning. Use fresh Astra sessions as additional visual critics for Sol-authored work where useful, checking matched screenshots, motion and interaction evidence. Fable 5.1 High remains the required independent reviewer of both implementers. Astra critique supplements that review and cannot independently approve Astra-authored work; Fable reviews those implementations. Rotate the extra review role within the approved worker limit.

Do not alternate or reverse these roles without a later founder decision. A different terminal, preset label or reasoning effort is not proof of a different model. Record configured and runtime-reported model identity; unverified identity cannot satisfy the exact-version review requirement. Surface authentication, version, subscription, rate-limit, cost, tool or vision limitations immediately in the conversation and Linear; continue only independent work.

Agent-model allocation is separate from Applied Research's app-managed OpenRouter backend. Never give worker agents company provider keys or use product credentials to pay for agent execution. Check existing account authorization and agree concurrency/spend bounds; do not purchase access or enable paid usage by inference.

## Isolate and dispatch

Create a compact coordinator table in the parent Linear plan: ticket/task, role, dependencies, workspace/branch, source revision plus dirty-change identity, host, preset, actual model, effort, terminal session ID, status and evidence. Preserve this mapping across context compaction and restarts. Keep local paths and private evidence local when appropriate; record references rather than raw terminal transcripts or secrets.

Give each editing worker its own Superset workspace/branch and explicit file ownership. Before branching, preserve the existing uncommitted application, design and CI work and establish an exact local source handoff. A fresh worktree from the default branch will not contain those changes automatically. Verify that every worker has the intended source and approved design reference before dispatch. Do not stash, discard, publicly push or upload the entire working directory to solve this. Continue to honor the pending publication decision.

After inspecting current help, create workspaces with the discovered project/host, intended base and a `codex/` branch. Launch each ready worker once using the returned workspace and configured terminal-agent ID:

```sh
superset agents create --workspace <workspace-id> --host <host-id> \
  --agent <verified-preset-or-config-id> --prompt '<bounded worker prompt>' --json
```

The placeholders are explanatory, not runnable IDs. Use structured process arguments or proper shell quoting for real prompts. Add `--effort` only when supported and selected. Require `kind: terminal` and retain the returned `sessionId`. Do not infer model selection from this command: it comes from the verified agent configuration. Do not use attachment uploads to distribute private context without the applicable authorization.

Each prompt contains the Linear ticket, role, allowed files, approved decisions, precise source/reference identity, dependencies, observable acceptance, required checks, permission boundaries and reporting protocol. Reviewers get the actual frozen candidate, specification and reproducible evidence in fresh context, not the author's self-assessment. Reviewers report findings; implementation workers perform repairs. Shared desktop UI use and the integration checkout/Sonar scan are serialized so workers cannot interfere with one another's evidence.

## Monitor, repair and recover

### Throughput policy · September 8 audit

The founder requested immediate acceleration of the active build. Apply this scheduling policy now. The founder answered the concurrency proposal with “Could we increase to 7”; the current maximum is seven active workers, including reviewers. This supersedes the prior two-worker limit. Use up to four implementation lanes, two independent review lanes and one flexible contract/review/repair lane; allocation is a scheduling default, not a requirement to fill slots without ready work. Prioritize reviewer capacity when completed candidates queue. Blocked or idle sessions are not active workers, but reconcile them before resuming so the total never exceeds seven. The existing build task remains the sole dispatcher, integration owner and Sonar owner. AR-7 records the orchestration change; AR-13 retains the delivery queue.

- **Fill ready capacity before waiting.** After a handoff, blocked report or completed review, dispatch the next independent bounded task before performing bookkeeping or a long integration check. A reviewer can inspect a frozen candidate while another worker implements an unrelated slice. Integration and Sonar freeze only their own source; isolated workers continue. Keep a ready queue with explicit reasons for any idle slot.
- **Separate contract readiness from whole-ticket acceptance.** The owner can publish a frozen, independently reviewed contract checkpoint (types, validation rules, operations and revision identity) before its entire storage/backend slice is complete. Consumers may then implement against that exact contract in isolated worktrees. Integration, connected acceptance and Done still wait for the reviewed real producer. Fixtures only support development/testing and must never become fake product behavior. Do not fabricate an API or branch consumers from mutable unreviewed code.
- **Split broad downstream work.** Reader/source selection and notes can precede Canvas graph composition; desktop account/session transport can precede generated-learning persistence. Route shared contracts and IPC registration through one named owner. Give workers non-overlapping files, and keep package/lockfile changes with one dependency owner per integration batch. Do not make local Reader behavior wait for live GitHub/provider configuration when it uses approved local operations.
- **Overlap review with verification.** Send the critic the frozen diff, specification and existing evidence as soon as the candidate is ready. Independent code/architecture review can run alongside coordinator tests, packaging and Sonar. Supply resulting scan and visual evidence to that same critic before acceptance. Review fresh candidates in independent context; return bounded repairs to the same critic. Fix the full material findings batch before another review round.
- **Keep checks proportional without weakening gates.** Use focused behavioral checks during edits; run the required full checks at the worker handoff and integrated revision. Reuse successful evidence only for the identical source, lockfile, runtime and relevant environment. Rerun after changed code, failures, or changed conditions. Never reuse a worker scan as integrated Sonar evidence. Every integrated application slice and analyzed-code repair still follows the gauntlet's required scan cycle. Do not package documentation-only changes or repeat an unchanged successful check merely to poll progress.
- **Keep the coordinator available.** Batch independent terminal reads in one pass, normally every 60–120 seconds while doing useful coordination work; use shorter checks for a just-completed handoff or blocker. Avoid repeated unchanged transcript dumps. Keep a compact local state receipt and record Linear updates at dispatch, contract handoff, review verdict, blocker change and integrated acceptance, rather than narrating every command in multiple tickets. Preserve required revision-specific evidence and immediately surface material blockers.
- **Bound stalled work.** Ask workers for a checkpoint after roughly 15 minutes without a useful handoff: changed files, contract readiness, next verification and specific blocker. This is a checkpoint, not a forced completion deadline. If a broad slice monopolizes a lane, obtain its current contract/finished sub-slice and split remaining independent work before starting another broad task. Do not restart productive workers solely because time elapsed.
- **Reuse verified access.** Verify model identity on actual launch and recheck capabilities after an error, preset/runtime change or new session. Do not repeatedly rediscover unchanged configuration in every repair round. Existing sandbox-only failures should use the already-established supported permission path, without relaxing permissions. Keep reviewer connector failures off the build's critical path when the coordinator can provide the exact authorized local spec and evidence.
- **Respect resource capacity.** Reuse suitable idle isolated workspaces after verifying their state. Serialize native dependency rebuilds, packaging, shared desktop interaction and scans when they compete for disk/CPU or modify common output. Check available disk before a new heavy install; the audit observed only 5.7 GiB free after earlier ENOSPC recovery. Increasing model concurrency does not authorize simultaneous heavy installs, cache/volume deletion or new paid access.

Record `readyAt`, `startedAt`, `handoffAt`, `reviewStartedAt`, `reviewFinishedAt`, `integratedAt`, current blocker and next owner in the existing coordinator receipt. At the next two handoffs compare ready-to-start wait and handoff-to-review wait. Report measured improvement or continued bottlenecks; a larger worker cap alone is not evidence of speedup.

Use `superset terminals list/read/send` with explicit workspace, host and terminal IDs. Read each running worker at a measured cadence, inspect blocked output immediately and send findings back to the existing implementation session. Record dependencies and unlock work only after verified completion. Terminal presence, disappearance, a title or an idle prompt is not proof that a ticket is complete.

Require these prompt-convention envelopes, followed by independent verification of the evidence:

```text
SUPERSET_WORKER_DONE
task: <ticket/task-id>
summary: <outcome or reviewer verdict>
files: <changed paths or none>
checks: <commands, outcomes and evidence references>
handoff: <exact candidate identity, findings and remaining limitations>
```

```text
SUPERSET_WORKER_BLOCKED
task: <ticket/task-id>
reason: <specific missing prerequisite>
needs: <decision, access or dependency>
```

These markers are text, not durable Superset completion events. A DONE envelope means a worker has handed back a result; it does not close the Linear ticket. Independently verify the diff/tests, review verdict and candidate identity. Return repairs to the critic against the new exact candidate. Resolve reviewer disagreement using requirements and evidence; surface material ambiguity to the founder, not a majority vote or an additional model chosen to obtain approval.

Integrate dependency-ready reviewed changes one at a time, run the gauntlet's combined checks and serialized Sonar cycle, then transition the owning issue. After interruption, reacquire live terminal IDs and reconcile the saved table with source and output before resuming; do not create duplicate workers blindly. Missing or malformed envelopes require inspection. Repeated failures require a changed approach or a blocker report, not endless relaunching.

Keep finished terminals available for inspection. Close sessions or delete workspaces only within authorized cleanup. This is coordination by the running task, not a background daemon: stopping the coordinator stops monitoring and dispatch, although already-launched terminal agents may continue. On a stop request, inspect and explicitly stop affected workers through supported controls and report their remaining state; do not claim they stopped merely because the coordinator did.
