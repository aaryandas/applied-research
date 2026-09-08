# Claude Design prompt 1d — patch the Applied Research design system

Revise the canvas "Applied Research - Design System" in place. This is a
small patch on top of 1c; keep everything not named below. Still the system
sheet only; prompt 2 (screens) runs after this is approved.

Every hex below was derived in OKLCH and audited against WCAG 2.2 AA. Use the
hex given; do not re-tune by eye.

## 1. The lamp gets room to fall off (artboards 05 §07 map band, 06 wash spread)

The lamp is **one radial field under the whole map**, not one per band. Bands
are transparent over it; band hairlines and labels sit on top. The dot grid
sits *under* the lamp, not over it. This removes the flat tan bars the
clipped radial produced.

Peaks by use, same hue 70°, screen blend:

| Use | Peak |
|---|---|
| Known territory on the map | L .72 · `#CD995C` |
| Project cover | L .72 |
| Brief header | L .80 · `#E7B375` |
| Edge of known | L .62 · `#AD7B3D` |

Re-render the map band specimen and all three wash-spread frames with the
single field. The frontier stays a 1px cold line at the boundary between the
last lit band and the first dark one.

## 2. The Brief is lit from above (artboard 05 §19)

Move the lamp's center to **above and left of the first line** of the Brief,
roughly 20% x / 10% y of the header block, falling off down and right. Text
is lit the way a desk lamp lights a page. Never from below.

## 3. Light-mode primary hover keeps its weight (artboard 05b light, 05 Workbench Save)

On light, the primary button's hover is the **loaded cold under paper text**,
not the pale wash:

| State | Light |
|---|---|
| Primary rest | ink-1 fill, ground text (unchanged) |
| Primary hover | fill `#005A5D`, text `#FBFAF7` (7.7:1) |
| Primary active | hover + 1px inset ground |

Add token `cold-deep: #005A5D` (light only). Dark primary hover is unchanged
(`#56B6B9`, ground text). The pale wash `#C7EDEE` remains the light hover for
secondary, text, citation, search row, and calibration.

## 4. Human reactions in the Workbench carry the pen mark, not the label (artboard 05 §18)

In the Reactions rung, a human reaction row (note, counter, idea) drops the
mono type label and shows its **margin marker** glyph in the gutter left of
the 3px human-rule: stroke for note, ring or filled ring for counter, star
for idea. AI-answered questions keep the mono `question` label and have no
rule. Nothing may overlap the rule.

## 5. Rose softened (artboard 03)

The run's rose stop is `#FFD5DB` (OKLCH L .92 C .06 H 10). Straw and cream
unchanged. Re-render the run swatch and the three light wash densities.

## 6. Path bar truncation (artboard 05 §04)

The path bar never wraps. At any depth it keeps the **first and last crumb**
and collapses the middle to `…`:
`Attention is all you need › … › √dk scaling · 3 deep`. Esc sits in its own
slot at the far right and never touches a crumb. Show depth 2 (no collapse)
and depth 4 (collapsed).

## 7. Thesis kind is a segmented control (artboard 05 §13)

Replace the Critique · Gap tab set with the **calibration control**: two
segments, hairline, selected is ink-1 fill, hover as secondary. Kind is chosen
once; it is not a view.

## 8. Icons: Phosphor (new row on artboard 05b, entry on 07)

The icon library is **Phosphor** (phosphoricons.com). Rules:

- **Weights.** Light at 16px in chrome; Regular at 20px and above. Never
  Fill, never Duotone: Fill is mass, Duotone is a second color.
- **Where.** Chrome only: close (`X`), add (`Plus`), undo
  (`ArrowCounterClockwise`), collapse sidebar (`SidebarSimple`), external
  link on "View original PDF" (`ArrowSquareOut`), finder (`MagnifyingGlass`),
  pop a layer (`CaretLeft`), path-bar separator (`CaretRight`). Never inside
  the reading column. Never as a substitute for Explain · Note · Counter ·
  Idea, which stay as words.
- **Margin markers stay bespoke.** Stroke, ring, star, hook are not from the
  library. Phosphor Light sits beside them at the same 1.3px stroke.
- **Paired with a word on first appearance** per screen; `X` and `Plus` are
  exempt.
- **Color.** ink-2 at rest, ink-1 on hover; cold only when the icon *is* the
  hovered control. Never warm.

Render the eight icons above in Light at 16px, dark and light, rest and
hover, with their word beside them.

## Deliverable

Update artboards 03, 05, 05b, 06, 07. Each changed artboard carries a
one-line "Changed ·" note. Dark first, light second.
