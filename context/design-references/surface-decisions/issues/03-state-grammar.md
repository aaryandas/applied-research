# 03 · State grammar shared by all surfaces
Type: grilling
Status: resolved
Blocked by: —

## Question
What do empty, loading, partial, failed, stale, and unsupported mean product-wide, how does each render in the material system (no spinners or skeletons, per the screens brief), what is the recovery action for each, and which surfaces can be in which state? Include what *stale* means for a sentence anchor after a source is re-ingested, and what *partial* means for a streaming answer, a half-ingested course, or a pack compiled before the newest thesis.

## Inputs
`docs/designs/prompt-2-screens.md` States; `docs/mvp-prd.md` §7 failure behavior, S3 "unsupported" badge, S7 running/failed distillation; critique P1 "Trust and status".

## Resolution must state
Definitions; the rendering rule per state (copy register, material, motion); the recovery action per state; a table surfaces × states with each n/a cell justified. Surface tickets fill their row from this table.

## Starting recommendation
Empty: one sentence of orientation, no illustration outside the opening screen. Loading: content arriving in place (sections, tokens), one caret, no spinner. Partial: what exists is usable and labelled with what is missing. Failed: inline, keeps the user's input, one retry. Stale: an anchor that no longer resolves after re-parse shows a marker and a re-anchor action, never silently moves. Unsupported: the badge on any claim whose citation did not verify, never prose.

## Answer
Decided 2026-09-05/06 with Aaryan.

**Definitions and rendering, product-wide.**
- **Empty.** One plain sentence saying what will appear here and the single action that fills it. No illustration anywhere except the opening screen.
- **Loading.** Two tiers. *Short waits* (an answer streaming, a card opening, roughly under 3 s): content arrives in place with a small live indicator at the arrival point (a breathing caret, or the text itself streaming). *Long waits* (ingesting a source, rendering an explainer, compiling the Playbook): a designed animation fills the empty area in the Field Atlas illustration language (engraved lines drawing themselves), with the real stage in words beneath it: "Fetching", "Parsing 12 sections", "Numbering sentences", "Rendering". Honors reduced motion. Never a spinner, never a fake progress bar; a determinate bar only for file uploads.
- **Partial.** What exists is usable now, and a one-line label says what is still missing.
- **Failed.** *Foreground* (the user is waiting on it: an answer, a dropped file, a save) shows a toast at the bottom, Sonner style, with the cause in plain words and one Retry, auto-dismissing; the place where it happened also keeps the user's input and a retry, so nothing is lost when the toast goes. *Background* (the user has moved on: a distill job, lecture 7 of 12 downloading, a render, indexing, sync) never interrupts; the source row, card, or Map section shows its failed state with a retry when the user reaches it. No modals, no status-bar counter. A parse failure additionally offers the original document.
- **Stale.** Applies only to *derived documents* that are older than the events they were built from: a Playbook or Context pack exported before the newest thesis, Map depth or labels computed before the newest source. Shown as a one-line label with the one action that refreshes it. Sources are immutable once ingested, so a stale *anchor* cannot occur; re-import is not a feature for now (parked, see Not yet specified).
- **Unsupported.** A claim whose citation did not verify. Rendered as a badge on the claim, never as prose, never hidden.

**Surfaces × states.** Each surface ticket fills in its row's copy and recovery action.

| Surface | empty | loading | partial | failed | stale | unsupported |
|---|---|---|---|---|---|---|
| Opening screen | first run, no vault yet | n/a | n/a | vault folder unwritable | n/a | n/a |
| Reader | n/a | sections arriving | some sections parsed; transcript without media | fetch or parse | n/a | on cards |
| Canvas | no questions yet | answer streaming into a card | n/a | answer failed | n/a | on answer cards |
| Map | no sources | computing depth and labels | curriculum sections with zero sources | sourcing failed | depth or labels older than newest source | n/a |
| Workbench | per tab | n/a | n/a | save failed | n/a | in stress-test results |
| Playbook / Context pack | nothing to compile | compiling | n/a | compile or export failed | exported before newest included event | in quoted facts |
| Explainer (card) | n/a | render wait (long-wait tier) | still frame before the clip | render failed; falls back to the cited sentences | n/a | citations that did not verify |
| Pointing assistant | n/a | listening or thinking | n/a | model or audio failed | n/a | target not found |
| Settings | n/a | n/a | n/a | key invalid; MCP not running; vault moved | n/a | n/a |
| ⌘K finder | no results | n/a | n/a | n/a | n/a | n/a |

### Addendum 2026-09-06 (from *Map and Canvas*)
The Map row is replaced by the Learning Path inside the Canvas: empty = no path yet (source-first project before generation); loading = generating the tree and pulling sources; partial = lessons with zero sources; failed = generation or sourcing failed; stale = a tree generated before the newest source was added (one action: regenerate, keeping statuses and cards). The Canvas row gains: empty = the path with no questions yet.

### Addendum 2026-09-06 (from *The Workbench ladder*)
The Workbench row is removed. The Canvas row adds: empty (above ground) = no insights yet, shown as nothing, no prompt; failed = a save keeps its draft; unsupported = badges in a stress-test result. The Playbook row stands.
