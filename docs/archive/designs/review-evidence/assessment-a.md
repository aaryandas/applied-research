# Assessment A — independent design-director review

Reviewer: `/root/design_review`. Reviewed 2026-09-05. No detector output was read. Audit only; imported originals were not edited.

## Scope and evidence

Targets: `docs/designs/Design System Canvas Setup/Applied Research - Design System.dc.html` (abbreviated **DS**) and `Applied Research - Screens.dc.html` (**Screens**). Line references below refer to those original files, not transformed copies. Context: the original design-system prompt, revisions 1b/1c/1d, screen prompt, and current `docs/mvp-prd.md` (**PRD**).

These are design canvases, not an implemented Electron application. Screens contains 28 artboards and an empty `renderVals()` component (Screens:880–883). Keyboard navigation, saving, citations, streaming, scroll restoration, and motion are therefore evaluated as design contracts and represented states, not claimed as tested application behavior. Static controls failing to save would not be a meaningful defect in this deliverable. Fixed 1440×900 boards, oversized reference sheets, and desktop scope are deliberate; canvas scrolling is not evidence of a responsive app defect.

Browser inspection used two fresh, independent localhost tabs through CUA. Visually inspected system posture, provenance and color, and product map, dark/light reader, Reactions, Insights, Theses, Playbook, finder, and empty Workbench. Source and rendered DOM covered the remaining families/states. The native screenshot helper failed with “IAB visibility is not supported in a subagent thread”; the documented `tab.screenshot()` API succeeded. A temporary viewport was requested to fit the authored desktop board, not to infer mobile behavior. No detector overlays were used.

Authority matters: the current PRD makes paper entry, Reader, Workbench, Settings, and context export core; Map/rabbit holes/finder are stretch 1 and question entry/calibration/stress-test stretch 2 (PRD:21–39). The screen prompt explicitly excluded Settings (prompt-2-screens.md:214–216). Its absence is now an implementation-handoff gap, not a failure to follow the earlier screen prompt. The current PRD also changes the Reactions ordering and Playbook order. These conflicts need explicit decisions before implementation.

## Design specificity verdict

This has a distinctive product idea expressed in the interface. The reading serif, neutral AI inset, human margin rule, source-relative coordinates, and asked/said spine belong to a tool that captures thinking while reading. They could not be transplanted unchanged into a sales dashboard without losing their meaning. The strongest gesture is the three-voice reader, not the decorative lamp. It remains specific after the lamps are removed.

The weakness is translation from a persuasive design doctrine into a trustworthy everyday instrument. The reference system explains its conventions extensively, while the user-facing screens sometimes assume the user already understands them. Aggregation then drops some of the very provenance the reader carefully establishes. This is a coherent and promising design direction, but not a complete implementation contract.

## Nielsen scores

Scores are for the proposed task UI and represented states. They are not a WCAG certification or a production usability-test result. Higher is better; all ten apply to this work tool.

| # | Heuristic | Score / 4 | Reason |
|---|---|---:|---|
| 1 | Visibility of system status | 2 | Asked/said spines, layer counts, ingest progress and Save/Undo are useful. The empty board simultaneously says zero and two theses, and current core verification/distillation failures lack designed states. |
| 2 | Match with the real world | 3 | Paper, margin notes, cited evidence, and explicit falsification fields make sense to builders reading research. “Spine incomplete” and the asked/said encoding require learning; “known” also risks implying more than interaction proves. |
| 3 | User control and freedom | 2 | Esc restoration, sidebar collapse, removable evidence and Undo are specified. Draft persistence, editing a saved item, reopening a resolution, and recovering after the five-second Undo window are not demonstrated. |
| 4 | Consistency and standards | 2 | Strong repeated materials and typography. Source rows diverge from their component contract, crucial metadata uses a non-text token, and document/context behavior disagrees across artifacts. |
| 5 | Error prevention | 2 | Evidence and falsification requirements stop incomplete theses; evidence is explicitly inserted by the human. Missing reachable-ID/key/export/citation-integrity states leave major current-core decisions undesigned. |
| 6 | Recognition rather than recall | 3 | Four labeled selection verbs, citations beside claims, writing beside source material, and breadcrumbs reduce recall. Ambiguous short citations in project-wide documents and unlabeled spine tick direction reintroduce it. |
| 7 | Flexibility and efficiency | 2 | Selection shortcut, finder, source ticks, and direct “Cite into thesis” offer good accelerators. Current-core Reactions filters are absent; longer lists and keyboard/focus mechanics remain unproven. |
| 8 | Aesthetic and minimalist design | 3 | The reader has a strong typographic hierarchy, quiet chrome, and restrained color. The two-thesis board becomes four competing writing/evidence zones; low-contrast metadata is over-subdued rather than truly simplified. |
| 9 | Error recognition and recovery | 2 | Parse failure points directly to the original PDF; incomplete spine identifies the missing field. No designs for failed answer, unsupported citation, failed argument distillation, or failed export. |
| 10 | Help and documentation | 2 | First-paper selection hint, inline field prompts, Esc and finder cues provide basic contextual help. The hint never returns, the empty ending has no route to its 14 counters, and the pack has no usage/install explanation. |
| | **Total** | **23/40** | **Acceptable — substantial completion work required.** |

## Three strengths to preserve

1. **The reader separates three voices without badge clutter.** Newsreader on ground is paper; UI sans on an inset is the answer; the margin rule identifies the reader’s own statement. The human question can remain next to its answer while its italic reading face preserves its origin. Both themes retain this distinction (DS:74–118; Screens:262–270, 298–306). This is functional visual authorship, not merely branding.
2. **The workbench puts the raw material next to the act of thinking.** Reactions beside an empty/actively written insight and insights beside thesis fields provide scaffolding without writing the claim for the user. The required evidence and falsification spine gives the product a concrete intellectual method (DS:415–448; Screens:419–434, 485–495). Keep the human-controlled Cite interaction.
3. **Motion is tied to orientation and earned completion.** Below-only card insertion, exact-line return, three durations, and reduced-motion end states are an excellent doctrine for sustained reading (DS:667–713). The quiet Save/Undo is a better fit than a celebratory notification. These are strengths of the specification; the static export does not prove they run correctly.

## Five priorities

### 1. P1 — Complete the core trust states and make counts internally honest

The empty Workbench has `Insights 0 · Theses 0` in its tabs and “Theses held: 0,” but the same screen’s sidebar reports `Insights 6 · Theses 2`, plus 38 Facts and 21 Notes (Screens:871–874). “Nothing to compile yet” is not credible beside those facts and notes. This is a fixture contradiction inside one artboard, not a claimed production bug; it nevertheless undermines the exact status language that the product treats as its main source of reassurance.

The ingest rail says “Arguments appear once the paper is read” (Screens:732). That conflates machine processing with the human finishing the paper. The current PRD explicitly requires a running and retry state for distillation, unsupported citations, unreachable-ID errors that preserve the form, and API-key errors (PRD:110, 114, 122, 132). None has a corresponding screen. One understated caret cannot express every kind of wait or failure.

Create a small paper-first core state set before implementation: entry ready/invalid/processing; Reader answer waiting/streaming/unsupported/failed; Arguments running/unresolved/failed; compile/export ready/working/failed/saved. Keep neutral language and preserve the reading posture. Reconcile each artboard’s counts from one fixture and distinguish “no theses yet” from “no usable output.” Settings and the actual Context pack surface are required next because of the new PRD, not because the original screen assignment omitted them by mistake.

### 2. P1 — Preserve provenance when material becomes a thesis or exported document

The strongest provenance system weakens when content leaves the reader. “Cite into thesis” explicitly lands an insight’s **citations** into Evidence (Screens:495), while the label sounds as if it cites the human insight itself. The visible result cannot show which interpretation connected those source passages to the thesis. The event model already supports references to events (PRD:90, 126); the design should expose that chain rather than flatten it.

Project-wide Evidence and Playbook sentences repeatedly use bare `§3.2.1` alongside references to Shen or Ba (Screens:489, 512, 530, 608–618). A same-paper abbreviation works inside the reader; a compiled multi-paper document needs an unambiguous paper identity at rest. The current active sidebar row is not an adequate citation convention for a downloadable document.

The Playbook has Theses, Insights and Facts but no Notes despite the sidebar showing 21 (Screens:607–619). This matches the older screen prompt’s specified order, but contradicts the current PRD’s Facts → Notes → Insights → Theses contract (PRD:130). The strongest design resolution might still put theses first; choose that explicitly and update the contract. Do not silently lose Notes. Also depict the Context pack itself and its export acknowledgement: Copy/Download and “Plain markdown, in your own vault” promise more than a second inactive tab specifies (Screens:604).

### 3. P1 — Finish the readable-text contract; restraint should not hide navigation

The system’s own contrast table labels ink-3 on ground at about 3.7:1 dark / 3.3:1 light and assigns it to non-text (DS color audit near :249–257). Yet product navigation, inactive project names, source author/year metadata and status helper text repeatedly use ink-3 at 12–13px (e.g. Screens:254–257, 273, 492). These are information people need, not decoration. In browser inspection the reader body remains comfortable while the tabs and source coordinates noticeably recede past the useful point. Prioritize those roles in the text-token correction; do not brighten every hairline or flatten the whole hierarchy.

The four-family type system is purposeful overall. A separate narrow-measure problem affects new project: `width:34ch` sits on a container inheriting the UI face and size, while its child is 40px Fraunces (Screens:30–32). The rendered Brief is only roughly 310px wide, producing a small, awkwardly broken prompt and cramped entry choices in a 1440px screen. Apply the measure at the display text’s own font context. This is a layout implementation detail inside the exported design, not a request for more ornamental content.

For the production handoff, specify semantic labels and focus behavior for spine ticks, pen marks, citation peeks and custom segmented controls. DS:311, 330, 372, 397 specify 24px hits; they do not establish keyboard or screen-reader behavior. Do not infer accessibility from the static span-based canvas.

### 4. P2 — Make Workbench scale around one active thinking task

The Reactions and Insights screens mostly succeed. The Theses screen simultaneously presents Critique, Gap, multiple evidence rows, a Suggestions tray nested beside a narrow human field, and an open stress-test (Screens:509–538). The nested tray squeezes the writing measure to about half of an already half-width workbench column. In the browser, the eye has to choose between the two claims and three adjacent evidence/result surfaces. Empty space below does not compensate for density exactly where the user needs to compare meaning.

Keep a thesis list/context region and one active thesis editor; reveal the relevant evidence tray or stress-test beside that editor. This retains the useful material-to-writing adjacency without comparing two thesis forms by default. Add the current PRD’s type/paper filters to Reactions (PRD:124), and define how a user edits or reopens a saved reaction/thesis. A weekly cohort assignment will exceed the handful of carefully selected specimen rows quickly.

For the stretch rabbit-hole flow, make the right rail follow the frontmost source. The 2-deep center says “Layer normalization · §3” but its Arguments rail is still the original attention paper’s five claims (Screens:339–357). That contradicts the system’s “always about the thing in front of you” rule. This is a visible context mismatch in the fixture, not an inference about runtime state.

### 5. P2 — Resolve the removed material’s semantics and stale handoff language

Screens:24 explicitly says “lamp and wash fields removed at review.” Treat that as a documented design change. The unlit map and new-project screens are not grounds for blindly restoring gradients. However, the individual headings/notes still claim a lamp, lit slice, brightness and halo behavior (Screens:27, 36, 84, 137 and corresponding map states). The system still devotes substantial material and motion definitions to it (DS:334–354, 695–697).

Removing the lamp removes a status encoding, not only a hero decoration: known and unknown territories now rely mostly on faint paper text and a single frontier line. The paper-door case can contain a known island with unknown prerequisites below; one boundary does not explain that state well. Decide a replacement that works without a gradient—explicit band status, a restrained region treatment, or a compact legend—and update the captions/system. Since Map is stretch, this follows completion of the reader and export loop.

## Component-family review

| Family | Assessment and next decision |
|---|---|
| Ground/surface/human material | Strong in the reader and thesis editor. Material exception for the human question is well documented. Questions in Reactions and finder should retain an accessible author identity even where visible labels stay minimal. |
| Type and display | Distinct roles, beautiful reading rhythm, and a Brief that sounds like a builder’s intent. Source titles unexpectedly switch from system UI face to Newsreader and metadata switches from map layer to author/year (DS:358–365 versus Screens:257). Either ratify that sensible bibliographic treatment or align the component contract. |
| Warm/cold color | Warm marks human contribution and cold indicates a touched control; both light and dark readers remain coherent. The 1c/1d revisions explicitly authorize the cold hue, so cyan is not an original-prompt violation. No need to revive the original straw-only system. |
| Buttons/inputs/focus | Rest/hover/focus/active/disabled specimens are a strong foundation. Inline disabled explanation is useful but too subdued. Saved and editable human paragraphs look similar; define how editing begins. |
| Selection toolbar | Four plain verbs and Explain shortcut are excellent. First-paper hint makes selection discoverable. The fallback for keyboard text selection and persistent access to the dismissed hint remain handoff questions (Screens:261, 268, 280). |
| Inline card/streaming/collapsed | Question and answer read as one exchange; citations at sentence ends reduce interruptions. Define pre-first-token, stop/retry, unsupported citation and long-answer overflow. DS says long content becomes a layer (DS:285); current PRD says card scrolls internally (PRD:114). |
| Rabbit hole/path/edge dots | Pinned origin and first/last breadcrumb retention are good orientation. Define very deep stacks and keyboard pop behavior; fix the source-mismatched Arguments rail. This is stretch scope. |
| Spine/source rows | Asked/said is a clever non-evaluative distinction; no false maximum or completion percentage. Tick direction is not self-evident, and dense long-paper ticks need clustering/selection rules. A hover-only explanation is insufficient as the sole learning path. |
| Map bands/discovery/search rows | Strata communicate prerequisite depth without a draggable graph. Removing the known-territory material leaves the state less legible. Author strings consume multiple lines inside the narrow discovery rail; compact authors while preserving year and a full-title peek. |
| Margin marks/type labels | Bespoke pen marks carry warmth without stickers. Counter outline/fill correctly encodes only a state that exists. Keep text alternatives and a focused/hover explanation for the less obvious hook/star. |
| Citation/peek/evidence objects | Unboxed prose citations and removable evidence objects are the right distinction. Project-wide citations need paper identity; keyboard peeks and citation-error rendering still need design. A citation should not masquerade as an author badge. |
| Counter resolution | Three plain choices articulate different intellectual outcomes. “The paper has a problem” spawning a draft versus exposing a second “Start a Critique” action differs across DS:411, Screens:429, PRD:118; choose whether the second action opens an existing draft or creates one. |
| Thesis kind and spine | Segments correctly express a kind rather than navigation. Evidence/falsification fields serve the product’s method. Show editing a saved thesis, kind changes with existing text, and a draft with no valid evidence. |
| Suggestions/stress-test | Separate AI tray is a substantive protection of authorship. “2 of 3” is ambiguous without knowing it counts arriving items, not certainty. Specify coverage wording and keep the industry half outside the tool’s verification claim. Stress-test is stretch 2. |
| Ladder/Workbench tabs | Counts and type distinction are quiet and useful. Notes have a footer count but no dedicated rung; show their filter/path in Reactions and their place in the output. Fix contradictory empty counts. |
| Playbook/Context pack | Human-first reading order is editorially strong but conflicts with current PRD. Notes and thesis falsification/context need an explicit inclusion rule; display the pack’s contents and destination. |
| Empty/parse/equation states | Honest emptiness and inline PDF fallback fit the product. Empty should still provide a direct route to the referenced counters. Equation artboard caption says crop while its note says KaTeX and current PRD says selectable MathML (Screens:759, 770, 779; PRD:112); distinguish representation from implementation. |
| Icons | Thin Phosphor chrome fits the pen marks. Words on first appearance are sensible; inspect sidebar collapse and other wordless exceptions during implementation rather than assuming all unlabeled SVG specimens are production defects. |
| Motion | No ambient motion and below-eye stability suit close reading. DS says only 150/220/900 but still labels storyboard endpoints 280ms and ~1100ms (DS:689, 697); clean the stale durations. Actual interruptibility/reduced-motion/focus restoration is untested. |

## Cognitive load

The intrinsic load—understanding attention, forming an argument, and writing a falsifiable claim—is intentionally substantial. The product should preserve that useful work. Inline explanations and juxtaposed evidence convert it into productive learning effort. Extraneous load comes from memorizing visual conventions, resolving ambiguous references, and deciding which writing task the current rung represents.

| Checklist | Result |
|---|---|
| Single focus | Mixed: strong in Reader; fails in the two-thesis/evidence/stress-test board. |
| Chunking | Mixed: four toolbar verbs and four ladder tabs; five equal-status Arguments entries, five sources and five map bands need scanning. These counts alone do not prove overload because they are structured lists. |
| Grouping | Pass: cards, margin rules, evidence rows and adjacent writing panes express relationships. |
| Visual hierarchy | Pass with a text-contrast caveat; paper/claim generally leads. |
| One decision at a time | Fails on Theses; two full thesis spines and multiple AI contributions compete. |
| Minimal choices | Mixed: main controls are restrained, but selecting from five sources or five argument entries is a >4-option point. The thesis board adds at least six Cite affordances and two Stress-test affordances across competing contexts. |
| Working memory | Fails for project-wide bare citations and hidden meaning of spine direction. |
| Progressive disclosure | Pass in the intended selection/card/layer flow; mixed in the all-open thesis specimen. |

Reader: approximately two checklist weaknesses, moderate load. Theses: four weaknesses, high load within this specimen. Do not label the whole product cognitively overloaded merely because its design-system canvas displays many components at once. That is reference-sheet density.

## Emotional journey and delight

Entry should feel like setting down a purposeful research question. The present very narrow Brief and lack of a clear filled/ready state make it feel more tentative than the rest of the tool. First reading is the strongest moment: scholarly text gets room, a useful answer appears beside the question, and a warm rule gives the user’s own words visual dignity.

The danger valley is after reacting. “9 asked · 0 said” may provoke useful reflection, but repeated numerical absence can also feel like an assessment of the user—especially for a cohort producing weekly work. A status instrument can stay non-coaching while making the next self-directed action clear. One-time instruction that never returns and an empty Playbook that reports only what is missing leave that valley unresolved.

The intended peak is a thesis surviving—or changing under—a cited stress-test; the intended end is an artifact usable by a coding agent. The current output composition has the right restraint, but the missing Notes/Context pack state and conflicting counts weaken confidence at exactly that ending. The most fitting delight is precise return to a passage, a trustworthy preserved draft, and an export that visibly contains the user’s unchanged words. More decoration is unnecessary.

## Persona checks

**Alex, impatient power user:** Four selection actions, finder and direct citing reward experience. Red flags: no represented type/paper filter in a 41-reaction inbox; no visible saved-item edit path; the currently core workflow may appear to require map/question work that is now stretch. Prioritize one paper-to-export path that needs no map.

**Jordan, first-time researcher:** The selection hint and “what would prove me wrong” field provide excellent contextual teaching. Red flags: no explanation of insight versus idea, asked/said tick direction learned only on hover, “Spine incomplete” jargon, and an empty state that does not link to the counters it references. A field-level example or on-demand explanation can clarify without proactive coaching.

**Sam, keyboard/low-vision reader:** Reading body and human marks provide good spatial cues. Red flags: low-contrast active-use metadata, small drawn pen marks whose 24px targets remain a specification only, hover-only citation previews, and no demonstrated focused/announced context when a layer changes. Desktop scope does not exempt keyboard, zoom, or screen-reader support. No mobile penalty is assigned.

## Questions for synthesis

1. Is the exported Context pack meant to preserve the chain from source → reaction → insight → thesis, or only attach original paper citations to final claims?
2. After removing lamps/washes, what exactly tells a reader which map territory is known, especially when known material forms an island above unknown prerequisites?
3. Should an empty thesis section prevent a useful Playbook export when the user already has facts and notes?
4. Which authority should implementation follow for Playbook ordering and long answers: the final design canvas or the current PRD?

Questions are supplied to the parent for the combined critique; this independent review does not ask the user directly.
