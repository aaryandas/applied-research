# Desktop design review session

The September 7, 2026 [design review board](../.lavish/design-session/index.html) gathers 74 actual screen/component references, inspiration items and explicit design gaps for the full desktop product. The founder can mark Keep/Change/Drop, record notes and MVP priorities, organize custom groups, compare two previews, and send decisions through Lavish.

Use the [live session](http://127.0.0.1:4387/session/6b4cbb74941a56b6) and [session runbook](../.lavish/design-session/README.md) for operation, local persistence, recovery and verification limits. The feedback poll belongs to the originating Codex task's active turn. Decisions save locally in `.lavish/design-session/choices.json` through a loopback service, with browser storage as a fallback.

The review shell reuses Field Atlas tokens and local Hanken Grotesk/Source Serif 4 fonts. Preserved references keep their original visual treatment and provenance. Selecting an item does not automatically reaffirm its historical product copy or behavior.

This page documents the review tool, not an approved final design. [Presearch](presearch.md) and the [MVP scope](mvp.md) retain authority over current product requirements. Promote accepted decisions to their owning context pages only after reviewing the assembled flows; do not treat the inventory or review shell as a replacement for [design guidance](design.md).

## Round 1 received and recovered

The September 7 submission at 22:28:09 UTC contains **56 decisions: 20 Keep, 23 Change, 13 Drop**, with 19 written notes. The exact submitted snapshot is preserved in [round-1.json](design-references/decisions/2026-09-07-round-1.json). It was recovered from the delivered Lavish feedback after the browser appeared to lose its state, restored to the local save service, and embedded as a recovery baseline in the review board. No submitted custom groups or MVP priorities were present; those remain undecided. The other 18 catalog items remain unreviewed.

The next assembled revision should apply these explicit preferences:

- Use the Claude/Lamp & Margin typography and colors with Field Atlas's rounded control composition and icons. Make Reader and Canvas share this system.
- Preserve the Reader's approved reading, inline explanation, expansion, follow-up and loading treatments. Remove the spine and path bar per the specific component note, including from otherwise-kept screen references.
- Use the apple opening with the input itself showing “I want to learn about...” and an animated placeholder departure as typing begins. Keep the options below it.
- Develop insights and theses naturally within Reader and Canvas. Replace the academic, separate writing screens. Arrange the Canvas's idea progression horizontally, with curved connections.
- Rework Playbook for builders: insights/theses alongside concrete next steps and evidence of practical work. Robotics is the founder's example.
- Reconcile source previews, actions and explanation fallback states with the shared system. Remove redundant explanatory copy. Update posture and glossary to current product requirements.
- Keep Wondering and Codex as external references. A kept reference does not make it an application screen. Dropping the provenance artboard rejects that visual reference; it does not remove the product's attribution requirements.

These are submitted directions for the next revision, not approval of an assembled final product. Full desktop scope remains selected; proposed MVP priorities must be labeled as proposals until reviewed.

## Round 2 assembled review

The founder confirmed that the recovered Round 1 submission was complete. [Round 2](../.lavish/design-session/round-2/index.html) is now an interactive desktop prototype with Opening, Learning Path, Reader, Canvas, Practical Work, Playbook, Settings, Reusable Components and Screen Coverage. The [live review](http://127.0.0.1:4387/session/847c3937819e2596) supports per-screen Keep/Change/Drop, notes, proposed release priority, export and explicit submission. The original Round 1 board and snapshot remain intact.

The example learning loop lets a note saved in Reader appear on Canvas and Playbook, and a captured or linked practical result appear as evidence. Product data is temporary and clearly labeled illustrative; no AI, real screen observation or third-party account is connected. [The prototype system](../.lavish/design-session/round-2/DESIGN.md), [runbook](../.lavish/design-session/round-2/README.md), [verification](../.lavish/design-session/round-2/verification.json) and [finish review](../.lavish/design-session/round-2/REVIEW.md) document the boundary.

Review decisions use a separate loopback save service with revision checks and retained revision backups. Newer unsaved browser drafts are recovered alongside a differing Mac copy, not silently discarded. Explicit review submission remains the agent feedback channel. The Screen Coverage page lists unresolved detailed states and behavior; assembled product approval remains open.

## Round 2 annotation revision

The next submission contained [seven annotations](design-references/decisions/2026-09-07-round-2-annotations.txt). The opening now has closer text/underline spacing, a focus transition initiated by clicking, and a fully clickable returning-project card at the lower right. The flagged opening hint and Reader metadata line are removed.

“Record insight” replaces “Keep an insight.” A proposed contextual Insights/Sources panel replaces the Reader's passive sidebar and in-article recording button. Its composer retains selected passage text and records the originating Reader layer, so Show passage can return to the correct context. Unknown-origin recovered work does not claim a precise source link. The founder's actual prototype insight was preserved before the update. This panel arrangement is a proposal responding to the founder's question about placement, not a newly approved product requirement.

Desktop opening/rest/focus and Reader/dark/light/composer were captured. [Annotation verification](../.lavish/design-session/round-2/verification-annotations.json) covers draft retention, selected passage capture and return-to-origin. [The revision finish review](../.lavish/design-session/round-2/REVIEW-ANNOTATIONS.md) permits continued design review; perceived motion smoothness and narrow-window visuals still require user evaluation.

## Reader typography correction

The founder's [pinned Reader screenshot and typography direction](design-references/decisions/2026-09-07-reader-typography.md) now inform the [scoped Round 2 design system](../.lavish/design-session/round-2/DESIGN.md): continuous dark ground, a flat rail, smaller Newsreader reading text, Martian Mono navigation and variable Fraunces briefs. Two human insights were preserved before refresh. This is a bounded prototype correction, not full desktop approval or an application renderer change. Annotation behavior checks and `npm run check` under Node 24 pass; the initial Node 25 attempt encountered a localStorage runtime failure. The scoped desktop visual review passed; narrower windows remain outside that visual check.

## Canvas content correction

The founder's [Canvas content direction](design-references/decisions/2026-09-07-canvas-content.md) now informs the [Round 2 node design](../.lavish/design-session/round-2/DESIGN.md): actual 26px content, distinct type symbols and materials, separate exact human insights, and readable horizontal navigation. All three observed human notes are preserved. Generic node filler and the Canvas introduction are removed. This is a bounded prototype revision under review, not final approval or a renderer change; isolated behavior checks and the required Node 24 repository check pass. Dark and light renders at a 1042px artifact width passed the independent visual review for this proposal.

## Structural divider correction

The founder's [divider annotation](design-references/decisions/2026-09-07-divider-annotation.json) supersedes structural separators across the prototype. Thirty structural border declarations were removed while spacing, field and action outlines, semantic Canvas node borders and graph connections remain. The [scoped design system](../.lavish/design-session/round-2/DESIGN.md) records the change. The scoped Learning path/Reader visual review and Node 24 repository checks passed. This remains a prototype change, with no Electron renderer port.

## Build handoff

The [organized design/build context](design-handoff/README.md) includes a portable interactive reference without personal notes or the local review credential, current contracts, Linear gates and the gauntlet build prompt. It preserves the live review and separates accepted directions from unresolved implementation choices.
