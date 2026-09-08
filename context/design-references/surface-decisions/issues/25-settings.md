# 25 · Settings
Type: grilling
Status: resolved
Blocked by: 13

## Question
What does Settings hold and how is it arranged: model keys or managed keys by tier, the vault folder, the MCP command, the analytics toggle (default on), theme (dark default, designed light), keyboard (leader key, reference card), account and sync for paid? Its states: invalid key, MCP not running, a paid feature when unpaid, vault moved. Keyboard grammar and the bar (Raycast preferences).

## Inputs
Resolution of *The shell*; `docs/mvp-prd.md` S12 (note: analytics default has since changed to on); critique §12 (Settings has no design).

## Resolution must state
All nine `SURFACES.md` fields. The section list. The tier-dependent rows.

## Starting recommendation
One scrolling page with a left index, Raycast-style. Sections: Vault, Models, Agents (MCP command, pack location), Appearance, Keyboard, Privacy (analytics, what leaves the machine), Account. Paid rows are visible and explain themselves in one line when unpaid.

## Answer
Decided 2026-09-06 with Aaryan. A window over everything (⌘,), not a main view.

**Job.** Set the few things the product cannot guess, and see plainly what leaves the machine.

**How you arrive.** ⌘, ; Space s; the app menu; a failed-state link (invalid key, MCP not running).

**Layout.** A window with a left index and one scrolling page, Raycast style. Sections, in order: **Vault** (folder path, Change, Open in Finder, size). **Models** (on a paid plan signed in: managed keys, nothing to paste; otherwise your own keys per provider with the last four shown, validated with one small call on save, Revoke). **Agents** (the MCP command with Copy, the pack folder, which agents have connected, the four read-only tools listed). **Appearance** (dark default, light, follow system; reduced motion). **Keyboard** (leader key, hold-to-talk key, Open cheat sheet). **Privacy** (usage analytics on by default, one sentence on what is sent, and "nothing you read or write leaves this machine"; the toggle). **Account** (plan, sync status, sign in or out). Paid rows are visible when unpaid, each with one line saying what it does.

**States.** Failed, inline on the row: invalid key (message, keep the field), MCP not running (Start), vault moved (Locate). Empty, loading, partial, stale, unsupported: n/a.

**AI may:** nothing here. **Only the human:** everything.

**Keyboard.** ⌘, opens; Tab and arrows through the index; Esc closes; changes save on blur with a 5 s Undo text button.

**Bar.** Raycast preferences.

**Event log.** Writes: settings-changed (key present or not, never the key; vault path; analytics; theme).
