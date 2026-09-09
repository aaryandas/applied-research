# `ui` — the shared reusable component layer

One stylesheet layer that every surface (Opening, Reader, Canvas, Practical, Settings) draws
its controls from, so a button looks the same wherever it is used and is fixed in one place.

This directory holds the stylesheet layer plus the two shared React primitives whose
correctness is in the markup rather than the CSS — `EmptyState` and `StatusRegion`, exported
from `index.ts`. Everything else is classes: a surface applies them to whatever element it
already renders, which keeps the markup — and its semantics — owned by the surface.

## Authoring contract

Every rule in this directory follows all eight of these. A reviewer can reject a change on any
one of them.

1. **`.ui-` prefix.** Every class this layer defines starts with `.ui-`. Nothing else in the
   renderer may claim that prefix, and this layer never defines a class without it.

2. **`--modifier` for variants, `__element` for parts.** A variant of a block is the block name
   plus `--` (`.ui-button--primary`, `.ui-alert--error`). A part inside a block is the block name
   plus `__` (`.ui-panel__header`, `.ui-list-row__trail`). Never `.ui-primary` on its own — an
   unqualified adjective collides with the surface stylesheets.

3. **State comes from real attributes, not state classes.** Where the DOM already carries the
   state, style the attribute:

   | State          | Selector                              |
   | -------------- | ------------------------------------- |
   | disabled       | `:disabled`, `[aria-disabled='true']` |
   | keyboard focus | `:focus-visible`                      |
   | toggled on     | `[aria-pressed='true']`               |
   | current page   | `[aria-current='page']`               |
   | selected       | `[data-selected]`                     |
   | expanded       | `[aria-expanded='true']`              |
   | busy           | `[aria-busy='true']`                  |

   Add a class like `.ui-button--loading` only when no attribute expresses the state. This keeps
   the visual state and the accessibility tree from drifting apart: you cannot style the disabled
   look without actually disabling the control.

4. **Tokens only.** Colour, spacing, radius, duration and easing come from `../../tokens.css`
   and nowhere else. No hardcoded hex, no `rgba()` literal, no magic `12px` gap where
   `var(--space-3)` exists. The available tokens are `--space-1..24`, `--radius-control`,
   `--radius-group`, `--radius-panel`, `--radius-pill`, `--duration-press`, `--duration-reveal`,
   `--duration-arrive`, `--ease-out`, `--reading-measure`, `--text-xs|sm|base|reading`, the font
   stacks, and the palette roles (`--paper`, `--surface`, `--surface-subtle`, `--ink`, `--muted`,
   `--line`, `--line-strong`, `--accent`, `--accent-soft`, `--human`, `--human-soft`, `--success`,
   `--danger`, `--focus`, `--shadow`). If a value you need has no token, add the token to
   `tokens.css` in **both** blocks — do not inline the literal.

   Border widths, `1px` hairlines and `%`/`fr` layout values are not tokenised and are fine as
   literals.

5. **Light and dark both work, through the tokens.** `tokens.css` defines every palette role in
   `:root` (light) and again in `[data-theme='dark']`. Use the role, and both themes follow for
   free. Because of that, this layer never needs a `[data-theme='dark']` block of its own — if you
   find yourself writing one, you have hardcoded a colour somewhere above it.

6. **No bare element selectors.** `button {}`, `input {}`, `svg {}` would restyle the whole app
   from a file no surface opted into. Always anchor on a `.ui-` class
   (`.ui-toolbar__group > button` is fine; `button` alone is not).

7. **No `!important`.** This layer sits at the bottom of the cascade on purpose. If a rule is
   losing, the selector is wrong or the surface is overriding it deliberately — both are better
   answers than raising the stakes.

8. **Never redefine a name a surface already uses.** `styles.css` and the per-surface stylesheets
   own their own class names; this layer does not touch them. Note that `.ui-icon` in
   `styles.css` predates this directory and is **already in use by shipping surfaces** — treat it
   as reserved and do not redefine it here.

## Additive until adopted

This layer is wired into `src/renderer/styles.css` by a single `@import` placed at the very top of
that file, which gives every `.ui-*` rule **lower** cascade priority than everything already
written there.

No shipping surface references a `.ui-*` class from this directory yet. That is deliberate: the
foundation lands with **zero visual change** to the app, and each surface adopts it in its own
follow-up PR under its own lane. When you fill in a stub, your PR must still change nothing
on screen — a screenshot diff is the check.

## Public class list

The complete public surface. One place for a surface to look before writing its own control.

### `base.css` — primitives

| Class           | Purpose                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------- |
| `.ui-sr-only`   | Visually hidden, still announced by screen readers.                                       |
| `.ui-focusable` | With `:focus-visible`, the single shared focus ring. One ring, one offset.                |
| `.ui-scroll`    | Scrolls its own content; `overscroll-behavior: contain` stops the page scrolling with it. |

### `type.css` — type roles

| Class         | Purpose                                    |
| ------------- | ------------------------------------------ |
| `.ui-eyebrow` | Mono, uppercase, tracked section label.    |
| `.ui-title`   | Display heading (Fraunces).                |
| `.ui-heading` | Reading-face section heading (Newsreader). |
| `.ui-prose`   | Reading body at `--reading-measure`.       |
| `.ui-meta`    | Small muted metadata.                      |
| `.ui-numeric` | Tabular numerals, so counts do not jitter. |

### `button.css`

| Class                   | Purpose                                                               |
| ----------------------- | --------------------------------------------------------------------- |
| `.ui-button`            | Base control: box, motion, disabled treatment.                        |
| `.ui-button--primary`   | Filled, one per view.                                                 |
| `.ui-button--secondary` | Outlined.                                                             |
| `.ui-button--text`      | Low-emphasis inline action.                                           |
| `.ui-button--quiet`     | Alias of `--text` until one of the two names is retired.              |
| `.ui-button--icon`      | Square icon-only target; needs a `.ui-sr-only` label or `aria-label`. |
| `.ui-button--small`     | Compact height for dense bars.                                        |

States: `:disabled`, `[aria-disabled='true']`, `[aria-pressed='true']`, `:focus-visible`.

### `field.css`

| Class              | Purpose                                                 |
| ------------------ | ------------------------------------------------------- |
| `.ui-field`        | Label + control + message wrapper.                      |
| `.ui-field__label` | The label.                                              |
| `.ui-input`        | Single-line text control.                               |
| `.ui-textarea`     | Multi-line control.                                     |
| `.ui-field__hint`  | Muted helper text.                                      |
| `.ui-field__error` | Error message; pair with `aria-invalid` on the control. |

### `panel.css`

| Class               | Purpose                                                     |
| ------------------- | ----------------------------------------------------------- |
| `.ui-panel`         | Bordered surface at `--radius-panel`.                       |
| `.ui-panel__header` | Title row.                                                  |
| `.ui-panel__body`   | Padded content.                                             |
| `.ui-panel__footer` | Action row.                                                 |
| `.ui-panel--flush`  | No body padding, for edge-to-edge content.                  |
| `.ui-panel--raised` | Lifted off the page: dialogs, floating bars, dragged cards. |

### `toolbar.css`

| Class                  | Purpose                                             |
| ---------------------- | --------------------------------------------------- |
| `.ui-toolbar`          | Horizontal control strip, wraps.                    |
| `.ui-toolbar__group`   | Related controls kept together.                     |
| `.ui-toolbar__spacer`  | Pushes what follows to the far end.                 |
| `.ui-toolbar__title`   | Truncating bar title.                               |
| `.ui-toolbar__actions` | Trailing controls, pushed to the end.               |
| `.ui-action-row`       | A row of buttons closing a panel, form or composer. |

### `list-row.css`

| Class                 | Purpose                                      |
| --------------------- | -------------------------------------------- |
| `.ui-list`            | Stack of rows.                               |
| `.ui-list-row`        | One selectable row.                          |
| `.ui-list-row__lead`  | Leading icon or marker.                      |
| `.ui-list-row__body`  | Primary text; wraps rather than overflowing. |
| `.ui-list-row__trail` | Trailing count or chevron.                   |

Selection: `[data-selected]` or `[aria-current='page']`.

### `segmented.css`

| Class                   | Purpose                                                                       |
| ----------------------- | ----------------------------------------------------------------------------- |
| `.ui-segmented`         | Exclusive choice group (e.g. Distilled / Expanded); tray at `--radius-group`. |
| `.ui-segmented__option` | One option; active via `[aria-pressed='true']`.                               |

### `status.css`

| Class               | Purpose                                                                 |
| ------------------- | ----------------------------------------------------------------------- |
| `.ui-status`        | Dot + label indicator.                                                  |
| `.ui-status__dot`   | The dot.                                                                |
| `.ui-status--ok`    | `--success`.                                                            |
| `.ui-status--idle`  | `--line-strong`.                                                        |
| `.ui-status--error` | `--danger`.                                                             |
| `.ui-status--busy`  | `--accent`, pulsing dot.                                                |
| `.ui-busy`          | The visible affordance for `[aria-busy='true']`; pair with `aria-busy`. |

### `alert.css`

| Class                | Purpose                                                                    |
| -------------------- | -------------------------------------------------------------------------- |
| `.ui-alert`          | Inline message bar; pair with a live region.                               |
| `.ui-alert__body`    | Message text.                                                              |
| `.ui-alert__dismiss` | Placement for the dismiss control; style it `.ui-button .ui-button--icon`. |
| `.ui-alert--error`   | `--danger`.                                                                |
| `.ui-alert--danger`  | Alias of `--error`.                                                        |
| `.ui-alert--warning` | Caution, carried by weight rather than hue.                                |
| `.ui-alert--offline` | Degraded and expected to come back.                                        |
| `.ui-alert--notice`  | Neutral.                                                                   |

### `empty-state.css`

| Class                          | Purpose                                                   |
| ------------------------------ | --------------------------------------------------------- |
| `.ui-empty-state`              | Nothing-here block.                                       |
| `.ui-empty-state__icon`        | Optional mark.                                            |
| `.ui-empty-state__title`       | What is missing; compose with `.ui-heading` for the type. |
| `.ui-empty-state__body`        | Why, in one sentence.                                     |
| `.ui-empty-state__action`      | The one action that fills it.                             |
| `.ui-empty-state--unsupported` | The app cannot offer this at all; no invitation.          |

### React primitives (`index.ts`)

| Export         | Purpose                                                                   |
| -------------- | ------------------------------------------------------------------------- |
| `EmptyState`   | The nothing-here block, named by its own title. Not a live region.        |
| `StatusRegion` | The always-mounted live region for async results; `busy` adds `.ui-busy`. |

## Adding a component

1. Check this list first — the control you want probably already has a name.
2. Fill in the owning stub file; do not create a new file without adding it to `ui.css`.
3. `ui.css` import order is the cascade order. Keep `base.css` first.
