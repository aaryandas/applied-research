# 23 · The opening screen and first run
Type: grilling
Status: resolved
Blocked by: 13, 20

## Question
What does the illustrated arrival do beyond looking good? First run: vault location, keys or managed keys by tier, the analytics-on notice (content never leaves the machine). The two doors (question, source) and the drop state. The returning user: projects and where you left off. Does the illustration carry state (change with the vault, the time, the project)? Every state.

## Inputs
Resolutions of *The shell* and *Narrowing dialogue*; Field Atlas assets in `design-system/assets/` and `design-system/README.md`; `docs/designs/prompt-2-screens.md` screen 1; `docs/mvp-prd.md` S1, S12; bars: World Labs (first viewport), Wabi site, Cosmos.

## Resolution must state
All nine `SURFACES.md` fields for the opening screen, including the first-run sequence as a flow and the returning-user variant.

## Starting recommendation
The Brief field is the screen; the illustration is the ground it sits on and is the one place an illustration is allowed. First run asks two things (vault folder, key or sign-in) and states the analytics default in one line with the toggle beside it. Returning users see their projects with the last position, and the same two doors.

### Inputs addendum 2026-09-06
The question door is two fields plus at most one clarifying question (*Narrowing dialogue*). This ticket fixes the screen around them: first run, the source door and drop state, returning users, the illustration.

## Answer
Decided 2026-09-06 with Aaryan.

**Job.** Get from nothing to a project you can read in, in one screen; on return, get back to where you were. Pain row 2 (sourcing) begins here.

**How you arrive.** App launch with no project open; closing a project; Space h.

**The screen.** The Field Atlas illustration is the ground; the illustration is the one place in the product where an illustration is allowed. On it, in reading order:
1. *First run only*, two setup lines settled in place, no wizard: "Your vault: ~/Applied Research · Change" and "Model: sign in for managed keys, or paste a key · Add". Beneath them one line: "Usage analytics are on; nothing you read or write leaves this machine. Turn off."
2. The two doors. **Start from a question**: the two fields, *What are you building?* and *What do you already know about it?*, with three example answers under the first; one primary button, Build my learning path. **Start from a source**: one field accepting a URL, DOI, arXiv id, course URL, or a dropped file (PDF, EPUB, HTML); dropping anywhere on the screen shows a full-screen drop state.
3. *Returning users*: the projects list under the doors, each with its name, Brief, and where you left off ("Lecture 4 · 12:40", "Canvas"); Enter opens it there.

The illustration does not carry state; it is the same every time, dark and light variants.

**Primary flow.** Fill one door, press its button, the long-wait animation with stage text, land on the Canvas (question door) or the Reader (source door, with the source's own tree built behind it).

**States.** Empty: first run, no vault yet (the setup lines). Loading: the long-wait tier after a door. Failed: vault folder unwritable (inline on the vault line with Choose another); an unreachable id or URL (inline under the source field, input kept, Retry); sourcing found nothing (per *Start from a question*). Partial, stale, unsupported: n/a.

**AI may:** draft the Brief, ask one clarifying question, build the path. **Only the human:** everything typed, the vault choice, keys, the analytics toggle.

**Keyboard.** Tab between fields and doors, ⌘Enter submits the focused door, ⌘O opens a file, arrows and Enter on the projects list.

**Bars.** World Labs (first viewport), Field Atlas (illustration and buttons), Wabi site and Cosmos (restraint).

**Event log.** Writes: project-created, brief (human), note (human, "already know"), source-added, settings (vault, key present, analytics).
