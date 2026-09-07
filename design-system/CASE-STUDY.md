# Field Atlas: giving rigorous research a sense of possibility

**Subsequent user-directed revision:** The user replaced the rocky arch with a vibrant centered tree, preserving the engraved illustration style and blue field. The current hero places its title above the tree; desktop and mobile use dedicated compositions. The account below retains the initial design decisions as case-study history. See [current artwork and prompts](assets/TREE-ARTWORK.md).

The original Applied Research system had a strong intellectual premise: the source, the machine, and the human should have different visual voices. Its weakness was the distance between that premise and a dependable working experience. The canvases were attractive arrangements of states, but counts drifted, verification language overreached, completion threatened unfinished writing, and too much meaning depended on subtle material differences. The full evidence remains in [the original teardown](../docs/designs/applied-research-design-case-study.md).

The new direction responds to a second, equally important request: research should feel like entering a world worth exploring. The user’s [World Labs reference](https://www.worldlabs.ai/) makes that ambition concrete. Its blue field, monumental serif typography, and finely engraved impossible landscape combine the cultural authority of an old scientific book with an expansive, contemporary imagination.

Field Atlas takes those principles into Applied Research. It uses an original stone arch and observatory rather than borrowing the globe image. The arch expresses entry; the observatory suggests looking carefully. The image invites curiosity without pretending to be a map of the user’s knowledge. This matters: activity counts and illustrations cannot substantiate claims about mastery.

## The central design decision

Wonder lives around the work. Reading and writing take place on an opaque, warm surface. The imagery appears at arrival, around the example workspace, and at the close. It does not drift behind text, shimmer while someone reads, or compete with a selected passage.

This is a deliberate distribution of intensity. The opening can be expressive because the task surface is disciplined. Applying the same intensity everywhere would exhaust the identity quickly; removing it from every useful screen would reduce the art direction to a marketing facade. The blue perimeter connects the two.

The optional background-presence question received no answer during the build. The implementation therefore follows the stated default: visible landscape around an opaque reading surface. This is a reversible art-direction choice, not an inferred user confirmation.

## From first pass to second edition

| First-pass issue | Field Atlas decision | Evidence in the reference | Remaining production work |
|---|---|---|---|
| A strong but austere visual world | Original engraved landscape, mineral blue, expansive editorial scale | Opening, workspace perimeter, closing, original asset | Establish image commissioning and cropping guidelines for further projects |
| Four competing type roles | Two families: Source Serif 4 for expression/reading; Hanken Grotesk for tools | Typography specimen, Reader, notes, controls | Validate real equations, multilingual glyphs, long papers, operating-system rendering |
| Low-contrast metadata | Separate readable metadata token; structural borders may be quieter | `tokens.css`, contrast evidence, both themes | Full accessibility audit in Electron |
| Authorship depended too heavily on material | Explicit author labels alongside serif/sans, inset/outdent, blue/warm distinctions | Three-voice specimens, reaction rows, export | Enforce author constraints in shared types and database |
| Citation resolution resembled semantic verification | “Source matched” and “Interpretation needs review” are separate | AI example, source dialog, Playbook | Real span validation, citation-integrity work, calibrated confidence |
| Dubious source examples | A narrow variance argument with stable paper/section identity; text labeled as paraphrase | §3.2.1 and PDF footnote 4 | Bind to production sentence IDs and original page rendering |
| Counts differed between canvases | One state model feeds all reaction counts and outputs | Save → Workbench → Playbook | Event-log folds rather than browser-local demonstration state |
| Incomplete theses felt unsavable | Draft persistence is automatic; completion has explicit requirements | Thesis form, reload behavior | Vault durability, append-only revision semantics, crash recovery |
| Two theses and nested trays competed | One active writing spine with claim, evidence, and falsifier | Workbench | Multi-thesis list and selection model |
| AI errors and unsupported answers lacked a language | Ready, waiting, unsupported, and failed specimens, with recovery controls | Craft state lab | Actual cancellation, streaming, retry limits, distillation and ingestion failures |
| Output order and authorship drifted | Brief → Facts → Notes → Insights → Theses; ideas remain labeled ideas | Playbook and sample export | Human-only insight promotion and production Context pack compilation |
| Settings were absent | Appearance and local-storage preferences plus truthful service status | Preferences dialog | Provider validation, safeStorage, vault chooser, GitHub device flow, MCP controls |
| Motion existed as storyboard claims | Actual 150/220/700 ms contracts, reveal/replay, reduced-motion override | CSS and live specimen | Interruptible production stream/selection transitions; real performance profiling |
| Responsive behavior was unknown | Desktop three-column Reader; companion below at medium widths; linear reading on narrow widths | Desktop and 390 px screenshots | Electron minimum-size testing, 200% zoom, assistive-tech sessions |

## Color: a small vocabulary with real assignments

Mineral blue `#285F8C` carries exploration and action. Warm paper `#F7F4ED` reduces the starkness of a white application surface without becoming a simulated parchment texture. Graphite `#232C32` carries primary text. Human ink `#8B4C2D` marks contributions in the margin and in authorship labels.

Day and evening use semantic aliases rather than a blanket inversion. Evening paper becomes `#172A35`, the working surface `#203642`, text `#F3EFE4`, and metadata `#B4C2C7`. Action blue and human ink both become lighter so their roles survive against the darker grounds. Success and failure have separate tokens, but never replace text explaining the state.

The illustration has its own tonal range. Its blue is textured and variable; a CSS color cannot reproduce every part of the image. At responsive crop boundaries, that difference must be handled intentionally rather than assumed away. Independent review caught a hard join in the first mobile treatment; the finished reference uses a separately generated portrait composition with a continuous sky. Workspace captions also have an opaque blue backing so pale terrain cannot compromise them.

## Typography: one expressive voice, one operational voice

Source Serif 4 joins the large title and the small reading paragraph. The shared family makes the identity feel coherent without forcing a fragile display face into 18 px prose. Its italic provides expressive difference without adding another family. Hanken Grotesk has enough character to make the controls feel authored while remaining quiet beside the paper.

Reading uses 18 px text, 1.65 line height, and a maximum measure of 64 characters. Interface text sits primarily at 12–16 px; small text is not made low contrast to create hierarchy. Narrow layouts keep the reading size and rearrange the surroundings. They do not miniaturize the desktop.

The cost is deliberate: local font files add roughly 939 KB before transport compression. Only the weights and styles actually used are included. The original image is retained for future art direction; the desktop page loads the 457 KB WebP. Mobile arrival uses a dedicated 210 KB portrait WebP; the workspace still uses the landscape variant. There is no claim of a measured Core Web Vitals score or production latency.

## Components: authorship is a contract

The paper is open and stable. AI content occupies a lightly inset blue surface, uses the UI face, and names its source status. Human writing has a warm margin marker, a serif body, and a literal authorship label. This retains the first pass’s best idea and makes it legible when color, styling, or context is lost.

The detector flags the warm margin markers as a generic side-border pattern. They are retained intentionally: this is an established product-specific authorship grammar, reinforced by words, not decoration added to otherwise interchangeable cards. Its limits are clear: do not attach the marker to every miscellaneous panel.

Controls use a restrained corner system: small radii for text fields, source surfaces, and local controls; pill geometry for deliberate primary actions; one larger radius for the workspace boundary. There are no floating decorative tiles, competing icon families, or gradients substituting for authored imagery. The small arch mark is drawn in vector to match the actual illustrated threshold.

## Interaction: keep the reader’s place

The source preview is a native modal dialog. It opens from an explicit control, supports Escape, and restores focus to the trigger. It does not depend on hover, so keyboard and touch readers have the same inspection path. Sources are identified by title, paper identifier, section, and reference context outside the Reader.

The demonstration action toolbar is associated with a fixed highlighted passage. It is not a claim that arbitrary text selection or the production anchoring pipeline has been implemented. Notes, counters, and ideas accept the user’s own text. A counter keeps its resolution; the “paper has a problem” path attaches evidence to the thesis workspace without writing the thesis for the human.

All reactions are folded from one local state collection. The Workbench is chronological and filterable by type. Only one paper exists in the example, so a paper filter would be ornamental; its production contract still requires one. When a filter has no matching items, the UI distinguishes that from a project with no reactions.

The thesis keeps unfinished text as the user types. The completion button remains unavailable until the claim, evidence, and falsifier exist. Changing a completed thesis returns it to draft. This separates durability from judgment: a thought should not need to be good enough to deserve being kept.

## Motion and delight

The original work specified a rhythm but did not implement it. Field Atlas uses a brief initial arrival, local reveals, tactile press feedback, and an explicit replay specimen. The timings are 150 ms for touch feedback, 220 ms for a local reveal, and 700 ms for first arrival. Every motion has an immediate reduced-motion equivalent.

The strongest delight is continuity: a saved thought appears where expected, unfinished work returns, and a source closes back to the original control. The illustration is already visually rich; perpetual parallax, particles, floating rocks, and card choreography would make attention itself the interface’s scarce resource.

## Export and trust boundaries

The sample export is real Markdown generated in the browser. It carries author labels, reaction event IDs, source references, thesis completion status, and open questions. Human reaction bodies are inserted without rewriting. A download notification says the file was prepared, not that the operating system successfully saved it.

It is explicitly not the production Context pack. Production still needs separate `AGENTS.md`, `SKILL.md`, and reference files, hash provenance, schema checks, text sanitization, safe quoting, and the PRD’s byte-preservation requirements. These must be implemented in the trusted Electron side, not inferred from an attractive renderer. The existing PRD remains the source of truth for that work.

## What a studio would validate next

This edition is a designed and tested reference, not evidence of user preference or comprehension. Ask real readers to explain who wrote each item, inspect a doubtful claim, recover an interrupted thought, and find what changed in their Playbook. Observe whether the illustration improves orientation or becomes visual noise during longer sessions. Test a dense technical paper with real figures and equations, not only a single inviting passage.

A successful next iteration would preserve the visual confidence while making the production pipeline equally dependable. The bar is not more ornament. It is the same level of care in failure, recovery, and evidence as in the opening image.
