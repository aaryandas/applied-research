# Field Atlas independent finish review

Review date: 2026-09-05. Reviewed by the independent finish-review agent. No UI source was edited by this reviewer.

## 1. Disposition

**Accept the design reference.** The original finish findings are now resolved. The desktop arrival, reading surface, and day/evening environments form a distinctive, coherent system. A bounded follow-up review confirmed the image-composition and craft-floor fixes in updated source and screenshots; no broader new defect hunt was performed.

This is a review of a functioning design-system reference. Production ingestion, AI service integration, Electron settings, vault persistence, and a complete Context pack are outside this acceptance decision.

## 2. Brief and visual-fidelity assessment

The user’s engraved alpine globe reference supplies blue, fine illustration, immense white serif lettering, and a sense of discovery. The original arch translates those properties into an Applied Research identity rather than reproducing the reference’s globe or brand. Desktop hero scale, asymmetric negative space, restrained navigation, and the arch mark feel authored. The serif/sans pairing remains useful inside the application. Warm opaque reading surfaces and explicit source/AI/human wording preserve the product’s authorship distinction.

The Reader is the strongest product specimen: the paper owns the central measure; source navigation and the argument sit at its edges; annotations feel subordinate. Evening preserves hierarchy without turning the page into a generic black dashboard. Workbench composition visibly carries the same editorial grammar into human writing. Foundations and Craft extend the system with sensible comparison layouts rather than a page of repeated generic cards.

Mobile protects copy and keeps the reading type comfortably sized. The first reviewed version had a conspicuous horizontal edge between a flat blue field and the textured hero image; it also placed the desktop workspace’s lower caption over light stone detail. Both are resolved. A separately generated portrait composition now provides continuous sky on mobile, and opaque blue bands protect the workspace labels. The final 320 px screenshot places the CTA comfortably above the arch, with a 44 px display override preserving hierarchy.

There was no approved generated UI comp. The supplied image is inspiration, and the approved direction contract governs structure; this review therefore does not claim pixel fidelity against a nonexistent approved comp. The live World Labs site was not independently inspected in this review.

## 3. Material fixes

The following records the original findings and requested acceptance criteria. All four are resolved in the final implementation; individual completion evidence is in section 5.

### F1 — P1: Protect every workspace label from the illustration

Evidence: the top strip of `desktop-foundations.png`; `styles.css` rules for `.workspace-section`, `.workspace-heading`, and `.workspace-caption`.

The white caption is placed directly over pale, high-frequency terrain. Both the left slogan and the right action hint visibly lose legibility. The same background arrangement exposes the upper right “Example project” label to crop-dependent pale stone.

**Fix:** give the upper and lower workspace label bands an opaque field-blue backing, or move them onto an opaque surrounding surface. Use the actual foreground/background pair for the contrast calculation. Keep the reading frame and engraving unchanged.

**Acceptance:** both labels remain readable in desktop and narrow screenshots, independent of background crop. `contrast.json` currently validates flat semantic text pairs only and cannot establish contrast over this image.

### F2 — P2: Resolve the mobile hero’s hard image join

Evidence: `mobile-hero.png`; mobile `.hero` background sizing and color in `styles.css`.

The flat copy field terminates at a straight line above the image. The image’s textured blue differs enough to make the boundary obvious. Desktop feels like one illustrated world; mobile currently feels like two adjacent assets.

**Fix:** either blend the image into the same blue field with a controlled edge treatment, or deliberately compose it as a separate inset plate with explicit margins and an image caption. Keep the copy on protected negative space and preserve the prominent arch.

**Acceptance:** a fresh narrow screenshot has a continuous field or an unmistakably intentional plate composition. Verify that the headline, button, and art do not collide at 320–390 px widths.

### F3 — P2: Remove decorative heading eyebrows and meaningless numbering

Evidence: `index.html` hero, Workbench, Playbook, closing and dialog preheadings; numbered section labels and palette ordinals. Craft-floor explicitly says: “A kicker or eyebrow above a heading. This one is a ban.” It also rejects section numbering unless the sequence conveys needed information.

The hero’s edition kicker and the repeated preheading formula are not required by the reference or product contract. Palette numbers 01–04 do not tell the user anything about color semantics. These additions dilute the deliberately monumental typography.

**Fix:** remove decorative preheadings; retain necessary source locators and authorship/status labels as actual metadata attached to their content. If “Field Atlas” and the edition must remain visible, place them with brand/footer information. Let section headings supply orientation, and remove ornamental palette/rule ordinals unless they are meaningful cross-reference identifiers.

**Acceptance:** semantic metadata remains findable, with no decorative line preceding each main heading. Recheck spacing after removal rather than leaving vacant kicker margins.

### F4 — P2: Bring the typography specification and CSS into agreement

Evidence: `styles.css` has h1 tracking `-.05em`, h2 and `.type-specimen` tracking `-.045em`; display can reach 108 px. The craft floor sets a `-.04em` tracking floor and a 6rem display maximum. The enormous lettering requested by the user supports expressive scale, but does not require these exact over-tight values.

**Fix:** relax tracking to at least `-.04em`, preferably `-.03em` where it preserves the character; cap display at 6rem or record the user-reference-driven oversized display exception explicitly. Update the visible type scale to match the final implementation. Preserve the current readable 18 px body and its responsive reflow.

**Acceptance:** fresh hero and type-study screenshots retain deliberate line breaks without collisions; the foundations specimen accurately documents shipped values.

## 4. Secondary handoff and limits

The S1–S3 and motion bullets below preserve the initial review requests. They are resolved in current source as recorded in section 5.

- **S1 — Finish details:** controls still use Unicode glyphs for theme, preferences, arrows, replay, checks, and AI markers. Replace control icons with one authored SVG family, or omit decorative icons where the text already names the action. Mathematical symbols in the equation are content and should remain. Add palette-based caret and scrollbar styles and tabular numerals for counts/durations; selection, focus rings, and underline offsets are already present. These are small source changes, not a new component system.
- **S2 — Accessible state:** composer kind is shown through a `.selected` class only. Add `aria-pressed` to the Note/Counter/Idea buttons, updated together in `setComposer`. The changed input label makes the task understandable, but exposing the button state makes keyboard/screen-reader use more direct. This is code inspection, not a screen-reader test result.
- **S3 — Reading navigation:** the paper navigation permanently marks “3.2 Attention” current even after other anchors are activated. For this single-passage specimen, remove `aria-current`/the persistent selected style or update them on navigation. A full scroll-observer is unnecessary for the reference.
- **Motion:** reduced-motion overrides and action-duration tokens are present. The arrival animates from opacity zero rather than the floor’s already-visible starting point. A subtle visible initial state is a small finish improvement. No ambient motion or repeated section entrance was found in source.
- **Preserve the disclosed scope:** the source dialog explicitly identifies its fixed reference and paraphrase; the Playbook button says “Export sample .md”; the footer identifies no AI service. These are honest. No request is made here to build backend ingestion, dynamic citation verification, or production export machinery.
- **Accepted authored exception:** the human margin rules are 2–3 px and trigger four detector warnings. Their source/reaction authorship role is explicitly established in the direction contract, and they are paired with literal author wording. Keep this exception documented. The degraded regex detector is supporting evidence, not a complete visual or accessibility audit.
- **Review coverage:** independently inspected the user reference image; PRODUCT.md; DIRECTION.md; craft-floor.md; index.html; styles.css; tokens.css; app.js; README.md; contrast.json; detector.json; desktop hero, Reader, evening, Workbench, Foundations and Craft screenshots; mobile hero and Reader screenshots. Desktop Workbench/evening evidence predates the reported increase to a 12 px metadata minimum; current source was used for that judgment. Parent-reported interaction checks include save/count/Workbench/Playbook, thesis completion requirements, source Escape/focus restoration, theme and persistence; they were not independently repeated because the browser was shared.
- **Follow-up evidence:** re-inspected updated source and overwritten `desktop-hero.png`, `desktop-foundations.png`, `mobile-hero.png`, and `mobile-reader.png`; additionally inspected `mobile-preferences.png` and the final `mobile-320.png`. The latter shows a continuous image, readable copy, clear CTA/arch separation, and a contained header. The parent reports a 320 px viewport readout with scroll width 309 px and no element extending beyond the viewport. The new field-band contrast entry is 6.448:1. Necessary source, author, and font-specimen metadata remains; decorative heading prelabels and palette/rule/voice ordinals were removed.
- **Remaining verification limits:** no fresh mobile Workbench, Playbook, foundations, closing, zoom, forced-colors, or screen-reader evidence was available. Mobile Preferences is now visually covered. Current screenshots do not justify claiming full accessibility conformance, comprehensive responsive coverage, production reliability, or user-study outcomes. These limits do not leave an original finish finding unresolved.

## 5. Verdict table

“Resolved” below means the current reviewed implementation satisfies that concern, including documented authored exceptions; it does not imply this reviewer edited it.

| ID | Finding | Verdict | Completion evidence |
|---|---|---|---|
| F1 | Image-backed workspace labels lose legibility | Resolved | Opaque field-blue bands in desktop Foundations/mobile Reader; recorded field contrast 6.448:1 |
| F2 | Mobile hero has an unfinished horizontal join | Resolved | New portrait art has continuous sky; final 390/320 px screenshots retain clear text and CTA, with CTA above the arch |
| F3 | Decorative eyebrows and nonsemantic ordinals | Resolved | Main-heading prelabels removed; palette/rule/voice ordinals removed; useful author/source metadata retained |
| F4 | Over-tight tracking and mismatched type contract | Resolved | Tracking is at least −.04em, desktop cap is 96 px, narrow override 44 px; visible scale updated to 44–96 |
| S1 | Glyph icons and unfinished browser details | Resolved | Static controls use consistent 1.5 px SVG family; dynamic decorative glyphs omitted; caret, scrollbar, tabular numerals styled |
| S2 | Composer kind lacks explicit pressed state | Resolved | `setComposer` updates `aria-pressed` with visual selection |
| S3 | Fixed current-paper marker misstates navigation | Resolved | Static current style and `aria-current` removed from paper navigation |
| M1 | Arrival begins fully transparent | Resolved | Arrival starts at opacity .8; reduced-motion override remains |
| V1 | Engraved blue/editorial reference translated into own identity | Resolved | Desktop hero and original arch imagery |
| V2 | Sustained reading protected from decorative imagery | Resolved | Opaque Reader in daylight, evening and mobile |
| V3 | Human authorship remains explicit | Resolved | Composer/Workbench labels, human writing surfaces and export code |
| V4 | Sources and sample export represented honestly | Resolved | Fixed-reference dialog, paraphrase and sample-export disclosures |
| V5 | Flat-surface text contrast | Resolved | Recorded minimum ratio 4.892 for tested text-role pairs |
| V6 | Human margin detector warnings | Resolved | Accepted semantic visual grammar, documented exception |

Final review status: **accepted as a functioning design-system reference; all original finish findings resolved.** Production and accessibility-verification limits remain explicitly documented above.
