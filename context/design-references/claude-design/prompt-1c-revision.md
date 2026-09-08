# Claude Design prompt 1c — revise the Applied Research design system

Revise the canvas "Applied Research - Design System" in place. Keep everything
not named below. Still the system sheet only; prompt 2 (screens) runs after
this is approved.

Source of the changes: the studio memo "Lamp and Margin" (2026-09-03). Every
number below was derived in OKLCH and audited against WCAG 2.2 AA. Do not
re-tune by eye; if something looks wrong, say so in the change note rather
than substituting a value.

## 0. The two rules that govern everything

**Two hues, two meanings, never on the same pixel.**

- **Warm** means *what the human made*: the reacted passage, the human margin
  rule, the lamp on the map, the Brief's wash.
- **Cold** means *what the interface offers*: hover, active, the citation under
  the cursor, the frontier line on the map, the Add and Cite affordances while
  touched.

**Pen and wash.** Pastel is an area, never a line or a letter, on light.
On dark, pastel is ink and passes on its own. Wherever a line or glyph must
carry a hue on light, it uses the *loaded* form of the same pigment. Ink text
always sits on top of a wash; text is never itself pastel on paper.

## 1. Tokens

Replace the token table. Verdigris is renamed and re-valued, not added to.

| Token | Dark | Light | Notes |
|---|---|---|---|
| ground | `#0C0F12` | `#FBFAF7` | unchanged; basalt stays cool (248°) on purpose |
| surface | `#14181C` | `#F3F1EC` | |
| hairline | `#22272C` | `#E6E2DA` | decorative only; never a control boundary |
| ink-1 / ink-2 / ink-3 | unchanged | unchanged | |
| human-ink | `#EFE6CF` | `#1C1B18` | |
| human-rule | `#FBD094` | `#A8742A` | 3px margin rule; light is sepia, the loaded straw (3.9:1) |
| passage | amber 13% | straw 32% | dark: `rgba(251,208,148,.13)`; light unchanged |
| lamp | amber, screen blend | — | see §3 |
| cold | `#7BC7C9` | `#2B9094` | dark: ink (9.9:1). light: **line only**, never text (3.7:1) |
| cold-fill | `#56B6B9` | `#C7EDEE` | hover fill; dark text is ground, light text is ink-1 |
| straw / cream / rose | — | `#F5E5A8` `#FFDEA9` `#FFCFD8` | run rebuilt at OKLCH L .92 C .08; light wash only |

Delete: `--edge`, `--edge-line`, `--edge-wash`, `--mark-ring`, `--straw-ink`.
`--mark` (edge strip current dot) becomes human-ink on dark, sepia on light.

## 2. Human writing (artboards 04, 05 thesis card, 05b fields)

A human paragraph **outdents 28px into the left margin** of the reading
column behind a **3px human-rule**. Reading face, human-ink. The paper stays
in the column; AI stays inset on the surface. Three positions, no labels.

Artboard 04 becomes the acceptance test for this: in **both** themes a viewer
must separate paper, AI, and human at a glance. Render the light panel twice:
**A** with the sepia rule `#A8742A`, **B** with pastel straw `#E9CF6A`. Label B
"fails 3:1; shown for comparison." Recommend A.

Human fields in the thesis card and Workbench carry the same rule at their
left edge while they contain text.

## 3. The lamp (artboard 03, 05 map band, 05 Brief header, 06 wash spread)

Re-render every dark "known territory" specimen with this recipe:

- Hue **70°** (amber), never straw. One radial field, center
  `oklch(0.80 0.10 70)` ≈ `#E7B375`, falling to `#3E2A12`, then black.
- Composited with **`mix-blend-mode: screen`**, not alpha. Light adds; paint
  mixes. Alpha amber over basalt is mud; screen amber never is.
- Blur ~30px, grain 50% soft-light kept.
- Three brightnesses = three peak lightnesses (.62 / .72 / .80), same hue.

Dark ground stays `#0C0F12`. Do not warm it. Cool shadow under warm light is
the depth cue; warm on warm is sepia.

Light wash: rebuild the three densities from the new run (§1). Same recipe
otherwise.

## 4. Cold accent and interaction states (artboard 05b, 05 citation, 05 map)

Every hover and active state is cold. Rest states stay achromatic.

| Primitive | Dark hover | Light hover |
|---|---|---|
| Primary button | fill `#56B6B9`, text ground | fill `#C7EDEE`, text ink-1 |
| Secondary button | border `#7BC7C9`, fill cold-fill at 18% | border `#2B9094`, fill `#C7EDEE` at 18% |
| Text button | ink-1, underline `#7BC7C9` 1.5px, offset 4px | ink-1, underline `#2B9094` |
| Citation | text `#7BC7C9` | text ink-1, **wash `#C7EDEE` behind it**, 1px 5px padding |
| Search result row, Add | as text button | as text button |
| Calibration segment | as secondary | as secondary |
| Map band | lamp brightens one step | wash densifies one step |
| Map edge line | 1px `#7BC7C9` | 1px `#2B9094` |

Active = hover plus 1px inset of ground. Focus ring stays **2px ink-1, offset
2px**, in both themes, so focus and hover are never the same state. Disabled
unchanged. Primary hover never darkens.

Re-render the citation peek popover with the hover rule above.

## 5. The Explain card (artboards 04, 05 §02, 05b streaming)

Question and answer stay together on the surface. Restate the provenance
rule in artboard 01: *surface holds what the AI asserts, ground holds what
the human asserts; a question belongs to whichever it heads.* The question
is set in the **reading face, italic, human-ink**, still inside the card.
Everything else in the card unchanged.

## 6. Reaction state: the spine replaces the meter (artboards 05 §06, §08, 07)

Delete the reaction meter. Add the **spine**: a 1px vertical line the length
of the paper, with 7px ticks. **Left ticks = questions the AI answered.
Right ticks = things the human said** (note, counter, idea). Right ticks are
human-ink on dark, sepia on light; left ticks are ink-2. Unread = hairline
spine, no ticks.

Three sizes, one component:

1. **Sidebar row** — 22px tall, left of the title, replaces the meter.
2. **Reader edge** — the scroll track itself, full height, ticks at the
   paragraph's position. Click a tick to jump.
3. **Workbench** — one spine per paper, stacked by map layer.

Show rows for: read-and-only-asked (all left), read-and-argued (mixed),
unread. Hover on a spine shows "5 asked · 0 said."

## 7. Workbench (artboard 05 §16–18, artboard 07)

Delete Inbox and Thinking. Tabs are the ladder, each with its count:
**Reactions · Insights · Theses · Playbook**. Every rung shows the rung below
as material on the left and a place to write on the right:

- **Reactions**: grouped by map layer. Each group header carries its
  asked/said composition as a two-segment bar (ink-2 / human-ink), e.g.
  "Softmax · variance — 9 asked · 0 said". Reactions listed beneath; human
  ones in the reading face with the rule.
- Right column: "An insight from these", a reading-face field, Cites row
  with evidence objects and "+ Cite", one primary "Save insight".

The ladder readout (Facts · Notes · Insights · Theses) stays in the reader
sidebar; Facts stays there because the AI's facts live in the paper.

## 8. Motion (artboard 06)

Three durations only, and every animation is one of them:

| ms | Kind | Where |
|---|---|---|
| 150 | Touch | hover fill in/out, toolbar on selection, tab underline, citation lift |
| 220 | Reveal | card open, layer push, peek, a citation landing in a field, stress-test citations landing one by one at 60ms stagger |
| 900 | Reward | wash spread; **Playbook compile** (new): the document assembles rung by rung |

Add two storyboard rows: **04 · Stress-test landing** (220, staggered) and
**05 · Playbook compile** (900). Curve unchanged. Reduced motion cuts all
five to end state.

## 9. Accessibility fixes (all artboards)

- Citation at rest: **ink-2 at 12px** (was ink-3 at 11px, 3.7:1 dark / 3.3:1
  light). Hover as §4.
- Text field rest rule: **ink-3** (was hairline, 1.3:1). Focus rule ink-1.
- Mono coordinate register: minimum **12px** everywhere.
- Edge-strip dots, margin markers, citations, spine ticks: drawn small, hit
  **24px** minimum. Show one hit-area overlay on artboard 05b.
- Secondary button border stays ink-3 (3.7 / 3.3, passes non-text).
- Add a row to artboard 03: "Contrast audit" listing the twelve pairs and
  ratios from the memo, both themes.

## 10. Rules revised (artboard 01)

- **Shortcut hints**: show the key inside the selection toolbar on hover
  (e.g. "Explain ⌘K"), not only in a tooltip. Beachhead users are engineers.
- **Never speaks first** gains one exemption: acknowledgement. Save settles
  (220) and offers Undo for 5s as a text button; no toast.
- "Straw ink forbidden on dark" stands, restated: no yellow ink on basalt;
  warm appears on dark only as light. Chromatic ink on dark is the cold.
- "Rose and cream never touch basalt" is withdrawn as a rule; in practice the
  lamp is one amber and the run is light-only.

## Deliverable

Update artboards 01, 03, 04, 05, 05b, 06, 07. Artboard 04 stays first after
01. Each changed artboard carries a one-line "Changed ·" note. Render dark
first, light second. Where this prompt gives a hex, use that hex.
