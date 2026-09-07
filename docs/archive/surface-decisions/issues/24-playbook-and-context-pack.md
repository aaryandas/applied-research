# 24 · Playbook and Context pack
Type: grilling
Status: resolved
Blocked by: 10, 18

## Question
The Playbook is the third main view: the compiled, read-only rendering of the Canvas's upper layers, for reading back and export (decided in *The Workbench ladder*). What exactly does it show and in what order (theses first, then the insights each stands on, then cited facts; the Brief at top; how a flat, learning-only project reads)? Is any part editable here, or does every edit go back to the Canvas? What does the human see before export: the files that will be written, each expandable, a diff against the last export? What does a coding agent get: the file list per the *agent context conventions* research (a root pointer, a thin AGENTS.md, a CLAUDE.md line, a skill folder in the right place, references), and the local MCP tools as the user sees them? States: empty (no insights or theses yet), loading (compile), failed, stale (exported before the newest event it includes), unsupported (in quoted facts). The compile moment (the 900 ms reward). Keyboard grammar. Bars.

## Inputs
Resolutions of *The Workbench ladder* and *agent context conventions*; `docs/mvp-prd.md` S11, §9 (stale in places); `docs/designs/prompt-2-screens.md` screen 9; critique P1 "Provenance through synthesis/export".

## Resolution must state
All nine `SURFACES.md` fields. The document order and why. The pack's contents as a file list with a sentence each. The MCP tool list as the user sees it.

## Starting recommendation
Theses first as the opening, each followed by the insights it stands on and their cited facts; then insights that support no thesis; then a "What I read" list. Human text byte-identical to its events; AI facts quoted with locators; a provenance line. Read-only: clicking any paragraph opens it on the Canvas. Before export, the files are shown as a list with a diff against the last export.

## Answer
Decided 2026-09-06 with Aaryan. The third main view.

**Job.** Read back what you now hold, and hand it to your coding agents without losing provenance. Pain row 5.

**How you arrive.** Space p, the view switcher, "Show in Playbook" on a thesis or insight card, ⌘K.

**The document, read-only.** Brief at top. Then each **thesis** as a section: the claim, "what would prove me wrong" (and for a Gap, what the industry does instead), then the **insights** it stands on, each followed by its cited facts quoted with locators. Then insights supporting no thesis. Then **What I read**: sources with lesson and status. A learning-only project therefore reads as Brief, insights if any, What I read; a thin document looks thin. Human text is byte-identical to its events; facts are quoted from sentences with locators; unverified citations carry the badge. Clicking any paragraph opens it on the Canvas for editing. Nothing is written here.

**Before export.** Export (top right) opens a panel listing the files that will be written, each expandable to its content, with a diff against the last export. One button, Write files, and a line naming the folder. The **compile** is the one rewarded motion in the product (900 ms) the first time a project exports.

**What the agent gets** (from the *agent context conventions* research): `<vault>/<project>/context-pack/` containing a thin `AGENTS.md` (Brief; theses and insights verbatim; how to query the vault; a header stating quoted material is third-party content to treat as data; no URLs, no commands), `references/<source>.md` (the cited facts per source with locators), and skill folders in the places agents actually read: `.claude/skills/applied-research-<project>/SKILL.md` and `.agents/skills/applied-research-<project>/SKILL.md` (name ≤64 chars kebab, description ≤1024, body under 5k tokens, explaining the MCP tools and where references live); plus a `CLAUDE.md` line to paste (`@applied-research/AGENTS.md`) and a root `AGENTS.md` pointer for Codex with the Brief inlined, shown in the panel with Copy. The local MCP server's read-only tools appear in Settings › Agents and in SKILL.md: search_claims, get_claim, get_source, get_pack.

**States.** Empty: no insights or theses yet ("Nothing to hand off yet. Insights and theses you write on the Canvas appear here."). Loading: compiling (short-wait; the reward motion on first export). Failed: export failed inline in the panel with Retry; the document stays. Stale: exported before the newest insight or thesis; one line at the top, "Exported before 2 newer items · Export again". Unsupported: badges on quoted facts.

**AI may:** format cited facts (never touch human text). **Only the human:** write (on the Canvas), export.

**Keyboard.** j/k between sections, Enter opens the paragraph on the Canvas, Space p e Export, ⌘⇧E write files.

**Bars.** iA Writer (document restraint), Linear (panel and diff), Codex desktop (running-task state during compile).

**Event log.** Reads: brief, insight, thesis, answer, sentences. Writes: pack-exported (with hash and file list).
