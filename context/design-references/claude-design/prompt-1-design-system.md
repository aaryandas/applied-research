# Claude Design prompt 1 of 2 — Applied Research design system

Produce a design-system canvas for **Applied Research**. This prompt is the
system only: principles, type, color, surfaces, layout, components, motion,
naming. No product screens yet. A second prompt will ask for screens and will
paste this system back in as a constraint, so every decision here must stand
on its own as a reference sheet.

## What the product is

Applied Research is a research tool for builders learning an unfamiliar
domain in order to build in it. It finds papers
(scholarly APIs under the hood), maps the domain by prerequisite depth, and
its core surface is reading: the user pastes a paper or states a question,
reads inside the tool, and every reaction they have while reading (a question, a
note in their own words, a pushback, an idea) is captured with provenance and
compiled into a **Playbook**: a document of facts, notes, insights, and theses
that they and their coding agents build from.

The contrarian bet: every competitor does more of the thinking for the user.
Here the AI constructs scaffolding (sources, explanations, argument maps) and
the interface exists to **provoke and capture the user's reactions**. The AI
may author facts. Only the human authors insights and theses. This is
enforced in the data schema and must be *visible* in the design without
labels.

Beachhead users are AI engineers in a cohort that must produce these
documents weekly. Expansion users are open-source builders. Desktop, 1280px
minimum.

## Posture (the decision everything else hangs on)

The product is an **instrument, not a coach, in a reading room**.

- It never speaks first. No nudges, no "you haven't reacted in a while."
- It renders *state* continuously (how much of this paper you've reacted to,
  how deep you are in a rabbit hole, what you know versus don't) and lets the
  seeing be the provocation.
- The paper is the whole screen when reading. Chrome recedes.
- Every affordance appears at the point of contact (a text selection, a dark
  region on the map) and nowhere else.

## Provenance is structural, not a badge

Never use a chip, avatar, or label to say "AI wrote this." Use material:

- **AI-authored text sits on a surface.** An inset container one tonal step
  above the ground, with a hairline left rule. Neutral ink. Reads as
  "handed to you."
- **Human-authored text sits on the ground.** No container. A pastel wash
  behind it. Reading ink. Reads as margin handwriting.
- **The paper is the paper.** The reading face, on the ground, no wash until
  the user reacts to a passage.

This one rule must survive in every component. If a design needs a "YOU" or
"AI" label to be understood, it is wrong.

## Typography: three faces, three jobs

| Role | Face | Where |
|---|---|---|
| Reading | **Newsreader** (variable, use optical sizes) | Paper body, headings inside papers, all human-authored writing (notes, ideas, theses, insights). Italic for emphasis only. |
| Interface and AI voice | **Familjen Grotesk** | All chrome, all AI-authored text, forms, buttons, sidebars. |
| Coordinates | **Martian Mono**, uppercase, tracked ~0.08em | Locators (`ARXIV:1706.03762 · §3.2`), citation chips (`§3.2.1 · p.4 · fn.4`), the depth strip, layer names on the map, tab labels, every meta label. This is the "sorting register": the eye separates it from prose without reading it. |
| Display, two moments only | **Fraunces**, large, wonk axis on | The project title and the Brief sentence. Nowhere else. |

Set a scale. Provisional: paper body 18px / 1.55 line-height on a 68ch
measure; UI 13–14px; mono labels 11–12px; Brief at 40–56px. Show the scale
as a specimen sheet with real paper text (use a passage from "Attention Is
All You Need", §3.2) and real UI strings from the glossary below.

Do not use Inter, Geist, or any face that reads as a default.

## Color

Two themes, dark default. Light is not "inverted dark"; it is warm paper.

**Grounds and surfaces (provisional, tune these):**

| Token | Dark (basalt) | Light (warm white) |
|---|---|---|
| ground | `#0C0F12` | `#FBFAF7` |
| surface (AI containers, one step up) | `#14181C` | `#F3F1EC` |
| hairline | `#22272C` | `#E6E2DA` |
| ink primary | `#ECEAE4` | `#1C1B18` |
| ink secondary | `#A9A6A0` | `#5A574F` |
| ink tertiary / mono labels | `#6F6D68` | `#8E8A80` |

Dark ground may carry a faint dot-grid texture on the map and home only,
never inside the reading column. Never pure black, never pure white.

**Accent: a pastel run, used as material, not ink.**

The only hue in the product means one thing: *a human was here*. It is a
short warm run of neighboring pastels, provisional:
straw `#F2E3A1` → cream `#F6E4CB` → pale rose `#F2CFD3`.

- **Flat accent** = straw. Used for highlight washes behind reacted passages,
  the wash behind human writing, chips, marks, outlines, the depth strip
  fill. Everywhere small. Everywhere inside the reading column. In light
  mode it is only ever a background; text on it is ink primary. In dark mode
  it lifts to a straw ink (`~#E8D27A`) where a line or glyph needs color.
- **Watercolor wash** = the run blended as a soft, uneven, paper-textured
  gradient, densest at straw and thinning to nothing. It is the hero
  material. It renders the user's *known* territory on the map (knowledge
  fades at its edge, it doesn't stop at a line), project covers, the empty
  Workbench, and the backdrop of the Brief. **One wash per screen. Never
  under 200px. Never inside the paper.**

**Exclusions, hard:** no violet or indigo anywhere. No blue accents. No
orange, coral, or vermillion. No second hue for status. Open versus resolved
is outline versus fill in the same accent. Levels of the Playbook ladder are
carried by position and surface/ground, never by color.

## Layout and shell

- **Left sidebar (where):** projects, then the active project's sources
  ordered by depth (foundations at the bottom of the map are at the bottom of
  the list) with a reaction-density mark per row. Not a file tree: no
  folders, no drag, no manual grouping. 240px, collapsible with `⌘\`,
  remembers state. Collapses by default only inside a rabbit hole at depth
  2 or deeper.
- **Right sidebar (what):** tabs **Arguments · Questions · Annotations**.
  320px. Always about the thing in front of you.
- **Center:** the map (project home) or the reader, as peers. Reading column
  max 68ch centered. When reading, the map shrinks to a vertical **strip** on
  the reader's edge; the strip is also the depth indicator for rabbit holes
  and is the one-click way home.
- Minimum viewport 1280. Mobile is out of scope except a read-only paper.

## Components (render each as a sheet with states)

1. **Selection toolbar.** Appears on any text selection within 150ms,
   anchored. Four actions: **Explain · Note · Counter · Idea**. No
   Highlight (deliberate: you cannot mark a passage without saying something
   about it). Explain has an inline field; typing turns it into a specific
   question. `⌘K` on a selection = Explain.
2. **Inline card.** The answer to Explain, rendered directly under the
   passage in the paper's flow. Surface + left rule. Contains: the question
   in ink primary, the answer, a mono citation chip, two actions (**Ask
   follow-up · Note**). No avatar, no "AI" label. Collapses to one line on
   re-read showing the question and a resolved/open mark. Rule: a card
   never exceeds the viewport; anything longer becomes a layer.
3. **Rabbit-hole layer.** A full reader pushed over the paper. Pinned at
   top: the origin passage, quoted, with wash. Below: the source or concept
   explainer in full reading typography with the same toolbar. The paper
   beneath dims ~40% and recedes 4px. Esc returns to the exact line.
4. **Depth strip.** Mono path: `ATTENTION IS ALL YOU NEED › §3.2 › √dk
   SCALING · 2 DEEP`. Same component at three sizes: strip on the reader
   edge, path bar atop a layer, density mark on a source row.
5. **Map layer (band).** A horizontal band of the strata. Contains concept
   labels in mono, paper cuts as thin marks, and the wash where known. Dark
   band detail exposes one primary action: **Find papers for this**.
6. **Source row.** Title in UI face, locator in mono, density mark, depth
   position implied by list order.
7. **Reaction chips.** Note, Counter (open = outline, resolved = fill),
   Idea, Question. Straw accent. Used in Annotations, Inbox, and on the
   paper margin.
8. **Citation chip.** Mono, `§ · p. · fn.`, clickable, always resolves to a
   passage.
9. **Counter resolution.** Three plain choices: **I was missing something ·
   The paper has a problem · Still open**. The second spawns a Critique
   thesis with the passage pre-cited.
10. **Thesis card.** Two kinds sharing a spine. Spine: *the claim* (one
    sentence, reading face, on the ground, wash) · *evidence* (≥1 citation
    chip, required) · *what would prove me wrong*. Kind-specific field:
    **Critique** → *what the paper claims and what's wrong with it* (free
    text, no menu). **Gap** → *what the industry does instead* (human-written
    from their own knowledge; the tool has no industry sources). Optional:
    *why this hasn't been noticed*. Save is disabled until the spine is
    complete.
11. **Suggestions tray.** A surface beside a human field, Critique cards
    only. AI-gathered evidence from the user's papers lands here and only here. Nothing in the tray can be moved into
    the field by the AI; the human cites it.
12. **Stress-test result.** The strongest cited case against a thesis,
    assembled only from papers the user has read. On a Critique: passages
    that defend the claim. On a Gap: passages that complicate the research
    half; the industry half is the user's and is never checked. Surface,
    citations landing one by one.
13. **Ladder readout.** Four plain rows, **Facts · Notes · Insights ·
    Theses**, with counts. Never show DOK numbers. Facts row is surface
    material; the other three are ground.
14. **Brief header.** Fraunces. The one place the display face appears in
    a project.
15. **Empty-state block.** Honest counts, no illustration, no exhortation.
    "Theses held: 0 · Counters unresolved: 14."
16. **Sidebar tab set.** Mono labels.
17. **Watercolor wash.** As a standalone material specimen at three
    densities, in both themes.

## Motion doctrine

- Motion is a consequence of something the user did. Nothing moves on its
  own. No loops, no ambient animation, no attention-seeking.
- Reveals, not bounces. Ease-out, 150–200ms, interruptible. No springs.
- **The paper never reflows above the reader's eye.** Opening a card moves
  only content below the passage. Popping a layer lands on the exact line.
- Reduced motion cuts to end state, not to shorter durations.

Three signatures, everything else is invisible:

1. **Card open.** Content below the passage moves down ~220ms ease-out; the
   answer streams onto its surface. The promise of a living document.
2. **Layer push.** ~280ms. Paper dims and recedes (opacity and a 4px, 0.985
   scale step); the layer enters from the right; the strip ticks one deeper.
   Depth is felt, not announced.
3. **Wash spread.** On return to the map after reading, the known wash bleeds
   outward to cover what the user just reacted to. 900–1200ms. The only slow
   animation in the product, because it is a reward, not a transition.

## Glossary (use these exact strings in specimens)

| In the UI | Meaning |
|---|---|
| Brief | The project's opening sentence: "I'm building X and need to understand Y." |
| Map | Project home. Concepts as horizontal layers by prerequisite depth, foundations at the bottom. |
| Known / your edge | The washed region / where the wash ends. |
| "What do you already know about [domain]?" | Calibration screen title. |
| Sources | Papers only in v1. |
| Explain · Note · Counter · Idea | The four toolbar actions. |
| Counter resolutions: I was missing something · The paper has a problem · Still open | |
| Rabbit hole · "3 deep" | A pushed layer and its depth. |
| Arguments · Questions · Annotations | Right sidebar tabs. |
| Workbench: Inbox · Thinking · Playbook | Collected reactions → insights and theses → compiled output. |
| Thesis, kinds Critique · Gap | A defended, falsifiable claim. |
| Stress-test | The AI's cited case against a thesis, from the user's own papers only. |
| Facts · Notes · Insights · Theses | The ladder. AI may author Facts only. |
| Context pack | The Playbook's second document, for coding agents. |
| Find papers for this | The only discovery entry point on the map. |

## Anti-patterns (reject on sight)

Badges or avatars for provenance · violet/indigo/blue/orange accents ·
gradients under 200px or inside the paper · springs, bounces, loops ·
anything that moves unprompted · a Highlight action · DOK numbers in the UI ·
a draggable canvas of any kind · file-tree affordances in the sidebar ·
illustrations in empty states · Inter/Geist/system-default type · pure
black or pure white grounds.

## Deliverable

One canvas. Artboards: (1) principles and posture in one page, (2) type
specimen in both themes, (3) color and material including the wash at three
densities, (4) surface/ground provenance demonstrated on one paragraph of
paper with one card and one note, (5) the component sheet with states, (6)
motion spec as storyboard frames for the three signatures, (7) the glossary.
Make each artboard readable at a glance; this sheet will be pasted into
every future prompt.

## Reference, for register only

Three portfolio sites the founder responded to: rachelchen.tech (Tiempos
serif, Geist, Geist Mono uppercase nav, one burnt-orange accent used once,
pastel cards, a hover that turns a flat card into a live gradient),
johnyvino.com (near-black `#09090B`, custom sans + mono, dot-grid texture,
one giant faded display headline), amylalai.com (Reckless serif, Graphik,
small-caps meta captions, warm off-white `#FFFEFC`, warm browns). Take the
triad, the single accent, the uppercase mono meta register, and the "one bold
gesture per screen, everything else silent" discipline. Do not take their
colors.
