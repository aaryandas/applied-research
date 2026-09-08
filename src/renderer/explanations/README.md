# Local interactive explanations

`ExplanationExperience` accepts a validated `ExplanationSpec`, an `active` flag,
`onChange(spec)` and `onCapture(capture)`. A parent can display the same explanation
identity in Reader and Canvas. Pass its original source version, question and lesson
references in `origin`; never infer them from the current selection. `null` means
no attached origin. UUID shape validation here does not replace project ownership
checks at the future storage boundary.

The current ToolPanel launches two session-local instances through `LocalExplanations`.
Use **Open tool → a source/tool URL → Open in workspace**, then **Launch assembly** or
**Launch arm**. This bounded change does not alter App's entry flow. Returning to Browser
restores the existing native guest. The independent matrix experiment remains in Canvas.

Recipes are fixed, versioned code with original bundled geometry:

- `spatial-assembly` v1: four named selectable parts, separation in `[0, 1]`, orbit,
  explode/reassemble and measured world positions for all four parts.
- `two-link-arm` v1: each link length in `[0.5, 3]`, shoulder and elbow-relative angles
  in `[-180°, 180°]`. Hierarchical transforms produce the captured world endpoint.
  The separately implemented trigonometric endpoint supports text and verification.

Capturing snaps an assembly transition to the requested configuration before measuring.
Every capture contains an immutable copy of the explanation identity, recipe and asset
versions, input parameters, exact origin, timestamp, world measurement and camera position/
target. Captures are app-measured and explicitly session-only. Reset and retry preserve the
prior capture. Closing the tool discards it. There is no database write, saved attachment,
export, remote generation, Reader action or Canvas placement in this slice.

`SceneCanvas` uses React Three Fiber's `createRoot` and frame hooks. It owns synchronous
WebGL initialization and catches asynchronous configuration failures. Initialization does
not run until an explicit active scene mounts. `runtime.ts` owns the Three scene, official
OrbitControls, hit testing, input listeners and geometry disposal. Only requested frames
render; assembly transitions stop when settled. Reduced motion applies positions immediately.
Hidden documents, offscreen explanations and inactive tools unmount graphics; reactivation
restores parameters with a fresh default camera. Parameters and previous captures remain in
React state. Ordinary window blur does not unmount graphics or reset the camera; demand
rendering already produces no frames at rest. WebGL failure retains text, controls and the prior capture, and disables new
measurements until an explicit retry succeeds.

The numerical tests cover exact zero/right-angle cases and 225 combinations of lengths and
angles. Renderer tests cover invalid specs, session capture, bounds, lifecycle and fallback.
`tests/e2e/explanations.spec.ts` drives actual Electron/Three rendering, mesh picking, orbit,
parameter capture, context loss, resize/idle draw counts and browser restoration. Set
`AR24_EVIDENCE_DIR` to retain screenshots, measurement records and machine/timing metadata.
WebGL-unavailable coverage injects a null browser context at creation; context-loss coverage
uses the actual GPU's `WEBGL_lose_context` extension. The measurements are machine-specific,
not a cross-device SLA. Playwright emulates page focus: automated minimize/hasFocus/hidden measurements do not
establish manual native-window behavior or a need for main/preload IPC. Manual minimize
behavior remains unverified in this slice.

Arm inputs retain independent draft strings, including intermediate minus signs, decimal
points and out-of-range values. Only complete in-range decimal values update parameters;
invalid drafts leave the displayed endpoint at committed parameters and disable capture.
Arrow Up/Down step complete values within bounds. Inactive/reactivated tools preserve
unfinished drafts; Reset explicitly restores every field, even if parameters were already
at defaults. External parameter changes synchronize unfocused fields; focused drafts stay
intact and capture remains disabled until the draft agrees with committed parameters.

The coordinator still owns independent Fable review, serialized Sonar, integration into the
current storage/Reader/Canvas work and consolidated release notices. See [dependency and
asset notices](NOTICES.md).
