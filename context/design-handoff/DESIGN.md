---
name: Applied Research — Round 2
description: Founder-directed desktop prototype combining Lamp & Margin typography and color with Field Atlas control composition.
colors:
  canvas: '#080a0c'
  ground: '#0c0f12'
  surface: '#14181c'
  surface-hover: '#1d2328'
  line: '#22272c'
  ink: '#eceae4'
  muted: '#a9a6a0'
  warm: '#fbd094'
  human: '#efe6cf'
  cold: '#7bc7c9'
  cold-fill: '#56b6b9'
  on-cold: '#0c0f12'
  passage: 'rgba(251,208,148,.13)'
  light-canvas: '#efece5'
  light-ground: '#fbfaf7'
  light-surface: '#f3f1ec'
  light-surface-hover: '#eae6dd'
  light-line: '#cdc8be'
  light-ink: '#1c1b18'
  light-muted: '#5a574f'
  light-warm: '#a8742a'
  light-human: '#1c1b18'
  light-cold: '#005a5d'
  light-cold-fill: '#c7edee'
  light-on-cold: '#1c1b18'
  light-passage: 'rgba(245,229,168,.32)'
  opening-scene: '#1a433d'
  opening-ink: '#fff9ed'
  opening-option: '#0c0f12eb'
  opening-return: '#0c0f12e8'
  opening-return-hover: '#18232bef'
  opening-projects: '#0c0f12d9'
  opening-selected-ink: '#172a35'
typography:
  keyboard-hint:
    fontFamily: 'ui-monospace, monospace'
    fontSize: '11px'
    fontWeight: 400
  navigation:
    fontFamily: 'Martian Mono, monospace'
    fontSize: '12px'
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: '.08em'
  metadata:
    fontFamily: 'Familjen Grotesk, sans-serif'
    fontSize: '12px'
    fontWeight: 400
  control-label:
    fontFamily: 'Familjen Grotesk, sans-serif'
    fontSize: '13px'
    fontWeight: 400
  supporting-body:
    fontFamily: 'Familjen Grotesk, sans-serif'
    fontSize: '14px'
    fontWeight: 400
  headline:
    fontFamily: 'Newsreader, serif'
    fontSize: '22px'
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: '0'
  section-title:
    fontFamily: 'Newsreader, serif'
    fontSize: '22px'
    fontWeight: 500
    lineHeight: 1.3
  reading:
    fontFamily: 'Newsreader, serif'
    fontSize: '18px'
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: 'Familjen Grotesk, sans-serif'
    fontSize: '14px'
    fontWeight: 400
    lineHeight: 1.5
  playbook-title:
    fontFamily: 'Fraunces, serif'
    fontSize: '40px'
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: '-.01em'
    fontVariation: "'opsz' 144, 'SOFT' 40, 'WONK' 1"
  canvas-content:
    fontFamily: 'Newsreader, serif'
    fontSize: '26px'
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: '0'
  project-name:
    fontFamily: 'Fraunces, serif'
    fontSize: '18px'
    fontWeight: 400
    lineHeight: 1.3
    fontVariation: "'opsz' 144, 'SOFT' 40, 'WONK' 1"
rounded:
  control: '6px'
  grouped-control: '8px'
  panel: '12px'
  pill: '100px'
spacing:
  action-gap: '8px'
  row-gap: '12px'
  panel-inset: '24px'
  page-inset: '48px'
components:
  button-primary:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.ground}'
    rounded: '{rounded.control}'
    padding: '10px 15px'
  button-primary-hover:
    backgroundColor: '{colors.cold-fill}'
    textColor: '{colors.on-cold}'
  canvas-node:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.panel}'
    width: '300px'
  canvas-node-button:
    padding: '24px'
    typography: '{typography.canvas-content}'
  field:
    backgroundColor: '{colors.ground}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '10px 12px'
  explanation:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.panel}'
    padding: '14px 20px'
---

# Design System: Applied Research — Round 2

Portable-copy note: this specification describes the source review prototype. The [portable specimen](prototype/index.html) removes its review service and real user notes; the original labeled synthetic fallback remains. Refer to [DESIGN-CONTRACT.md](DESIGN-CONTRACT.md) for authority and unresolved decisions.

## Overview

This is a descriptive snapshot of the assembled Round 2 prototype, not approval of the final product or a replacement for the application design contract. The selected direction combines Claude/Lamp & Margin typography and colors with Field Atlas rounded controls and stroke icons. The original apple landscape anchors the opening. The later [Reader typography and surface correction](../design-references/decisions/2026-09-07-reader-typography.md) pins a darker, continuous Reader ground and smaller text using the original Claude type artboard. This is a bounded correction; the Insights/Sources flow and full desktop design remain under review. No additional brand metaphor is asserted as a founder decision.

The [submitted direction](../design-session.md) and [exact Round 1 snapshot](../design-references/decisions/2026-09-07-round-1.json) establish the preference. The [presearch](../presearch.md) and [product context](../product.md) retain authority over behavior. Typography and palette are shared by Reader, Canvas and the remaining desktop surfaces; review controls sit outside the product.

Key characteristics:

- Editorial reading typography with compact, rounded interface controls.
- Warm passage and human-writing accents alongside cool interactive accents.
- Insights written within Reader or practical work, then related on Canvas and in Playbook.
- Full desktop scope, with release priorities presented as proposals.

## Colors

The frontmatter records the actual theme values from `styles.css`; dark tokens are the defaults, and corresponding `light-*` tokens replace them in light mode. The original apple artwork and its authored overlays retain their own scene colors, now explicitly recorded as `opening-*` tokens. The dark option, returning-project and project-navigation backplates are translucent CSS colors, not a second application theme. Cream text and underline sit over the artwork; the underline changes from .52 to full opacity on focus. Text shadows use `#10262a` for the input, `#12323b` for the placeholder and `#0008` for the brand. Image pixel colors are not interface palette tokens. Removed hint styling and overridden old underline rules remain in the source but do not describe rendered components; detector matches against those rules are advisory.

`cold` marks links, interactive emphasis, focus and active connections. Primary actions rest in `ink` against `ground`, changing to `cold-fill` on hover. `warm` identifies the short human-note marker, while `passage` highlights selected reading text. Human authorship must also be written explicitly; color alone does not establish provenance.

The neutral stack runs from `canvas` through `ground` to `surface`. Reader, its rail and the product sidebar share `ground`; the desktop rail is flat and no longer has a separating line. The later [divider annotation](../design-references/decisions/2026-09-07-divider-annotation.json) supersedes the earlier structural-divider treatment across the prototype. `line` remains available for fields, outlined actions, meaningful Canvas node outlines and graph connections. The pinned screenshot includes a display color profile, so sampled screenshot RGB values are not promoted to CSS tokens. `muted` is for secondary information, never a reason to hide essential state. Light mode reverses the tonal stack without changing component meaning.

## Typography

Local font files in `fonts.css` supply Familjen Grotesk 400/500/600, variable Newsreader regular/italic 200–800, variable Fraunces 100–900 and variable Martian Mono 200–800. These are actual variable files rather than static fonts styled with unavailable weights. Asset provenance is retained alongside the local font files.

Newsreader carries Reader headings at 22px/1.3 weight 500 and reading, human notes and the rail composer at 18px/1.55 weight 400, with optical sizing enabled. Reading keeps a 68ch maximum measure and 20px paragraph spacing. Explanation questions use italic Newsreader at 18px/1.55; explanation body copy uses Familjen Grotesk at 14px/1.5. The base UI is 14px/1.5, with 13px control labels and 12px attribution, note footers, source detail and tab counts. System monospace keyboard hints remain 11px.

Martian Mono is used at 12px/1.4, weight 400, uppercase with .08em tracking for topic group labels, Canvas captions and Reader tabs; the stacked workspace navigation uses Familjen Grotesk at 14px. Familjen Grotesk tab counts reset the tracking. Fraunces carries project names at 18px/1.3 and page briefs/Playbook titles at 40px/1.1 with -.01em tracking, using `opsz` 144, `SOFT` 40 and `WONK` 1. These larger brief titles reduce to 32px at 820px and below; they do not restore the former oversized Reader heading. Opening prompt typography remains the established 36px, reducing to 32px in narrower windows.

## Layout

A 54px review bar sits above the product. The desktop product uses a 280px topic sidebar and a flexible stage. Opening removes the sidebar and fills the available height with the landscape. Its real textarea sits centrally in a form no wider than 540px, with the entry options below.

Standard pages have a 1060px maximum width and 48px side padding. Reader uses a 1158px maximum layout with a reading column up to 710px, a 280px sticky Insights/Sources rail and a 44px gap. The layout has 32px top/side padding; the rail retains 24px left padding and 20px vertical content padding after removal of its divider, with its own scrollable content region. Practical work pairs the experiment with a 300px guidance region. Canvas uses an unbounded transform camera on a dotted plane with no document scrollbars. Distilled insights contain their linked notes/questions; Expanded arranges the learning path, source highlights, notes/questions and insights in columns. Unmoved cards use measured heights to avoid overlap, and curved connections follow card bounds.

At 1150px and below, practical guidance moves below the experiment. At 1000px and below, Reader becomes one column; its rail opens as a 320px fixed overlay, inset 16px from the right, with a close control. The overlay is hidden until opened. In the September 8 sidebar revision, the 280px learning outline remains visible at 820px; its topic list scrolls independently. Playbook columns stack and page padding tightens. The older 64px icon-only rail is removed. Canvas supports unrestricted pan, 20–150% zoom and Fit map. Low zoom is an overview; users zoom in to read. Each detail view retains its zoom and camera position during the page session. These adaptations support narrower desktop windows; this prototype does not establish a finished mobile product.

## Elevation & Depth

Spacing and surface differences separate structural regions. Thirty structural border declarations were removed across the sidebar, headers, Reader rail, list rows, sections, tool frame, guidance area and review shell, while existing spacing was maintained. The desktop Reader rail and sidebar share the article ground without a shadow or structural divider. Fields, actionable outlined controls, semantic Canvas node borders and curved graph edges remain. At 1000px and below, the open rail becomes a rounded 12px overlay with 16px padding and the standard theme shadow. Canvas inspection and dialogs use the theme shadow: `0 12px 40px #0005` in dark mode and `0 12px 40px #29231c20` in light mode. The review drawer uses a separate lateral shadow, `-12px 0 40px #0003`, because it belongs to the review shell. Dialog backdrops use `#080a0c99`.

Motion is local to the changing content. The opening placeholder fades, rises 12px and blurs 3px over 220ms with `cubic-bezier(.22,1,.36,1)` when text appears. Clicking or focusing the opening input lifts it 2px over 360ms and grows its underline from 84% to full width, increasing the line from 1px to 2px. The input no longer autofocuses, so the focus transition begins with user interaction. An explanation reveals below its passage over 220ms. The loading trace loops every 1.6 seconds; it is a state specimen, not measured generation progress. Reduced-motion preference disables animations and transitions and removes the placeholder blur. Button presses move down 1px. No spring or automatic camera movement is implemented.

## Shapes

Controls use 6px corners; grouped passage actions, visual frames and segmented settings use 8px. Explanation panels, concept nodes, dialogs and the review drawer's companion surfaces use 12px. The revised board uses restrained 12px card corners, source highlights on ground, insights with a subtle warm surface, and dashed question outlines. Nested notes use 8px corners. Opening options and compact priority badges use pill silhouettes. Icons have rounded caps and joins with a 1.5px stroke, usually inside a 19px square.

Canvas is the principal place for independent cards. Reading remains a flowing article with embedded explanations and human insights in its adjacent rail, without a spine or path bar. Short vertical note markers are attribution accents, not a navigation spine.

## Components

### Actions and fields

Primary controls pair an action label with an optional icon and 8px spacing. Outlined controls use `line`; quiet controls use `muted` until hover. Hover changes the surface and interactive ink. Disabled buttons reduce opacity to .45. Focus-visible receives a 2px `cold` outline with a 3px offset. Inputs and textareas use `ground`, a 1px border, 6px corners and a cool caret.

### Opening input

The scene contains the actual topic textarea, declared as one row and 65px high (60px in the narrower layout), with 12px top and 10px bottom padding. The placeholder aligns 12px from its top; this replaces the original oversized gap above the line. Its decorative placeholder reads “I want to learn about…” and leaves when typing begins. Topic, project and source options change the selected mode; source mode reveals a URL field. The explanatory prototype hint beneath the options has been removed. The September 8 portable revision groups “Your projects” and the fully clickable returning-project row directly beneath the input and options in a shared 540px maximum-width flow. A single dark surface groups returning work; the earlier corner navigation is removed. The source field and growing input push the project group down without overlap, and short windows scroll. The founder approved this revised Opening assembly on September 8; other screens remain review candidates. See DESIGN-CONTRACT.md for the revision-specific receipt. All submissions currently open the same robotics example. Input text and source URLs are not processed into a curriculum.

### Reader explanation and writing

Passage actions open an inline explanation, a Note composer in the Notes rail, or a deeper explanation. Selecting source text exposes a contextual Note button. The composer preserves the exact highlight while the learner summarizes in their own words. Saved notes appear separately from insights. The Insights tab lets the learner connect two or more saved notes/questions; notes keep their source highlights and questions keep their origin. The Sources tab opens source previews and synthetic reading examples. All three tabs support left/right arrow navigation. The explanation panel uses reduced 14px vertical/20px horizontal padding and can collapse, reopen, display a follow-up, and preview waiting, failed, unsupported or text fallback states. Source preview is a compact dialog with a direct external resource link. AI-authored examples, human insights and captured results carry separate text labels. The redundant “Working explanation” metadata string is removed; concise AI labels remain on explanation content and human authorship labels remain on recorded insights.

### Canvas

Canvas automatically reduces the 280px topic sidebar to a 64px icon rail; Reader and other workspace views restore the full outline. A Return to reading icon preserves access to the reading context. Workspace icons, Find and the bottom profile retain accessible names and native tooltips. Profile Settings opens beside the rail. A single 48px top bar contains history, project identity, Distilled/Expanded and primary actions; the former toolbar and caption rows are removed. The illustrative-map label moves to a quiet bottom corner. At narrow desktop widths the project subtitle hides while the mode controls remain available.

The September 8 Heptabase-inspired revision preserves content-first cards and uses two views of the same records. Distilled shows each insight with collapsible supporting notes/questions inside it. Both views include the learning path’s topic/chapter nodes. Expanded reveals topic/chapter → note/question → insight connections alongside exact source highlights; practical observations remain separate. With no human entries, a clearly labeled illustrative map demonstrates the structure without creating saved notes or insights.

Card wording uses 24px/1.4 Newsreader, nested notes 17px/1.45 and source quotations 20px/1.45. Wording wraps in full. Source links navigate to the exact highlighted passage in generated lessons or imported text. The source is added to the sidebar when needed. Missing or changed text is reported instead of silently highlighting another passage.

Dedicated drag handles move cards; arrow keys on a handle move it 20 canvas pixels. Background dragging pans. Trackpad/wheel input pans; Ctrl/Command plus wheel zooms around the pointer. Arrow keys on the focused canvas pan by 80 pixels, +/− zoom and Home fits the map. Camera coordinates and dragged cards can cross zero without clamping. World-aligned dots use a 24-unit pitch, increasing by powers of two at low zoom to avoid visual noise. Zoom spans 20–150%, with Fit map for an overview. Card positions and each detail view’s viewport survive navigation during the page session. Measured heights prevent initial content overlap; explicit user positions are retained. Source highlights and note links remain independently clickable. Canvas inspection exposes the relevant notes and source context.

Workspace headers provide back/forward, Explore and Add source. Exploration saves a question and its origin, with an explicit unconnected-response state. Pasted source text opens in the same Reader and can be annotated; file/URL extraction and live retrieval are unimplemented. Sources and exploration questions appear in the persistent outline. The paper argument graph is roadmap work awaiting the teammate’s interface. Canvas assembly and its new navigation remain under visual review.

### Practical work and Playbook

The wheel-ratio slider changes illustrative geometry. Capture records that ratio and its limitation. The external flow accepts a result URL and observation; the URL remains visible in its receipt and in Playbook. Guidance has an explicit start/stop control and never observes the screen in this prototype. Playbook gathers insights, captured evidence, an example thesis and checkable next steps. Markdown export preserves the insights, result URLs and attribution, example working thesis, source and checked next steps; it remains an illustrative learning record rather than a full project backup.

### Navigation and review

The September 8 portable revision replaces the separate Learning Path page with a persistent 280px topic/concept sidebar. Native disclosures group learning items; selecting one opens the matching Reader layer or practical flow. Unbuilt topics are explicitly labeled previews. Open groups persist across workspace changes, with the last reading item retained and aria-current restricted to active destinations. Canvas, Practical and Playbook use vertically stacked icon-and-label rows beneath the project title, above the independently scrolling outline. The bottom Your profile control opens a native popover containing Settings; Find remains separately available. Workspace rows use 14px Familjen Grotesk in sentence case. The profile is a generic prototype control, not a signed-in account. Escape and outside clicks dismiss the popup; choosing Settings closes it and focuses the workspace. The finder opens with Cmd/Ctrl+K and searches the eight assembled prototype views, not arbitrary project content. The portable review shell contains a screen selector; the original private source review controls remain historical.

The seven [Round 2 annotations](../design-references/decisions/2026-09-07-round-2-annotations.txt) drive the revised opening and Reader rail. Three real user insights remain only in the original private review prototype. They were removed from this portable handoff. They are user work, not reusable example/fixture copy, and must not be repurposed into application fixtures. This preservation snapshot does not establish persistence for future interactions.

## Do's and Don'ts

- **Do** retain the selected typography and palette across Reader and Canvas.
- **Do** use rounded control composition and restrained stroke icons consistently.
- **Do** write insights in context and show practical evidence alongside conclusions and next steps.
- **Do** label example content, AI contributions and human writing distinctly.
- **Do** preserve the original references and submitted review snapshots.
- **Do** use spacing and surfaces to distinguish structural regions; retain outlines only where they identify controls or node meaning.
- **Don't** restore separate academic Writing/Workbench screens, a Reader spine or a path bar.
- **Don't** treat a kept inspiration reference as an application screen or restored historical behavior.
- **Don't** claim that illustrative geometry proves real-world robot behavior or learner mastery.
- **Don't** treat this prototype, its coverage table or proposed MVP priorities as final approval.

### September 8 notes-first insight revision

Highlight source text and click the contextual Note action to write an own-word note. The saved note retains its exact source highlight and provenance. Reader has separate Notes, Insights and Sources tabs. Notes are saved before being linked; the insight composer selects at least two saved notes/questions and records the learner’s connection. A source-passage chooser supports keyboard access and synthetic imported/discovered source examples, and creates a note rather than an insight.

Note and insight drafts are independent and survive workspace/tab changes. Saved insights show the linked note wording first, with expandable source highlights beneath each note. Canvas inspection, Playbook and Markdown export retain the insight → notes → source-text chain. Practical observations remain separately attributed and are not selectable as source notes. Source examples are synthetic; file/URL extraction, live retrieval and versioned persistence are not implemented by this specimen. Pasted source text has temporary session IDs and can be read and annotated.
