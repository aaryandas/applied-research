# 04 · Keyboard grammar: the leader key and the vim boundary
Type: grilling
Status: resolved
Blocked by: —

## Question
What is the leader key, how does the leader layer work on every non-reader surface (discoverability, chords, the `?` map), where exactly is the vim boundary (inside a card? a canvas node's text? a Workbench field?), and how do mouse users never encounter any of it?

## Inputs
Bars: Readwise Reader (`references/reading/readwise-reader/`), Linear and Raycast (`references/chrome/`). Constraint: reading gets full vim, everything else a leader key, no modes outside the reader.

## Resolution must state
The leader key. The reader's vim grammar (movement, search, visual selection, the selection verbs mapped to Explain/Note/Counter/Idea, Esc semantics, layer navigation). Leader chords per surface family. The `?` cheat-sheet: where it lives and what it shows. Behavior when focus is in a text field. The mouse-parity rule (every keyboard action has a visible pointer path).

## Starting recommendation
Space as leader outside text fields, with a which-key style popup after 300 ms. Reader: full vim including visual mode for selection; on a selection `e` Explain, `n` Note, `c` Counter, `i` Idea; Esc closes the innermost thing and returns to the exact line. Text fields swallow every key except Esc. `?` opens the map anywhere.

## Answer
Decided 2026-09-06 with Aaryan.

**Leader key: Space.** Outside any text field, Space opens a small popup listing the next keys (which-key style). Nothing happens until the second key, so a stray Space is harmless. First-level chords: Space r Reader, Space c Canvas, Space m Map, Space w Workbench, Space p Playbook, Space s Settings, Space n new question (opens the Canvas question bar), Space f find sources for the selected Map section, Space ? this popup expanded. Each surface ticket adds its own second-level chords under Space plus its letter (for example Space w t Theses tab). No modes exist outside the reader.

**Reader: full vim.** Movement: j/k lines, h/l sentences, gg/G top and bottom, { } paragraphs, [ ] sections, / search then n and N, numbers as counts. v starts a visual selection over sentences; with a selection active the verbs are single letters: e Explain, n Note, c Counter, i Idea, x Explain visually. Enter on a citation opens the cited sentence; Enter on a collapsed card opens it; Tab moves between cards on screen. Esc closes the innermost open thing (toolbar, card, layer) and returns the cursor to the exact line it left. There is no insert mode: typing happens only inside a text field.

**Text fields.** A focused field swallows every key except Esc (leave the field, keep the draft) and ⌘Enter (save). Space inside a field is a space.

**Cheat sheet.** ? anywhere outside a field opens one global cheat sheet: a searchable panel listing every shortcut in the app, grouped by surface, with the current surface's group expanded first.

**Shortcut hints are always shown**, Linear style: in menus, tooltips, and the command menu. They live in those places only; no on-screen element carries a shortcut badge, so a mouse user sees hints only when hovering or opening a menu. Every keyboard action has a visible pointer path: a menu item, toolbar button, or context-menu entry.

**⌘K** always opens the finder (scope decided by *The shell*). ⌘K with a reader selection active is Explain.

### Addendum 2026-09-06 (from *Map and Canvas*)
Space m (Map) is withdrawn; Space f (find sources for the selected Map section) becomes Space f, find sources for the selected lesson. First-level chords: Space r Reader, Space c Canvas, Space w Workbench, Space s Settings, Space n new question, Space f find sources, Space ? cheat sheet.

### Addendum 2026-09-06 (from *Reader*)
Selection verbs are e Explain, n Note, i Idea, x Explain visually. c (Counter) is withdrawn.

### Addendum 2026-09-06 (from *The Workbench ladder*)
Reader selection verbs: e Explain, n Note, i Insight, x Explain visually. Canvas: Space i Connect (write an insight above the selected cards), Space t Take a position. First-level chords: Space r Reader, Space c Canvas, Space p Playbook, Space s Settings, Space n new question, Space f find sources, Space ? cheat sheet. Space w is withdrawn.
