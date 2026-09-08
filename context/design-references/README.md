# Applied Research — collected design references

Compiled September 7, 2026. For the current build, start with the **[design/build handoff](../design-handoff/README.md)**. The **[historical Lavish review board](lavish/board/index.html)** contains earlier revised screens and seven decisions missing from the original Claude exports; later September 7–8 decisions supersede it where stated.

This folder gathers preserved artifacts from Lavish, Claude Design, Codex tasks, and the project’s archived inspiration library. Originals remain in place. Dates below describe the source work, not renewed approval. The live [presearch](../presearch.md), [MVP scope](../mvp.md), and [design guidance](../design.md) govern implementation.

Current review: [confirmed Round 1 decisions](decisions/2026-09-07-round-1.json) and [Round 2 assembled design session](../design-session.md). The historical references below retain their source dates and wording.

## Start here

| Collection | Open | What it contains / version distinction |
|---|---|---|
| Lavish review · September 5 | [Final board](lavish/board/index.html), [seven decisions](lavish/DECISIONS.md) | A/B comparison of Lamp & Margin and Field Atlas. **24 revised screen artboards** embedded in the board. The source export still has 28. Includes the centered project prompt, removed calibration/Map screens, selection actions at the cursor, removed depth strip and emptied Reader sidebar. |
| Claude Design · September 2–3; exported September 5 | [Screens canvas](<claude-design/Design System Canvas Setup/Applied Research - Screens.dc.html>), [system canvas](<claude-design/Design System Canvas Setup/Applied Research - Design System.dc.html>) | **28 original screen artboards and 8 system artboards**, with support runtime and uploads. Preserved prior to the board-only edits. |
| Claude studio memo · September 3 | [Lamp and Margin](claude-design/lamp-and-margin.html) | Recovered local copy of the published studio memo, including the warm-human/cold-interface palette and pen-and-wash specimens. |
| Codex Canvas · September 6 | [Interactive prototype](codex-prototypes/prototypes/canvas/index.html), [prototype notes](codex-prototypes/prototypes/canvas/README.md), [decision record](surface-decisions/issues/17-prototype-canvas-branching.md) | Later learning-map exploration with pan/zoom, expanded cards, right-angle connectors, light/dark comparisons, and v2 captures. This was an exploration with preferences and open decisions. |
| Codex Reader / explainer · September 6 | [Interactive prototype](codex-prototypes/prototypes/explainer/index.html), [prototype notes](codex-prototypes/prototypes/explainer/README.md), [decision record](surface-decisions/issues/16-prototype-explainer-inline.md) | Reader and Canvas explanation states, scrubbing, loading, failures, citations and offer variants. The decision record includes choices made after the original prototype; the screenshots do not demonstrate every accepted behavior. |
| Field Atlas · September 5–7 snapshot | [Reference](field-atlas/index.html), [approved opening](field-atlas/apple-landscape/index.html), [opening brief](field-atlas/apple-landscape/BRIEF.md) | Current repository snapshot of tokens, components, fonts, artwork, evidence and apple studies. The **apple landscape** was approved after the Lavish board’s older arch selection. |
| Inspiration and comparison captures | [Reference catalog](inspiration/README.md) | Wondering, World Labs, Codex chrome, Wabi motion clips, reading/canvas/chrome examples, and other captured references. This is the archived catalog with its original approval labels; later presearch reopened prior choices. |

## Screens to compare

| Surface | Useful references |
|---|---|
| Opening / new project | [Board](lavish/board/index.html#s1) · [original capture](claude-design/review-evidence/screenshots/new-project.png) · [approved apple opening](field-atlas/apple-landscape/index.html) |
| Reader | [Board dark](lavish/board/index.html#s7) · [original dark](claude-design/review-evidence/screenshots/reader-dark.png) · [original light](claude-design/review-evidence/screenshots/reader-light.png) · [later explainer](codex-prototypes/prototypes/explainer/index.html) |
| Canvas / Learning Path | [Expanded v2 dark](codex-prototypes/prototypes/canvas/expanded-v2-dark.png) · [expanded v2 light](codex-prototypes/prototypes/canvas/expanded-v2-light.png) · [right angles](codex-prototypes/prototypes/canvas/right-angles-v2.png) · [overview](codex-prototypes/prototypes/canvas/overview-v2.png) |
| Canvas inspiration | [Wondering branching](inspiration/canvas/wondering-branching-canvas.png) · [Wondering learning map](inspiration/canvas/wondering-learning-map.png) |
| Reactions / theses / Playbook | [Reactions](claude-design/review-evidence/screenshots/workbench-reactions.png) · [theses](claude-design/review-evidence/screenshots/workbench-theses.png) · [Playbook](claude-design/review-evidence/screenshots/playbook.png) |
| Chrome | [Codex empty](inspiration/chrome/codex-desktop/empty.png) · [settings](inspiration/chrome/codex-desktop/settings.png) · [long list](inspiration/chrome/codex-desktop/long-list.png) |
| Visual world | [World Labs hero](inspiration/visual-world/world-labs/hero-1440x900.png) · [Field Atlas day](field-atlas/evidence/desktop-reader.png) · [evening](field-atlas/evidence/desktop-evening.png) |

## Source sessions

- **Claude Design project:** [Design System Canvas Setup](https://claude.ai/design/p/c96de5f8-9c0a-4dc4-91aa-167ab1fada07?file=Applied+Research+-+Design+System.dc.html). Project ID recovered from the project’s Claude session history. The local export was recovered; the current hosted revision has not been checked.
- **Claude studio artifact:** [Lamp and Margin](https://claude.ai/code/artifact/3942001b-3134-4655-9a9e-38576099dd6c). [Local review conversation](sessions/lamp-and-margin-review.md).
- **Lavish review:** Claude session `62c474c0-8149-43fe-9eb5-af19fff04ac4`. [Conversation](sessions/lavish-review.md). The session ended September 5; the recovered HTML is a viewable board, without a running annotation connection.
- **Analyze and integrate design system:** Codex task `01a0729b-a95e-7a63-8b11-a9684889339c`. [Recent excerpts](sessions/codex-design-review.md), including approval of the apple landscape.
- **Prototype Canvas learning map:** Codex task `01a07681-1e55-72b2-8c90-cae851720350`. [Conversation excerpts](sessions/codex-canvas-review.md).
- **Prototype explainer surfaces:** Codex task `01a07681-6dc9-7e93-abc6-2427233b9dd9`. [Recent excerpts](sessions/codex-explainer-review.md).

Session files contain user/assistant conversation text, not full tool logs or internal reasoning. Older paths and instructions inside preserved artifacts are historical evidence. Use this index for working navigation.

## Supporting material

- [Screen/system import manifest](claude-design/review-evidence/import-manifest.json) lists every original artboard, source line and hash.
- [Original case study](claude-design/applied-research-design-case-study.md), [system prompt](claude-design/prompt-1-design-system.md), [revision 1b](claude-design/prompt-1b-revision.md), [revision 1c](claude-design/prompt-1c-revision.md), [revision 1d](claude-design/prompt-1d-revision.md), and [screen prompt](claude-design/prompt-2-screens.md).
- [Surface decision map](surface-decisions/map.md), [Canvas brief](codex-prototypes/briefs/canvas.md), and [explainer brief](codex-prototypes/briefs/explainer.md).
- [Collection manifest](manifest.json) records recovery source, original archive path, size and SHA-256 for every collected file. It also records hashes for the two source archives.

## Preview and preservation

Open the HTML files directly, or serve this folder locally for more reliable fonts/storage and iframe behavior:

```sh
python3 -m http.server 8766 --bind 127.0.0.1 --directory /Users/aaryan/.superset/projects/capstone/context/design-references
```

Then open [the Lavish board](http://127.0.0.1:8766/lavish/board/) or navigate from the directory listing. Claude’s exported runtime and some original fonts use external resources. The board’s “Queue answer” labels are preserved UI and do not establish that feedback was sent.

The final Lavish board is preserved byte-for-byte, including its earlier backup. Do not run its historical `build.py` against this collection: it uses obsolete paths and rebuilds from older canvases, which can lose board-only edits. Original artifact links may retain obsolete repository locations; the links in this index point into this collection.

Source archives were recovered from the verified migration copies in temporary storage, as recorded in [the knowledge-base guide](../knowledge-base.md). The collection contains the design and reference assets, including local motion recordings; the unrelated cloned OpenClicky source tree and tool network/audit logs were excluded. These third-party captures remain reference material with their original attribution.
