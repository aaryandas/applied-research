# Applied Research design archive

The supplied **Design System Canvas Setup** folder was copied into this repository on 2026-09-05. The original exports are preserved, including their relative support-script and upload paths. Finder was used because macOS denied command-line access to Downloads.

## New visual system

The September 5 user-requested redesign is [Field Atlas](../../design-system/README.md), with an original engraved landscape, reusable tokens, a working local reference, and [a second-edition case study](../../design-system/CASE-STUDY.md). The imported canvases below remain historical evidence; the user’s new visual direction supersedes their palette and image restrictions.

## Start here

- [Studio teardown and design case study](applied-research-design-case-study.md)
- [Design-system canvas](<Design System Canvas Setup/Applied Research - Design System.dc.html>) — eight artboards covering posture, provenance, typography, color, components, primitives, motion, and glossary.
- [Product-screen canvas](<Design System Canvas Setup/Applied Research - Screens.dc.html>) — 28 artboards covering flows, alternate themes, storyboards, and edge states.
- [Import manifest](review-evidence/import-manifest.json) — imported file sizes, SHA-256 hashes, artboard IDs, and source line numbers.
- [Independent design assessment](review-evidence/assessment-a.md)
- [Independent technical assessment](review-evidence/assessment-b.md)

## Preview locally

From the repository root:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory docs/designs
```

Open [the design system](http://127.0.0.1:8765/Design%20System%20Canvas%20Setup/Applied%20Research%20-%20Design%20System.dc.html) or [the screens](http://127.0.0.1:8765/Design%20System%20Canvas%20Setup/Applied%20Research%20-%20Screens.dc.html). Stop the server with Ctrl+C. These are fixed desktop reference canvases; the screen artwork is 1440 × 900. The export runtime and fonts use external resources, so a network connection may be needed for faithful rendering.

These exports are reference artifacts, not a production component library or working application. Their pictured controls and motion storyboards do not establish working product behavior.

## How to read conflicting sources

1. [MVP PRD](../mvp-prd.md), dated September 4, defines the current product scope and says its more specific requirements win. It makes Electron, paper-first reading, the Workbench, export, and Settings core; Map and calibration are stretch.
2. [The original design brief](prompt-1-design-system.md) and [1b](prompt-1b-revision.md), [1c](prompt-1c-revision.md), [1d](prompt-1d-revision.md) explain the evolution of the visual system. Later revisions supersede earlier conflicting instructions.
3. [The screen brief](prompt-2-screens.md) describes the intended September 3 screen set.
4. The imported canvases are evidence of what was actually designed. They contain further review changes and stale captions. The Screens header explicitly records removal of lamp and wash fields, while the design-system canvas still specifies them. Neither export should silently settle that conflict.

The case study records discrepancies and recommendations. It does not rewrite the source briefs, reintroduce removed effects, or represent recommendations as approved product decisions.
