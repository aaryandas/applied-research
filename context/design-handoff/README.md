# Applied Research — build handoff

## Latest founder delegation · September 8

The founder authorizes agents to determine and implement Settings/sign-in, Practical Work, Manim/Three.js and companion designs from the established design system, patterns and discussions, without another per-screen reference approval. Clicky is the companion usefulness/behavior standard; [3b1b/videos](https://github.com/3b1b/videos) and 3Blue1Brown videos are the Manim quality standard. Agents must derive concrete criteria, implement real behavior and obtain independent review. This supersedes earlier missing-reference/visual-approval gates for those surfaces, not safety, spending, disputed foundations or final product acceptance. Playbook remains deferred until the rest is built out; the teammate argument graph remains roadmap work. See [the updated gauntlet](GAUNTLET-PROMPT.md) for the authoritative execution instructions and quality criteria.

The founder can refresh reviewer login and expects it to work now; the next session must test access rather than assuming either the prior failure or recovery. The founder increased the worker limit to seven during the September 8 build-speed audit. Keep the existing cumulative $2/10-request authorization.

Start here for the full desktop application build. [The full-app target](../full-app.md) supersedes an MVP-only stopping point. This handoff gathers the latest design, the accepted architecture boundaries, and the Linear decision gates. It replaces browsing old boards to guess the current direction.

**Status:** the founder's explicit visual corrections are recorded. The full-app delivery scope is confirmed; promotion of the assembled design to an implementation baseline remains a separate decision in [AR-5](https://linear.app/aaryan-das/issue/AR-5/decision-confirm-the-next-mvp-boundary-and-current-design-baseline). Architecture reconciliation belongs to [AR-6](https://linear.app/aaryan-das/issue/AR-6/decision-reconcile-the-mvp-architecture-before-adding-foundational). A reviewer’s “ship for review” is not founder acceptance.

## Open these first

The September 8 build-speed audit adds an immediate [throughput policy](SUPERSET-ORCHESTRATION.md#throughput-policy--september-8-audit): dispatch ready lanes before waiting, release consumers at reviewed contract checkpoints, overlap independent review with verification, and preserve exact evidence without repeated unchanged checks. The current coordinator applies it to the live build. The founder answered “Could we increase to 7”; seven active workers including reviewers is now the cap, superseding two. Use up to four implementation lanes, two review lanes and one flexible lane as dependencies and resources permit.

The build historically used [Superset coordination with Fable](SUPERSET-ORCHESTRATION.md). **9 September 2026:** independent review is Cursor Cloud Grok 4.6 Extra High per [ORCHESTRATION.md](ORCHESTRATION.md); do not dispatch Fable. Astra still takes visual/motion, Manim and Three.js implementation. The founder increased the maximum from two to seven concurrent workers on September 8. AR-7 tracks access evidence.

| Resource                                               | Purpose                                                                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| [Current delivery orchestration](ORCHESTRATION.md)     | Cursor Cloud Grok 4.6 Extra High review, serialized queue, fail-closed evidence. Supersedes Fable in the next-run critic role.        |
| [Gauntlet build prompt](GAUNTLET-PROMPT.md)            | Copyable instructions for the implementation task; this handoff does not start it.                                                    |
| [Current design contract](DESIGN-CONTRACT.md)          | Confirmed direction, exact roles, screen map, superseded references and unresolved behavior.                                          |
| [Portable interactive reference](prototype/index.html) | Assembled example views using the latest design; Learning Path is sidebar navigation. No review-service dependency or personal notes. |
| [Detailed visual specimen](DESIGN.md)                  | Snapshot of implemented prototype values; descriptive where not founder-approved.                                                     |
| [Architecture and decision gates](DECISIONS.md)        | What is accepted, implemented, unresolved, or deferred; immediate blockers and recommendations.                                       |
| [Linear workflow and templates](LINEAR-WORKFLOW.md)    | Ticket lifecycle, decision records, blocker reports and review evidence.                                                              |
| [Prototype provenance](prototype-manifest.json)        | Source, transformations and file hashes.                                                                                              |

The portable reference opens directly as a local HTML file with local fonts/art. If your browser restricts local assets, serve the folder:

```sh
python3 -m http.server 8766 --bind 127.0.0.1 --directory context/design-handoff
```

Then open `http://127.0.0.1:8766/prototype/`. If the port is occupied, use an available port. The review toolbar in this copy is replaced with a screen selector. Product interactions use temporary example data; there is no live AI, review submission or persistent storage. The example topic is not a fixed product curriculum.

The [live Lavish session](http://127.0.0.1:4387/session/847c3937819e2596) remains the active feedback surface on this Mac. Its source is `.lavish/design-session/round-2/`, a Git-ignored working directory. The portable copy is the durable repository reference; do not copy the live review server, capability, browser drafts or real user notes into product fixtures or shared tickets. The live copy was left intact.

## Authority and reading order

1. Latest explicit founder decisions, recorded in Linear with date, rationale and superseded references.
2. [Active presearch](../presearch.md), [product](../product.md), [domain](../domain.md), [architecture](../architecture.md), and the accepted [local-authority diagram](../diagrams/local-authority.html), within their stated scope.
3. This handoff’s current design contract and selected evidence. Specific later corrections override earlier whole-screen keeps.
4. [Working MVP](../mvp.md), [code map](../code-map.md), code and lockfile describe implementation facts; they do not create new product decisions.
5. [Decision audit](../decision-audit.md), [design session history](../design-session.md), and [original references](../design-references/README.md) preserve historical evidence. They are not blanket renewed approval.

Surface conflicts as decision issues; do not silently pick the convenient document. Existing security and data-integrity invariants remain active while an unrelated choice is unresolved.

## Linear

Read the [handoff document in Linear](https://linear.app/aaryan-das/document/applied-research-current-design-and-mvp-build-handoff-109074ac77fc) and the [copyable prompt in Linear](https://linear.app/aaryan-das/document/applied-research-mvp-gauntlet-implementation-prompt-1e6b5b25dc55). Repository copies remain available alongside the portable prototype.

Project: [applied-research](https://linear.app/aaryan-das/project/applied-research-64943086779b), team **AR**.

- [AR-4 — handoff preparation](https://linear.app/aaryan-das/issue/AR-4/organize-design-context-and-prepare-the-mvp-gauntlet-build-handoff)
- [AR-5 — scope and design baseline](https://linear.app/aaryan-das/issue/AR-5/decision-confirm-the-next-mvp-boundary-and-current-design-baseline)
- [AR-6 — architecture reconciliation](https://linear.app/aaryan-das/issue/AR-6/decision-reconcile-the-mvp-architecture-before-adding-foundational)
- [AR-7 — access and provider preflight](https://linear.app/aaryan-das/issue/AR-7/preflight-verify-build-access-openrouter-configuration-and-validation)

Use existing relevant tickets before creating duplicates. This packet is not committed or published merely because it exists locally; preserve it in the implementation branch and make the reviewed reference available to every worker before dispatch.
