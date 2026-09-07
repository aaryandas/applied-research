---
name: 'Applied Research — Field Atlas'
description: 'An illustrated field atlas with a quiet, human-owned reading and writing workspace.'
colors:
  field: '#285f8c'
  field-ink: '#fff9ed'
  paper: '#f7f4ed'
  surface: '#fffdf8'
  surface-subtle: '#ece9e0'
  ink: '#232c32'
  muted: '#606765'
  line: '#d4d5cc'
  line-strong: '#949b96'
  accent: '#285f8c'
  accent-soft: '#e6edf0'
  human: '#8b4c2d'
  human-soft: '#f3e6d3'
  success: '#42624d'
  danger: '#a03932'
  focus: '#285f8c'
  evening-paper: '#172a35'
  evening-surface: '#203642'
  evening-surface-subtle: '#293f4b'
  evening-ink: '#f3efe4'
  evening-muted: '#b4c2c7'
  evening-line: '#405661'
  evening-line-strong: '#7f969f'
  evening-accent: '#b9d8ed'
  evening-accent-soft: '#2b485b'
  evening-human: '#e4b78b'
  evening-human-soft: '#473d33'
  evening-success: '#b6d3b8'
  evening-danger: '#f4aaa3'
  evening-focus: '#b9d8ed'
  cream-button-ink: '#233a4b'
  cream-button-hover: '#e9deca'
typography:
  display:
    fontFamily: 'Source Serif 4, Georgia, serif'
    fontSize: 'clamp(58px, 5.3vw, 82px)'
    fontWeight: 300
    lineHeight: 1.02
    letterSpacing: '-.04em'
  display-narrow:
    fontFamily: 'Source Serif 4, Georgia, serif'
    fontSize: 'clamp(44px, 8vw, 58px)'
    fontWeight: 300
    lineHeight: 1.02
    letterSpacing: '-.04em'
  display-smallest:
    fontFamily: 'Source Serif 4, Georgia, serif'
    fontSize: '44px'
    fontWeight: 300
    lineHeight: 1.02
    letterSpacing: '-.04em'
  headline:
    fontFamily: 'Source Serif 4, Georgia, serif'
    fontSize: 'clamp(38px, 4.4vw, 62px)'
    fontWeight: 400
    lineHeight: 1.13
    letterSpacing: '-.04em'
  title:
    fontFamily: 'Source Serif 4, Georgia, serif'
    fontSize: '29px'
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: '-.025em'
  reading:
    fontFamily: 'Source Serif 4, Georgia, serif'
    fontSize: '18px'
    fontWeight: 400
    lineHeight: 1.65
  body:
    fontFamily: 'Hanken Grotesk, Arial, sans-serif'
    fontSize: '16px'
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: 'Hanken Grotesk, Arial, sans-serif'
    fontSize: '12px'
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: '.12em'
  metadata:
    fontFamily: 'Hanken Grotesk, Arial, sans-serif'
    fontSize: '12px'
    fontWeight: 400
    lineHeight: 1.5
  input:
    fontFamily: 'Source Serif 4, Georgia, serif'
    fontSize: '16px'
    fontWeight: 400
    lineHeight: 1.6
rounded:
  control: '6px'
  panel: '12px'
  pill: '100px'
spacing:
  '1': '.25rem'
  '2': '.5rem'
  '3': '.75rem'
  '4': '1rem'
  '6': '1.5rem'
  '8': '2rem'
  '12': '3rem'
  '16': '4rem'
  '24': '6rem'
components:
  button-primary:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.paper}'
    rounded: '{rounded.pill}'
    padding: '12px 22px'
  button-primary-hover:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.paper}'
  button-cream:
    backgroundColor: '{colors.field-ink}'
    textColor: '{colors.cream-button-ink}'
    rounded: '{rounded.pill}'
    padding: '12px 22px'
  button-cream-hover:
    backgroundColor: '{colors.cream-button-hover}'
    textColor: '{colors.cream-button-ink}'
  button-text:
    textColor: '{colors.ink}'
    rounded: '4px'
    padding: '8px 10px'
  button-text-hover:
    backgroundColor: '{colors.surface-subtle}'
  input:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.input}'
    rounded: '{rounded.control}'
    padding: '12px'
    width: '100%'
  status-tag:
    textColor: '{colors.muted}'
    rounded: '4px'
    padding: '3px 6px'
  workspace:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.panel}'
    width: 'min(1320px, calc(100% - 64px))'
  workspace-tab:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.muted}'
    padding: '12px 2px'
  workspace-tab-selected:
    textColor: '{colors.ink}'
  ai-assistance:
    backgroundColor: '{colors.accent-soft}'
    textColor: '{colors.ink}'
    rounded: '0 6px 6px 0'
    padding: '18px 20px'
  human-reaction:
    textColor: '{colors.ink}'
    padding: '22px 0 22px 18px'
---

# Design System: Applied Research — Field Atlas

## Overview

**Creative North Star: "The Illustrated Field Atlas"**

Field Atlas brings the engraved scientific illustration and editorial character of the chosen World Labs inspiration into an original Applied Research identity. Mineral blue holds exploration; warm, opaque paper holds sustained attention. Source Serif 4 gives expression and reading one coherent voice, while Hanken Grotesk keeps tools precise.

The durable signature is the distinction between source material, AI assistance, and human writing, carried through type, surface, margin, and explicit labels. Density follows the work: open measures for a paper, compact metadata and controls around it. The illustrated arrival and this reference’s section sequence are surface decisions recorded in [DIRECTION.md](design-system/DIRECTION.md), not a required hero or page template for every screen.

**Key Characteristics:**

- Original engraved tree landscape and portrait artwork with an authored arch brand mark.
- Opaque reading and writing grounds with semantic daylight and evening variants.
- Serif source/human text, inset sans-serif assistance, and literal authorship/status labels.
- Quiet local feedback, visible initial arrival, and immediate reduced-motion equivalents.

This is a source-scan record of the implemented standalone reference in `design-system/`, dated 2026-09-05. The frontmatter records implemented primitives; semantic CSS in [tokens.css](design-system/tokens.css), final cascading rules in [styles.css](design-system/styles.css), and behavior in [app.js](design-system/app.js) are its source. The [case study](design-system/CASE-STUDY.md) explains design tradeoffs. Review disposition and evidence live in [finish-review.md](design-system/evidence/finish-review.md); this document does not declare final acceptance or full accessibility conformance.

## Colors

Mineral blue, warm paper, graphite, and human ink give each voice a distinct role without relying on color alone. Frontmatter values preserve the source hex strings; `evening-*` entries are the replacements activated by `data-theme="dark"`, not additional accents to mix into daylight.

### Primary

`field` is the illustrated-world ground and opaque backing for workspace labels; `field-ink` is its warm pale foreground. These two roles remain unchanged in evening. `accent` supplies action, source inspection, selected state, and AI labels; `accent-soft` bounds assistance. In daylight, field and accent share mineral blue. In evening, accent and focus become pale blue while the illustrated field remains blue.

### Secondary

`human` is human ink, applied to author labels, composition margins, and the caret. `human-soft` supplies selected passage/text backgrounds. Evening uses lighter warm author ink and a darker warm inset. These roles identify authorship, not warning or success.

### Neutral

`paper` is the environment and tool-rail ground; `surface` is the main reading/input plane; `surface-subtle` separates supporting areas. `ink` carries primary text, `muted` metadata, `line` dividers, and `line-strong` field/tag outlines. Evening replaces each role explicitly rather than inverting the page. Cream action foreground/hover colors are scoped to illustrated surfaces.

`success` and `danger` carry saved/attention states alongside explanatory text. `focus` is the keyboard outline. Flat semantic pair contrast evidence exists in `design-system/evidence/contrast.json`; it does not establish contrast over every image crop.

**The Three Voices Rule.** Source material, AI assistance, and human writing must remain distinguishable through words as well as visual treatment. Authorship and source verification are separate labels.

**Preview ramp metadata.** Sidecar tonal ramps are synthesized OKLCH lightness steps for palette inspection only. The implementation uses the exact frontmatter colors; no tonal ramp is added to its CSS.

## Typography

**Reading and display:** Source Serif 4, Georgia, serif. Local normal weights 300, 400, and 600 plus 400 italic.

**Interface and metadata:** Hanken Grotesk, Arial, sans-serif. Local normal weights 400, 500, and 600. Both families use `font-display: swap`; [fonts.css](design-system/fonts.css) resolves to seven TTF files in `design-system/assets/fonts/`, with both SIL Open Font Licenses alongside them. No third font family is required; incidental code samples use the browser monospace default.

The serif spans expressive titles and long reading; italic adds a second register within that family. The sans keeps navigation, assistance, labels, and state information compact. There is no single mathematical type ratio: the implemented hierarchy is fluid by role.

| Role     | Application                                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Display  | Light serif with the frontmatter `display` values; use `display-narrow` at ≤760 px and `display-smallest` at ≤360 px. The resulting title range is 44–82 px with tracking no tighter than −.04em. |
| Headline | Regular serif, fluid section headings; line height 1.13.                                                                                                                                          |
| Title    | Regular serif; the base title role is supplemented by context-specific Reader/Workbench sizes in source.                                                                                          |
| Reading  | Paper prose remains 18 px / 1.65 and at most 64ch. Do not shrink it to fit mobile rails.                                                                                                          |
| Body     | Interface body at 16 px / 1.5; operational controls mostly 12–14 px.                                                                                                                              |
| Metadata | Primarily 12–13 px; muted color is semantic, not an excuse for unreadable labels.                                                                                                                 |
| Label    | Uppercase, tracked labels belong to actual source, author, or navigation metadata. They are not decorative preheadings.                                                                           |

Counts, timing values, type scales, code, and workspace status use tabular numerals. Text selection uses human-soft, and input carets use human ink.

## Layout

The general content container is `min(1232px, calc(100% - 88px))`; the workspace frame is `min(1320px, calc(100% - 64px))`. Desktop composition pairs asymmetry in editorial sections with stable rails around the Reader. The Reader uses `180px minmax(0, 1fr) 248px`; the central paper has a maximum container width of 850 px while prose keeps the reading measure. Workbench uses a `1.2fr 1fr` grid with a 64 px gap; the Playbook document is at most 720 px wide.

The spacing tokens span quarter-rem to six-rem steps as recorded in frontmatter. Source also uses measured local padding such as 12 px field interiors, 18–20 px AI insets, and 24 px workspace chrome. Do not force every observed one-off onto a fabricated universal scale.

At ≤1100 px, the Reader rail narrows to 150 px and the argument moves below into three columns. At ≤760 px, page gutters become 22 px, the workspace has 12 px outer gutters, the paper navigation hides, and Reader, Workbench, authorship, and craft sections stack. Paper prose stays 18 px. The header shrinks from 88 to 76 px; its last secondary navigation link and theme text hide, while the theme button retains an accessible name. At ≤360 px the header tightens and the hero title is explicitly 44 px. The current hero centers the title above the tree and anchors the landscape to the bottom. These are the observed breakpoints, not a claim that all production window sizes have been validated.

Original atlas art is retained in `design-system/assets/knowledge-tree.png` (1536 × 1024) and `knowledge-tree-portrait.png` (1024 × 1536). Runtime uses the matching `.webp` files. The portrait is separately art-directed for narrow atlas arrival/closing surfaces at ≤760 px, preserving continuous sky; the workspace retains landscape art. [TREE-ARTWORK.md](design-system/assets/TREE-ARTWORK.md) records generation provenance. These are original Applied Research images informed by the user's reference, not copied World Labs assets.

For the actual desktop app opening screen, the user approved `design-system/apple-landscape/apple-landscape.webp` on September 5, 2026. Use the live centered prompt and shared components demonstrated in `design-system/apple-landscape/index.html`, with the monumental apple tree, continuous mountain valley, luminous clouds and visibly falling apple. Earlier apple studies are superseded. The broader system selection remains provisional. See [the approved brief](design-system/apple-landscape/BRIEF.md) for prompts and contrast verification; no narrow-screen version of this artwork is approved yet.

## Elevation & Depth

Opaque tonal layering, fine dividers, and nested reading surfaces supply most depth. Shadows are reserved for the workspace boundary and transient toast. The workspace uses `0 16px 40px #122a3933`; the toast uses `0 8px 30px #10202b26`. A native dialog places an opaque surface over a `#0d273bb8` backdrop. No blur or moving background is needed to communicate layering.

**The Reading Ground Rule.** Keep sustained reading, sources, and composition on opaque surfaces. Place illustration around the work and protect image-adjacent labels with a solid ground.

## Shapes

Fields use the control radius, the main frame/dialog the panel radius, and deliberate primary actions the pill radius from frontmatter. Local text buttons/tags use 4 px corners; passage controls have a 7 px enclosing outline with 4 px child controls; AI surfaces use a square left edge and 6 px right corners. Most structural divisions are 1 px. Inputs use line-strong so boundaries remain visible.

The brand mark is an authored inline SVG: two nested arches on one baseline, a 32 × 36 viewBox, and 1.5 px currentColor strokes. Control icons use one authored 24 × 24 SVG family with 1.5 px strokes and round caps/joins, typically rendered at 16 px (larger for theme and close controls). Decorative SVGs are hidden from assistive technology while their controls retain names. Mathematical symbols remain content.

**The Human Margin Rule.** Warm 2–3 px margin rules identify human thought and are paired with literal authorship wording. This accepted reviewer exception is semantic; it is not a border treatment for miscellaneous cards.

## Components

### Buttons and navigation

Primary actions are compact, deliberate pills: ink on the environment's reversed text pair, changing to accent on hover. Cream actions sit on the illustrated field and have their own fixed foreground/hover pair. Standard actions have a 46 px minimum height; the small variant has a 40 px minimum with 10 px 17 px padding. Text buttons are quiet local actions with a subtle-surface hover. Disabled buttons use .5 opacity and a not-allowed cursor; active enabled buttons move down 1 px.

Focus is a 2 px outline with 4 px offset; illustrated-surface focus uses field-ink. Button/link color and border feedback uses the press timing. The source implementation includes smaller passage/citation targets, so do not claim a universal 44 px target minimum.

Workspace navigation uses text tabs on paper, a 2 px accent underline for selection, aria-selected, and roving tabindex. Arrow keys cycle tabs; Home/End select the extremes. Header links use an underline and accent on hover. Paper links are anchors without a falsely fixed current-section indicator.

### Fields and human composition

Textareas use the reading family at 16 px / 1.6, a surface fill, line-strong outline, 12 px padding, control corners, vertical resize, and a 90 px minimum height. Placeholders use muted ink at full opacity. Native selects share the surface and outline with 9 px 30 px 9 px 10 px padding. Checkboxes/radios use accent and remain native controls.

The human composer has a warm 3 px margin, literal “Your note/counter/idea” labeling, and a live draft-status line. Note/Counter/Idea expose aria-pressed; Explain uses aria-expanded. Saving becomes available for nonempty text. The reference saves reaction text after trimming its outer whitespace; production byte-preservation requirements still require their own implementation.

### Source, assistance, and human reaction

Source prose uses the open serif reading plane and a locator. The example is explicitly a study paraphrase. AI assistance is a sans-serif inset with accent-soft fill, a 1 px accent rule, 18 px 20 px padding, literal author label, source control, and explicit status. Human reaction rows use a 3 px human margin, 19 px / 1.55 serif text, author/kind wording, and a source-return action. A 4 px outlined status tag is quiet metadata; it is not automatically an interactive chip.

Source preview and preferences use native modal dialogs with constrained width, opaque surface, close control, Escape behavior, and native focus return. The source dialog provides a fixed paper identifier, section, paraphrase disclosure, and original-PDF link. It is not a live verifier.

### Workbench, Playbook, and feedback

The reference keeps reactions in browser localStorage, shows newest first, and filters by kind. It distinguishes an empty project from an empty filtered view. A thesis remains a draft until claim, evidence selection, and falsifier exist; editing a completed thesis returns it to draft. Playbook renders the same human state alongside a disclosed fixed AI fact. Export prepares sample Markdown with authorship, event references, source identifiers, and open questions. Its message says the file was prepared, not that the operating system saved it.

Persistence failure is labeled “Session only”; feedback appears in an aria-live status region and a 4.5 second toast. Ready, waiting, unsupported, and failed assistance states are manually selectable specimens with no network request. Preferences disclose local demo scope and confirm reset before clearing the example. Production ingestion, span verification, AI services, vault access, secret handling, multi-paper filters, idea promotion, and the multi-file Context pack remain requirements in [the current product direction](PRODUCT.md).

Motion uses 150 ms press feedback, 220 ms reveal/settle, and 700 ms one-time arrival with `cubic-bezier(.22, 1, .36, 1)`. Arrival begins already visible at opacity .8 and translateY(12px), ending at opacity 1 and zero translation. Local settle begins at opacity 0 and translateY(6px); this is a local state reveal, not a blank initial page. Reduced-motion sets duration tokens to zero, removes animations/transitions, and switches smooth scrolling to immediate. There is no ambient motion.

## Do's and Don'ts

### Do:

- Do use the existing semantic tokens and their evening replacements together.
- Do retain source locators, literal authorship labels, and explicit uncertainty or verification status.
- Do keep paper reading at 18 px / 1.65 with a maximum measure of 64ch and reflow its surroundings.
- Do use the local two-family font system, original art variants, and authored SVG icons.
- Do keep a draft before it is complete, and distinguish draft persistence from judgment or verification.
- Do make reduced-motion state changes immediate and keep focus visible.

### Don't:

- Don't place decorative imagery behind sustained reading, sources, or writing fields.
- Don't infer authorship, correctness, or mastery from color, activity, or a saved state.
- Don't add ambient movement or repeated ornamental section entrances.
- Don't add decorative heading kickers or meaningless numbering; preserve metadata with a real source, author, or state role.
- Don't turn the reference's illustrated hero and story sequence into a required layout for every product surface.
- Don't describe local storage, the fixed explanation, or sample Markdown download as production vault, AI, ingestion, or Context pack functionality.

## Development scope

This document specifies the visual reference. Workbench grids, counter/idea actions, sample persistence, and paper-only flows describe historical specimens. Current product behavior is governed by [PRODUCT.md](PRODUCT.md); application responsibilities are in [architecture](docs/architecture.md). Do not port the historical event schema or tab hierarchy into the learning workbench.
