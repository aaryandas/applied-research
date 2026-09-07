# Claude Design prompt 2 of 2 — Applied Research screens

Design the screens for **Applied Research** using the approved design
system in this project: the canvas **"Applied Research - Design System"**
(after revisions 1b, 1c, 1d). That canvas is the authority. Every screen
inherits its tokens, type, surface/ground provenance, components, primitives,
motion, icons, and glossary. Where a screen needs something the system
lacks, extend it in the same register and say so on the artboard. Do not
re-tune any hex.

Create a **second canvas**, "Applied Research - Screens", one artboard per
screen and state, 1440 × 900 at minimum, 240 / 68ch / 320 shell.

## The system in brief (the canvas has the detail)

- **Posture.** An instrument, not a coach, in a reading room. Renders state;
  never speaks first. One exemption: acknowledgement (Save settles in 220ms
  and offers Undo for 5s as a text button; no toast).
- **Provenance by material.** Paper in the column on the ground, reading
  face. AI inset on a surface with a hairline left rule, interface face. Human
  writing outdented 28px into the left margin behind a 3px human-rule, reading
  face. A question belongs to whichever it heads: the Explain question sits
  inside the card, reading face italic, human-ink. No YOU/AI labels ever.
- **Two hues, two meanings, never on the same pixel.** Warm = what the human
  made (passage tint, human-rule, lamp, wash). Cold = what the interface
  offers (hover, active, citation under cursor, frontier line, hovered icon).
  Rest states are achromatic.
- **Pen and wash.** On light, pastel is an area under dark ink, never a line
  or letter; lines use the loaded pigment (sepia `#A8742A`, cold line
  `#2B9094`, cold-deep `#005A5D` only under the light primary's hover). On
  dark, warm appears only as light; chromatic ink on dark is the cold
  `#7BC7C9`.
- **Lamp cores are text-free.** The dark lamp (amber 70°, screen blend) puts
  its core in empty ground beside or beneath a text block. Under any text the
  field is capped at OKLCH L .40 (`#633F0C`). Map labels carry a 2px
  ground-colored halo. Light wash: same placement rule; ink is always on top.
- **Type.** Newsreader 18/1.55 on 68ch for paper and human writing; Familjen
  Grotesk 13–14 for chrome and AI; Martian Mono 12 uppercase for coordinates
  and navigation only, lowercase for citations; Fraunces 40 on 34ch for the
  Brief only.
- **Motion.** 150 touch · 220 reveal · 900 reward. Five signatures: card
  open, layer push, wash spread, stress-test landing, Playbook compile.
  Nothing moves unprompted; the paper never reflows above the eye.
- **Icons.** Phosphor Light 16px in chrome, Regular 20px+. Never Fill or
  Duotone. Chrome only, never inside the reading column, paired with a word
  on first appearance (X and Plus exempt).
- **One primary per screen** (ink-1 fill; hover cold). One bold gesture per
  screen, everything else silent.

## Product recap

A research tool for builders learning a domain to build in it. It finds
papers (papers are the only source in v1), maps the domain by prerequisite
depth, and its core surface is reading. Two entries, one home: state a
question or paste a paper; both land on a **Map** whose known territory is
lit (dark) or washed (light) and fades at the user's edge. Reading happens in
a reflowed paper where every selection offers **Explain · Note · Counter ·
Idea**; answers land as inline cards, sources open as rabbit-hole layers.
Reactions collect in the **Workbench**, whose tabs are the ladder
(**Reactions · Insights · Theses · Playbook**), where the human alone writes
insights and theses and the AI's only verbs are *show* (suggestions tray)
and *stress-test*. The Playbook and its Context pack are what the builder and
their coding agents build from.

## Rules that apply to every screen

- Real content throughout: "Attention Is All You Need" (Vaswani 2017), §3.2
  Scaled Dot-Product Attention, as the paper; "Layer Normalization" (Ba 2016)
  as the rabbit-hole source; the Brief "I'm building a retrieval layer for a
  coding agent and need to understand why attention scales the way it does."
  No arXiv ids in the reading column; locators are `Attention is all you
  need · §3.2`.
- The paper is sacred: inside the reading column only the paper, the passage
  tint, cards, human paragraphs, margin markers, citations, and the toolbar.
- Render dark first. Screens 3, 4, 8 and 10 also in light.
- Mark on every artboard: its one bold gesture (or "silent"), its one primary
  (or "none"), and any extension to the system.

## Screens

### 1. New project

The whole screen is the **Brief** field in Fraunces, 40px, 34ch, empty with
placeholder "I'm building … and need to understand …". Dark: one lamp field,
core above-left of the field in empty ground, L .80 there, ≤ .40 under the
text. Light: the wash beneath, densest off the text. Beneath the field, two
text buttons: **Start from a question** · **Start from a paper** (accepts a
URL, DOI, arXiv id, or PDF drop; show the drop state). No sidebar, no other
chrome. Bold gesture: the lamp / wash. Primary: none until the field has text,
then **Start** appears.

### 2. "What do you already know about attention?"

Question door only. The Map is already drawn, foundations at the bottom, all
bands dark. Two or three **seam** bands carry the **calibration control**
(Know it · Heard of it · No idea, segmented, hairline, selected ink-1).
"Heard of it" reveals a reading-face field beneath: "Explain it in a
sentence." Show one filled in; it renders as human writing (outdent, rule),
and becomes the project's first Note. A **Skip** text button and the line
"Under two minutes." Bold gesture: the map appearing already drawn. Primary:
**Continue**.

### 3. Project home · Map

Left sidebar open (projects, then sources by depth, each with its 22px
**spine**). Center: the Brief header (Fraunces 40/34ch, lamp or wash beneath,
core off the text), then full-width strata. One lamp field under the whole
map; bands transparent over it; dot grid beneath. Concept labels mono
uppercase with halo; papers as short titles in mono lowercase at their
depth, read ink-2, unread ink-3, hover ink-1 with a cold underline and the
full title on a surface. Frontier: 1px cold line between the last lit band
and the first dark one, "Your edge" in ink-2 at its right. Selecting a dark
band opens its detail in the right sidebar: description, "0 sources read",
and the one primary **Find papers for this**; beneath it, **search result
rows** (title, authors-year mono lowercase, one-line abstract, Add text
button) landing on the map at that depth. Sidebar footer: the **ladder
readout** (Facts · Notes · Insights · Theses with counts; Facts in the UI
face, the rest in the reading face). Show two states: a question-door
project (light rising from the bottom, dark above) and a paper-door project
(a lit slice near the top, dark beneath). Bold gesture: the lamp / wash.

### 4. Reader

Locator atop in mono. Paper reflowed in Newsreader on 68ch. Left sidebar:
sources with spines, active row on surface. Right sidebar: **Arguments ·
Questions · Annotations**, Arguments active, the paper's claims, grounds and
rebuttals as a compact list anchored to passages (no diagram). Reader edge:
the **spine as the scroll track** (left ticks asked, right ticks said) and
the **edge strip**, one dot, "1 deep". Show in one column: a passage with an
open **inline card** (question italic human-ink, answer ink-2, citation ink-2
12px at sentence end, **Ask follow-up · Note in my words**); a second
selection with the **toolbar** anchored, hover state showing "Explain ⌘K"; a
human Note outdented behind the rule; a paragraph with two **margin
markers** (an open counter ring and a note stroke); a citation under the
cursor gone cold. The one-time first-paper hint, dismissible, anchored to
the first paragraph: "Select any passage to ask about it." Bold gesture: the
card opening (storyboard the below-only reflow in three frames). Primary:
none.

### 5. Reader · 2 deep

A rabbit-hole layer over screen 4. **Path bar** atop: `Attention is all you
need › §3.2 › √dk scaling · 2 deep`, Esc in its own slot; the origin passage
pinned beneath with the passage tint; below, "Layer Normalization" as a full
reader with the same toolbar and one card of its own. Edge strip: two dots,
current in human-ink. Left sidebar collapsed (⌘\). The §3.2 paper behind,
dimmed 40% and receded 4px. Also show depth 4 with the path bar collapsed in
the middle. Bold gesture: the push (three frames).

### 6. Workbench · Reactions

Tabs are the ladder with counts: **Reactions 41 · Insights 6 · Theses 2 ·
Playbook**. Left: reactions grouped by map layer; each group header carries
its asked/said composition bar (ink-2 / human-ink) and "9 asked · 0 said".
AI-answered questions keep the mono `question` label and no rule; human
reactions show their margin-marker glyph in the gutter left of the 3px rule,
reading face. An open Counter shows its three resolutions in plain words;
one resolved as "The paper has a problem" shows the single action **Start a
Critique**. Right: "An insight from these", a reading-face field with the
rule, a Cites row (evidence objects + Cite), primary **Save insight**.
Show the Save acknowledgement: settled, with **Undo** for 5s. Silent.

### 7. Workbench · Insights

Same two-column rung. Left: insights as human paragraphs (outdent, rule),
each with its citation trail; one click cites an insight into the right.
Right: a thesis being started from insights: the **Kind** segmented control
(Critique · Gap), then the spine fields: *The claim* (reading face, rule),
*Evidence* (evidence objects + Cite), *What would prove me wrong*; the kind
field beneath. Save disabled with "Spine incomplete: what would prove me
wrong". Primary: **Save**. Silent.

### 8. Workbench · Theses

Two thesis cards, one **Critique** and one **Gap** (with *what the industry
does instead*, human-written, no tray). The Critique card has the
**suggestions tray** on a surface beside its human field, evidence sitting
un-inserted with Cite. One thesis has a **stress-test result** open: the
strongest cited case against it from the user's own papers, each citation at
its sentence end, "2 of 3". Bold gesture: the stress-test landing (three
frames, 220 each at 60ms stagger). Primary: **Stress-test**.

### 9. Workbench · Playbook

The compiled document on the ground: theses first, insights under them,
facts last; Facts on surfaces, everything human on the ground with rules;
every thesis carrying its citation trail. A second document tab, **Context
pack**. **Copy** and **Download** as text buttons with Phosphor icons, and
the line "Plain markdown, in your own vault." A thin Theses section should
look thin. Bold gesture: the compile (three frames, 900). Primary: none.

### 10. ⌘K finder

A single field over the reader, Phosphor MagnifyingGlass. Results grouped
Papers · Annotations, each with a mono locator, hover cold. (⌘K on a
selection is Explain; ⌘K otherwise is this.) A lookup, not discovery.
Minimal.

## States (their own artboards)

- **Paper ingest.** Sections arriving one by one into the reading column,
  the locator first; a 1px ink-2 caret at the end of the last section. No
  spinner, no skeleton. The only multi-second wait in the product.
- **Parse failure.** One block as a crop of the original PDF on a surface,
  "This region didn't parse. View original PDF" with ArrowSquareOut.
- **Equation** rendered as a crop inline.
- **Collapsed inline card** on re-read: the question, italic, nothing else.
- **Calibration with an empty seam**: the step skips itself; show what the
  user lands on instead.
- **Empty Workbench**: "Theses held: 0 · Counters unresolved: 14." Nothing
  else. No illustration.
- **Light** of screens 3, 4, 8 and 10.

## Out of scope

Mobile beyond a read-only paper, collaboration, settings, billing, marketing.

## Deliverable

Canvas "Applied Research - Screens": one artboard per screen and state,
ordered as above, titled with screen name and theme. Each artboard carries:
bold gesture or "silent", the primary or "none", and any extension to the
system with why. Dark first, light second.
