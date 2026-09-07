# Apple-tree desktop opening study

Two image variants for the first desktop-app screen supplied by the user. This is a comparison study, not a replacement of the design-system landing page or an implementation of the app.

## Composition planned before generation

- A broad apple-tree canopy meets the top edge; roots reach the lower edge. The tree fills the frame instead of floating beneath a large sky band.
- The crown spans the center, while the trunk sits toward the right. This deliberate asymmetry preserves a natural blue opening for the app’s centered prompt.
- One red apple hangs in midair beneath the left branch, with visible separation from branch, ground, interface, and figure. Attached apples establish the species.
- The prompt is centered horizontally and positioned slightly below the midpoint (55%) after inspecting the render. This avoids a low branch near the top-right of the original prompt position.
- B is an edit of A, adding a small seated person in a hoodie and trousers facing away. No face or period clothing is shown. Generated editing can introduce small color/texture differences, so these are matched compositions, not pixel-identical backgrounds.
- The secondary button uses opaque deep blue #204E75 with cream text. The heading is cream #FFF9ED directly on quiet sky. No blur, vignette, or panel covers the illustration.

## Files and preview

- `apple-without-figure.png` — A, original 1586 × 992 raster.
- `apple-with-figure.png` — B, original 1586 × 992 raster.
- Matching `.webp` files are optimized for the preview.
- `index.html` — live text overlay, A/B selection, side-by-side mode, and original downloads.
- `contrast.json` — conservative analysis of the entire rectangle behind the heading, using the brightest underlying WebP pixel. Minimum calculated cream-text contrast: 7.342:1 for A and 8.063:1 for B at the inspected desktop layout. This does not establish conformance for arbitrary future crops or longer user-entered text.

The page preserves the screenshot’s two entry labels as visual specimens; clicking them explains that the study is not connected to app flows. The existing production PRD still decides entry-feature scope.

## Generation method

Built-in image-generation tool. The existing `assets/knowledge-tree.png` was the engraving-style reference for A. B used A as its edit target.

### A — final prompt

Create a new desktop-app background illustration using the supplied image only as the STYLE reference. Exact style: exquisite nineteenth-century hand-colored copperplate engraving, tiny botanical crosshatching and lithographic stippling, vibrant emerald/jade/olive leaves with golden highlights, ivory-brown bark, richly textured deep mineral blue sky approximately #285F8C. LANDSCAPE 16:10 composition. A mature APPLE TREE is the dominant subject and fills nearly the full height: its enormous broad crown reaches and is lightly cropped by the TOP EDGE of the image, stretching from x=5% to x=97%, while its roots reach y=96%. Do NOT leave a large empty sky band above the tree. The CROWN is centered across the image; the graceful gnarled trunk descends at x=76%, to preserve an open area under the canopy. Canopy foliage is concentrated in the upper 28% and upper-right; curved branches frame rather than obstruct the middle. CRITICAL UI COMPOSITION: reserve a naturally open, quiet, uninterrupted deep BLUE SKY WINDOW across x=32–66%, y=38–65% for a centered two-line white app prompt and two buttons. This central region has no trunk, foliage, apples, clouds, mountains, pale highlights or objects. It must be quiet dark blue, not a drawn panel, gradient, blur or vignette. The scene surrounds this naturally open window. The tree bears several small but clearly recognizable warm crimson red APPLES among the leaves. ONE single distinct red apple is FALLING MIDAIR beneath a left branch, at x=25%, y=48%, with an unmistakable air gap above and below it. The apple is subtly larger than the attached fruit so it reads, but naturalistic, not giant. No motion lines, arrows, diagrams or magic glow. Fine distant alpine ridges only below y=78%, a lush green meadow with delicate flowers along the bottom, sophisticated and believable. The tree itself, not rocks, is the visual anchor. NO PEOPLE in this first version. No arch, globe, text, labels, lettering, logos, UI, watermarks or frames. The falling apple is a subtle timeless allusion to Newton and a world-changing idea. Maintain exceptional sharp detailed engraving, no photography, no smooth 3D, no painterly oil smearing.

### B — final edit prompt

Make ONE local addition to this exact illustration: add a small contemplative adult seated on the grass against the lower-left root of the apple tree, around x=66%, y=84%. The person wears a simple muted slate-blue hoodie, warm charcoal trousers and understated shoes, contemporary everyday clothes with no logos. Their BACK faces the viewer, hood up or back of head visible, NO FACE or facial features visible at all. They are quietly looking out across the valley, one knee loosely raised, relaxed thoughtful posture, not dramatized, not pointing. Their full seated height should be only about 14% of the image height, clearly subordinate to the monumental tree. Draw them in exactly the same hand-colored copperplate engraved style with fine crosshatching, not photographic. Preserve EVERYTHING ELSE as closely as possible: exact tree shape, trunk and root locations, canopy, all apples and especially the solitary apple falling at the left, its size and position, the mountain horizon, meadow, palette, framing, sky texture, dimensions and lighting. Do not rearrange or redraw the landscape. The central blue area reserved for UI at x32–66%, y38–65% must remain completely unobstructed. Do not move the falling apple above the figure. No period clothing, no Newton costume, no face, no text, no UI. Output the same landscape aspect ratio as the input.

## Original generation paths

A: `/Users/aaryan/.codex/generated_images/01a0729b-a95e-7a63-8b11-a9684889339c/exec-694e98e8-c555-4254-b399-6c62c01df5a9.png`.

B: `/Users/aaryan/.codex/generated_images/01a0729b-a95e-7a63-8b11-a9684889339c/exec-c255686e-bd96-4903-a97b-66589530bd34.png`.

