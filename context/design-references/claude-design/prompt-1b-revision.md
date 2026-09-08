# Claude Design prompt 1b — revise the Applied Research design system

Revise the existing canvas "Applied Research - Design System" in place. Keep
everything not named below. Do not add screens; this is still the system
sheet, and prompt 2 (screens) runs after this revision is approved.

The critique that drives this revision, in one line each:

1. The accent is the wrong physics: pastel over basalt turns to khaki, straw
   ink reads as mustard and mustard reads as a warning, and watercolor on
   black reads as smoke.
2. Citations shout: uppercase, boxed, three coordinates, two grammars, and
   page numbers that don't exist in a reflowed paper.
3. Three "unified" components hide three different jobs, and the false
   unification produced meters that imply a maximum that doesn't exist.
4. The mono register is applied to every label, so it no longer sorts
   anything.
5. Primitives (buttons, inputs, focus, disabled, error, streaming) are
   undefined, so nine screens will each invent them.
6. Several components carry states they cannot have.

## 1. Accent: lamp and pigment

One hue family, two physical behaviors. The rule from prompt 1 stands and
the sheet did not apply it: **pastel is ink on dark, material on light.**

**Dark (basalt) — lamp.** Known territory and human presence are *lit*, not
painted.

- Human writing: cream ink, no background. Provisional `--human-ink: #EFE6CF`
  on ground. Nothing behind the text.
- Reacted passage: a warm luminous tint, not straw. Provisional
  `--wash-passage: rgba(245,238,220,.10)`. It should read as light on the
  words, never as a colored block. If it looks olive at any alpha, it is
  wrong.
- Known territory on the map: a warm glow, blurred, very low chroma,
  brighter toward the center. The recipe is a lamp on a desk: warm white
  with a trace of straw, radial, grain kept. No rose, no cream fields on
  dark; the run is for light mode.
- **Remove every straw outline, dot, bar, and underline from dark mode.**
  Active tab underline, hover hairline, open/resolved marks, density bars,
  chip borders: all become `--ink-1` or `--ink-2`. The only chromatic
  element left on basalt is the reader-edge strip's position mark, and it
  uses `--human-ink`, not `#E8D27A`. Delete `--straw-ink` as a token.
- Filled chips with dark text on straw are forbidden on dark. They are
  hazard labels.

**Light (warm white) — pigment.** The watercolor concept is light-native and
stays.

- Reacted passage: straw wash at roughly half the current strength.
  Provisional `rgba(242,227,161,.32)`. A stripe at 62% is a highlighter,
  which is the habit the product removed the action for.
- Human writing: reading ink over a faint wash, `rgba(242,227,161,.16)`,
  clone box decoration as now. Or, if the ragged text-selection look
  persists at that alpha, drop the wash and use a 2px straw rule in the
  left margin of the human paragraph instead. Show both, recommend one.
- Map wash: as designed. Keep the three-density specimens for light only.
  Replace the three dark specimens with the lamp recipe at three
  brightnesses.

Re-render artboard 03 (color) and artboard 04 (provenance) under these
rules. Artboard 04 is the acceptance test: one paragraph, one card, one
note, both themes, and a viewer must be able to say which text is the
paper's, which is the AI's, and which is the human's, with no label, in
both themes, without any element that could be mistaken for a warning.

## 2. Citations: one component, three states, book grammar

Replace both the citation chip and the inline chip usage with a single
**citation** component.

- **Rest.** Unboxed. Mono, lowercase, not tracked beyond `.02em`, tertiary
  ink. Sits at the end of the sentence it supports, never mid-sentence.
  In-paper: `§3.2.1`. Cross-paper: `Vaswani 2017 · §3.2.1`. No page numbers
  anywhere: the paper is reflowed and pages no longer exist on screen. No
  arXiv ids in the UI; they belong in the source row's metadata only.
- **Hover.** Expands in place into a pill: the locator plus the first line
  of the cited passage in the reading face, truncated at one line. Surface
  fill, hairline border, no shadow. This is the peek; it is how the reader
  decides whether the jump is worth losing their place.
- **Active (click).** Jumps to the passage, which receives the reacted
  wash for two seconds and then settles to its normal state.
- **In evidence fields only** (thesis evidence, suggestions tray), the
  citation renders as a removable object: same text, hairline box, an × on
  hover. This is the only boxed form.

Do not use circled numerals. The reflowed paper already carries its own
numbered references inline, and a second numbering system in the same
column collides with it.

Re-render the inline card, the stress-test result, the thesis card, and the
suggestions tray with this component. In the stress-test result, move each
citation to the end of its sentence.

## 3. Split the false unifications

**Depth strip → three components.**

- **Path bar.** A breadcrumb atop a rabbit-hole layer:
  `Attention is all you need › §3.2 › √dk scaling`. Depth shown as a count
  at the end, `2 deep`, in `--ink-2`. No bars.
- **Edge strip.** A position indicator on the reader's edge. One dot per
  layer of depth, stacked, no empty slots, because there is no maximum
  depth. The current layer's dot is `--human-ink` on dark, straw on light.
  Click any dot to pop to that layer.
- **Reaction meter.** On a source row. A single thin bar whose length is
  the fraction of the paper's paragraphs with at least one reaction. Hover
  shows the count. No segments.

**Reaction chip → two components.**

- **Type label.** Mono, uncolored, `--ink-3`: `note`, `counter`, `idea`,
  `question`. Used in Inbox rows and Annotations. Carries no state.
- **Margin marker.** A small glyph in the reading column's left gutter
  beside a reacted paragraph, one per reaction type. Design four glyphs
  that are distinguishable at 10px and that do not look like icons from a
  library: they should feel like marks a pen makes. Counter has two states
  (open: outline, resolved: filled). Note, idea, and question have no
  states; a question is answered when the card exists.

Remove the open/resolved mark from the collapsed inline card. A collapsed
card shows the question and nothing else.

## 4. Pull the mono register back

Uppercase tracked mono is for **coordinates and navigation only**: the
locator line atop the reader, sidebar tab labels, layer names on the map,
the path bar. Everywhere else it is removed:

- Thesis card field prompts become sentence-case UI sans, 13px, `--ink-2`:
  "The claim", "Evidence", "What the paper claims and what's wrong with
  it", "What would prove me wrong", "Why this hasn't been noticed
  (optional)".
- Artboard section headers on the sheet itself may stay mono; that is the
  sheet's chrome, not the product's.
- The ⌘K badge is removed from the toolbar. Shortcuts live in tooltips.
- The Explain input's submit label is "Explain", not "Ask". One verb.
- The inline card's second action is "Note in my words", not "Note".

## 5. Define the primitives

Add a new artboard, **05b · Primitives**, with these, each in both themes,
each with rest, hover, focus, active, and disabled:

- **Button, primary.** Ink-1 fill, ground text, no radius or 2px radius,
  chosen once. Used for exactly one action per screen (Find papers for
  this, Save, Stress-test).
- **Button, secondary.** Hairline border, ink-1 text.
- **Button, text.** Bare label, ink-2, ink-1 on hover. Cite, Ask follow-up,
  Note in my words, Esc.
- **Text field.** The Explain input and the thesis fields share one field
  style: no box, a hairline bottom rule that becomes ink-1 on focus. Human
  fields are set in the reading face; UI fields in the UI face.
- **Focus ring.** A 2px ink-1 outline offset 2px, for keyboard navigation.
  Never the accent.
- **Citation peek popover.** As in section 2.
- **Search result row.** For "Find papers for this": title in UI face,
  authors and year in mono lowercase, one-line abstract in ink-2, an "Add"
  text button. Results land on the map at the band's depth.
- **Calibration control.** Three plain choices in a row, "Know it",
  "Heard of it", "No idea", segmented, hairline, selected state is ink-1
  fill. "Heard of it" reveals a reading-face field beneath: "Explain it in
  a sentence."
- **Streaming state.** How an inline card looks while the answer is
  arriving: text appears as generated, a 1px ink-2 caret at the end, no
  spinner, no skeleton.
- **Error state.** A parse failure block: the failed region rendered as a
  crop of the original PDF with a text button "View original PDF".

## 6. Fix what carries impossible states

- Ladder readout: Facts row no longer sits on a surface. In a four-row
  list the surface reads as "selected". Instead, the Facts label is in the
  UI face and the other three are in the reading face, which is the
  provenance rule expressed through type alone. Counts stay mono.
- Brief header: widen the measure to 34ch, reduce to 40px, and place the
  wash beneath the text rather than beside it. It is a header, not a
  poster.
- Map band: paper cuts become short labels, the paper's short title in
  mono lowercase at its depth, not one-pixel lines. Show the hover state
  with the full title.

## Deliverable

Update artboards 03, 04, 05, 06 (where the strip appears), and 07 (glossary
gets the new component names: citation, path bar, edge strip, reaction
meter, type label, margin marker). Add 05b. Every changed artboard carries
a one-line note at the bottom stating what changed. Render dark first,
light second, and make artboard 04 the first thing on the canvas after the
principles page, because it is the acceptance test for the whole revision.
