# Assessment B — technical and browser evidence

Target: `docs/designs/Design System Canvas Setup`, both exported Applied Research documents. This assessment was performed independently of Assessment A and did not read its findings. Originals were not edited. Source anchors below use **DS** for `Applied Research - Design System.dc.html`, **Screens** for `Applied Research - Screens.dc.html`, and **runtime** for `support.js`, all in the target directory.

## Scope and overall finding

These are exported design canvases, with eight design-system sections and 28 screen artboards, not an implemented application. The design system is unusually explicit about provenance, semantic tokens, states, and motion. The strongest actionable technical finding is that the documented non-text-only `ink-3` token is used extensively for actual small text in both themes. The strongest screen-state finding is that map-state cues and explanatory copy no longer agree after the lamp/wash removal. Several counts and contextual panels also contradict their artboard's state.

The lack of working Save, search, or citation interactions is a prototype limitation, not evidence that the future product's backend is broken. It does mean this export cannot demonstrate keyboard operation, screen-reader provenance, real error recovery, data persistence, or motion performance.

## Deterministic detector — preserve these results

The detector was run exactly once:

```sh
node /Users/aaryan/.agents/skills/impeccable/scripts/detect.mjs --json 'docs/designs/Design System Canvas Setup'
```

Exit status: **2**, findings present. Raw output: `docs/designs/review-evidence/detector.json`. **25 findings, all warning severity, all category `slop`.** The stderr warning said HTML parser modules `htmlparser2`, `css-select`, `css-tree`, and `domutils` were unavailable. It fell back to regex matching; custom properties, selector matching, and computed contrast were **not** evaluated. This is an undercount and cannot establish accessibility compliance.

| Rule | DS count and source lines | Screens count and source lines | Total |
|---|---|---|---:|
| `side-tab` — Side-tab accent border | 6: 54, 85, 96, 109, 404, 484 | 1: 466 | 7 |
| `overused-font` — Overused font | 6: 128, 135, 150, 501, 709, 14 | 9: 31, 43, 96, 152, 208, 606, 627, 821, 14 | 15 |
| `aphoristic-cadence` — Aphoristic-cadence copy | 1: line 0, aggregate of 9 constructions | 1: line 0, aggregate of 4 constructions | 2 |
| `radial-halo` — Radial-gradient background halo | 1: 242 | 0 | 1 |
| **Total** | **14** | **11** | **25** |

Line 0 is the detector's file-level aggregate marker, not a usable source line. Font findings count occurrences, not 15 distinct typefaces or 15 independent design failures.

### Contextual adjudication

- **Seven side-tab findings: reject as generic-style criticisms.** The 3px rule is the explicit human-authorship signal in the domain model, paired with reading type and an outdent; it is not a decorative card accent. DS 54, 85, 96, 404, 484 and Screens 466 deliberately implement that rule. DS 109 is an explicitly labeled negative comparison, a pastel rule shown to fail contrast. Removing these borders because of the detector would damage provenance.
- **Fifteen Fraunces findings: weak heuristic, not evidence of generic design by itself.** Fraunces is confined mainly to project/Brief display use and represented in the type specimens; it works with Newsreader, Familjen Grotesk, and Martian Mono in a prescribed hierarchy. DS 709 is a small storyboard rendering, not a fifth uncontrolled production type role. Assess the composition rather than treating a font-family match as a defect.
- **Two aphoristic-copy findings: largely documentation-context false positives.** The sampled phrases are implementation restrictions such as “No fraction, no maximum” and “No toast.” These are reasonable design-system directives. Repeated prohibition-heavy prose can still make the handoff harder to read, but it is not equivalent to consumer marketing slop.
- **One radial-halo finding: false classification.** DS 242 is the explicitly *light-theme* wash-density specimen; its local `--ground` is `#FBFAF7`. The regex report calls it a dark-page halo because it cannot resolve local tokens/theme scope. Other lamp gradients in the system are intentional knowledge-state material. The separate issue is that the Screens file no longer renders those fields while continuing to refer to them.

## Browser evidence and runtime behavior

Fresh independent CUA tabs were created for DS and Screens at the supplied localhost URLs. DOM/AX inspection and native screenshots covered the DS entry, screen inventory, reader `s7`, and light map `s6`; source and DOM inspection covered dark/light map, reader, nested reader, saved, skipped-calibration, and empty states. This was not a full assistive-technology or production-app test.

| Observation | DS | Screens |
|---|---:|---:|
| Native buttons | 0 | 0 |
| Inputs/textareas | 0 | 0 |
| Focusable selector matches (`a[href]`, button, input, textarea, tabindex) | 8 | 0 |
| Heading elements (`h1`–`h4`) | 0 | 0 |
| `role`, `aria-label`, or `aria-live` elements | Not separately counted | 0 |
| Document title | Empty | Empty |
| Browser viewport width | 1280px | 1280px |
| Document scroll width | 1536px | 1576px |
| Captured warning/error console messages | None | None |

The DS's eight focusable elements are its artboard anchor links. Screens actions appear in the accessibility tree as text, with decorative SVGs as unnamed images. Clicking **Start from a paper** in `s1` left its content unchanged and did not open an input or drop state. The control was a `SPAN`, 74.09 × 32px in this rendering; the shown drop state already exists separately as `s2`. Screens has an empty `renderVals()` and no application event handlers (Screens 879–882). DS only exposes theme and body-size properties to the design-canvas host (DS 753–761), not visible standalone controls.

There is real *hover styling*: Screens contains 513 `style-hover` attributes and DS 54. The runtime translates these into CSS pseudo-class rules (runtime 426–428, 1567–1588); the Screens DOM contained 11 deduplicated hover rules. This avoids incorrectly calling all visual state support dead. But hover styles do not turn spans into buttons or implement the actions. Focus and active appearances in the component matrix are static inline styles. There are no `style-focus`, `style-active`, `tabindex`, or ARIA attributes in either document.

The runtime successfully loaded and fonts reported `loaded` in the inspected DS tab. Both documents import the four Google Fonts families (line 14). `support.js` loads React 18.3.1 and ReactDOM from unpkg (runtime 1143–1146, 1838–1846). It hides the raw `<x-dc>` template before loading React, then logs and throws on boot failure (1818–1822, 1906–1910). Thus the export depends on network availability for its runtime, and has no visible boot-error fallback in this code path. No such failure occurred in this run; offline behavior was inferred from source, not simulated.

### Overlay and visibility accounting

The documented Playwright `evaluate` capability is explicitly read-only. No supported mutable script-injection API was available. Consequently title mutation, detector script append, `[Human]` overlay presentation, and browser-console detector injection were not performed. **No user-visible detector overlay exists.** Native screenshots, computed DOM styles, source inspection, and CLI output supplied the fallback evidence. A `visible:false` option was rejected for the second tab with “IAB visibility is not supported in a subagent thread”; the fresh tab was then opened without a visibility override. Visibility was not asserted. No separate impeccable detector live server was started. The parent owns the supplied static-server cleanup.

## Quantitative contrast — actual token pairs

Calculated from DS token declarations at lines 16–17 using sRGB relative luminance and `(lighter + .05)/(darker + .05)`. Passage colors were alpha-composited over ground before calculation. Full unrounded values and token strings are saved in `docs/designs/review-evidence/contrast.json`.

| Pair | Dark | Light | Interpretation |
|---|---:|---:|---|
| ink-1 / ground | 15.975 | 16.500 | Strong normal text contrast |
| ink-2 / ground | 7.915 | 6.912 | Pass normal text AA |
| ink-2 / surface | 7.347 | 6.391 | Pass answer/citation text AA |
| **ink-3 / ground** | **3.719** | **3.300** | **Fails 4.5 for small text** |
| **ink-3 / surface** | **3.452** | **3.051** | **Fails 4.5 for small text** |
| human-ink / ground | 15.457 | 16.500 | Strong human writing contrast |
| human-rule / ground | 13.317 | 3.872 | Pass 3.0 non-text threshold |
| cold / ground | 9.934 | 3.645 | Dark text passes; light is restricted to non-text |
| cold / surface | 9.221 | 3.371 | Same restriction |
| text / actual primary-hover | 8.042 | **7.678** | Both pass; light uses cold-deep |
| on-cold-fill / cold-fill | 8.042 | 13.759 | Pass, but light cold-fill is not actual primary hover |
| ink-1 / composited passage | 12.191 | 15.530 | Pass reacted passage text |
| hairline / ground | 1.276 | 1.238 | Weak if relied on as essential boundary |
| surface / ground | 1.077 | 1.081 | Very subtle surface separation |

The intentionally rejected pastel rule `#E9CF6A` on `#FBFAF7` is **1.480:1**, matching the stated failed example. It should not become a critique finding against the recommended sepia system.

**[P1] The `ink-3` rule is violated in real screen content.** DS 254 correctly labels ink-3 as non-text-only, but screenshots/DOM show it on 12px/400 Martian Mono “Sources · by depth”, source author/year “vaswani 2017”, unread map labels “linformer”, and the inactive reader tab “Annotations.” The actual computed colors are `rgb(111,109,104)` in dark and `rgb(142,138,128)` in light. Source examples: Screens 88–89 (source labels/metadata), 103 (unread map label), 200–201 and 215 (light equivalents), 273 and 309 (reader tabs). Inactive tabs and unread titles remain usable information, not disabled-control exemptions. Use ink-2 for meaningful small text, reserving ink-3 for borders or genuinely disabled controls. The same issue affects the DS's own small specimen labels and explanatory annotations.

**[P2] The contrast audit contains a stale role mapping.** DS 254 calls light `text on cold-fill` 13.8:1 “primary hover,” but revised primary hover uses `#005A5D` with `#FBFAF7` text, correctly measuring 7.678:1. The revised prose elsewhere states 7.7. This is not a contrast failure; correct the table so implementers copy the right pair.

WCAG caveats: normal text requires 4.5:1; large text can use 3:1; placeholders also count. Disabled controls and decorative text can be exempt. Calculations are not rounded for pass/fail; table values are rounded only for display. These are token checks, not a full conformance audit, and do not establish contrast over all blended/grained lamp positions. W3C reference: [Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Thin faces can look fainter than the nominal calculation; the actual 12px mono and light icon strokes warrant visual testing as well.

The hairline and surface numbers alone do **not** prove a WCAG failure: decorative separators need not reach 3:1, and provenance also uses position, typography, and the high-contrast human rule. Where a hairline is the sole essential control boundary or state cue, it needs stronger contrast. W3C reference: [Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

## Screen-state contradictions worth resolving

1. **[P1] Map state and the removed material no longer agree.** Screens 24 explicitly says lamp and wash fields were removed at review. Browser inspection found zero screen map descendants with screen blend or blur in `s4/s5/s6/s27`; the light map screenshot is plain ground and dots. Yet the system describes known territory as lamp/wash and hover as brightening/densifying it (DS 352–353, 723). Screens 822 says “Nothing here is on your edge yet — calibration skipped. Start where the light is.” The same artboard shows a **Your edge** line/label around Screens 833–835 and no light field. This is a concrete instruction/state contradiction, not an argument that the removed decoration must return. Decide the replacement knowledge-state encoding, update the system and every explanatory caption, and make skipped calibration show no established frontier.
2. **[P2] Saved and empty states contradict their navigation counts.** `s14` says “Saved to Insights · 7” (Screens 468) while the Workbench tab still says Insights 6 (450) and the sidebar ladder also remains 6 (448). `s28` shows Insights 0/Theses 0 in the tabs and “Theses held: 0” (873–874), but its sidebar still says Insights 6/Theses 2 (871). Counts are a primary status mechanism in this otherwise quiet design. Update all count locations from the same state specimen.
3. **[P2] Nested layers do not demonstrate contextual sidebars.** DS 733 specifies the right sidebar is always about what is in front of the reader. The 2-deep and 4-deep Screens artboards show Layer Normalization in the foreground (338 onward, 381 onward) but keep the same Scaled Dot-Product Attention claims and citations in the right sidebar (353–357 and 396–400). Either refresh the sidebar content in these states or explicitly label the retained context if that retention is intentional.
4. **[P2] Several documentation claims are ahead of their specimens.** Focus rings and 24px hit areas are clearly documented and illustrated in DS 531–532, but the ordinary marker specimens at 374–378 use 12 × 12px span boxes. These are not implemented targets and should not be certified from the overlay drawing. DS says mono minimum 12px (176), while motion thumbnails contain 10px mono labels and citations (702–711); treat this as scale documentation for thumbnails, not permission to ship 10px production coordinates.

## Component and state coverage

| Area | Visible/documented coverage | Important unproven or missing transition |
|---|---|---|
| Primitives | Both themes; primary/secondary/text buttons and UI/human fields in rest, hover, focus, active, disabled; focus ring and drawn hit-area examples (DS 511–663) | Native semantics, keyboard focus, state announcement, genuine input/validation, real target hitboxes |
| Selection and inline explanation | Toolbar, typing, streaming, open, collapsed; first-reader hint; three card-open frames (Screens s7/s8/s9/s26) | Selection anchoring, keyboard selection alternative, network failure/retry, stop generation, cancellation |
| Layer navigation | 1/2/4-deep, collapsed breadcrumb, origin passage, edge dots, left-rail collapse, three push frames (s10/s11/s12) | Esc return/focus restoration, scroll-position preservation, deep-stack stress test, contextual sidebar update |
| Map/discovery/calibration | Empty Brief, drag state, calibration with 3 choices, question/paper entry maps, light map, skipped calibration, result rows (s1–s6/s27) | Creation with entered text and Start, upload failures, no results, added/duplicate paper, replacement known-region cue, editable calibration |
| Workbench/reactions | Open/resolved counters, insight composition, save acknowledgment and Undo (s13/s14) | Cancellation, long input, save error, persistent undo/edit path, cross-view count consistency |
| Thesis/evidence | Incomplete Critique, Critique and Gap, removable citation objects, suggestion tray, stress-test frames; light thesis state (s15–s18) | Complete-save state, evidence removal validation, model/network failure, cancellation, non-expiring recovery |
| Playbook | Compiled document, Copy/Download, compile frames, empty state (s19/s20/s28) | Context pack content/state, copy/download completion, compile error, count integrity |
| Find | Dark/light finder, typed query and grouped results (s21/s22) | Empty/no matches, keyboard result selection, focus containment/restoration |
| Reading failure/content | Partial ingest, parse failure, inline equation (s23/s24/s25) | Real PDF crop/alt text, equation semantics, ingestion failure/retry, very long paper/heading handling |

DS's “19 components” is a deliberate catalog of domain patterns, not a claim that there are exactly 19 accessible controls. Screens' 28 artboards include four storyboard strips, multiple state variants, and only four light examples (map, reader, theses, finder). There is no mobile/read-only artboard in this export despite DS 744 explicitly limiting mobile to read-only paper. There are no responsive `@media` rules. Canvas overflow is expected from fixed 1440px artboards plus outer padding and should not be reported as a broken mobile application. The unresolved handoff requirement is to demonstrate the stated 1280px desktop minimum and the distinct mobile reader with reflow/zoom.

## Motion and accessibility handoff

The five signatures are card open, layer push, wash spread, stress-test landing, and Playbook compile. DS specifies 150/220/900ms and a reduced-motion end-state rule (667–673). Neither document has actual `animation:`/`transition:` declarations or a `prefers-reduced-motion` rule. This is appropriate to the explicit “Nothing here moves” storyboard format; it cannot validate interruptibility, below-eye-line reflow, or reduced-motion implementation. The runtime includes a generic 1.4s streaming placeholder shimmer (runtime 90–100), but it was not active in the inspected final render and must not be confused with a visible product loop.

There are small timing inconsistencies to fix before implementation: the system's 220ms layer push lands at “280ms” in one final frame (DS 689) and its 900ms wash spread lands at “~1100ms” (697). Screens' layer storyboard uses 220ms consistently. Either label an intentional delay or align those captions to the token durations.

Preserve the structural human/AI distinction, but define accessible names and relationships for authored content, citations, counters, tabs, and layers. A visual “no AI/YOU badges” rule does not prevent useful nonvisual attribution. Use native links/buttons/inputs, actual disabled semantics, selected tab state, heading landmarks, live status for save/streaming completion, and focus return for the finder/layers. These are production requirements; the canvas's zero interactive semantics should not lower a design-only score as if a shipped application had been tested.

The 24px target intent is aligned with WCAG 2.2 AA's target-size rule, subject to spacing and other exceptions; 44px is not a universal AA minimum. The current export does not verify actual usable targets. W3C reference: [Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). The five-second Undo is shown, but no persistent edit/revert route is specified; document that recovery path rather than asserting the timer alone is a conformance failure.

## Evidence status

Detector complete once in degraded regex mode; raw counts and source locations retained. Computed token audit complete. Native browser visual/DOM inspection complete on fresh independent tabs. No source modifications, no injected overlay, no extra detector server, no temporary viewport override, no claims of full end-to-end functionality or WCAG conformance. Parent should read this only after Assessment A is complete. This assessment's only completion message will report this file's path.
