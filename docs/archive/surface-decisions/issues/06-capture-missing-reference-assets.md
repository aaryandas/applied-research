# 06 · Capture the missing reference assets
Type: task
Status: resolved
Blocked by: missing running-task.png and app version; desktop-control tool forbids direct Codex capture

## Task (HITL)
Two approved bars in `references/README.md` have no assets, so the shell and opening-screen decisions cannot be compared blind:

1. **Codex desktop** → `references/chrome/codex-desktop/`: PNG at native scale, one per state, named `empty.png`, `running-task.png`, `settings.png`, `long-list.png`. Not installable headlessly; needs Aaryan's machine.
2. **The original blue engraved-landscape screenshot** (the World Labs inspiration) → `references/visual-world/world-labs/`.
## Resolution must state
The paths captured and any state that could not be captured.

## Answer

Capture attempted on 2026-09-06 after setting Status to claimed, using the superset-computer skill workflow through the available desktop-control tool. The tool rejected `cua.getApp("Codex")` with: “Computer Use is not allowed to use the app 'com.openai.codex' for safety reasons.” The restriction was not bypassed. Aaryan subsequently captured and saved three PNGs locally, which were visually inspected.

Captured assets (whole window including title bar and sidebar; supplied PNG bytes preserved without scaling or editing):

- `references/chrome/codex-desktop/empty.png` — 2280×1447 px; the fresh `test` project shows “No chats” and its opening composer; other projects remain visible in the global sidebar.
- `references/chrome/codex-desktop/settings.png` — 2261×1453 px; Appearance settings with navigation, theme selection, and font controls visible. Replaced the earlier General settings capture with Aaryan's supplied Appearance screenshot.
- `references/chrome/codex-desktop/long-list.png` — 2280×1447 px; multiple expanded project task lists in the sidebar.

Still missing: `references/chrome/codex-desktop/running-task.png`, showing a task in progress and its progress indicator. The long-list screenshot has sidebar activity indicators but does not replace the dedicated running-task capture.

The Appearance screenshot confirms System theme mode, displaying the Codex dark theme. Both light and dark presets are named Codex. UI and code font controls show “System default”, Regular; content font shows “Same as UI font”, Regular. Concrete font family names are not exposed in this view. App version awaits Aaryan's confirmation. Native display scale cannot be independently verified from the PNGs alone. The Codex row in `references/README.md` records the three actual captures, confirmed theme/font settings, and the remaining missing path instead of the stale screenshot/install note.

The original World Labs blue engraved-landscape screenshot is not on this machine, per Aaryan's instruction; it could not be captured, and that row's note remains unchanged. No file was sent to an external service.

Status remains claimed until the missing running-state capture and metadata are supplied or explicitly waived.

### Waiver 2026-09-06
Aaryan waived the running-task capture: the jobs panel is already decided and the running-state comparison is minor. Resolved with three captures (empty, settings, long-list). The World Labs blue engraved-landscape image remains for Aaryan to drop in when convenient; nothing downstream blocks on it.
