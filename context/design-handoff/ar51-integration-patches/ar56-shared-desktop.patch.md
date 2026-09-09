# AR-56 / coordinator — shared desktop mount for AR-51

Apply together. Adding 0006 tables without `EXPECTED_TABLE_COLUMNS` breaks every `WorkspaceStore` open (`validateNormalizedSchema` requires an exact table set).

## 1. Journal — `drizzle/meta/_journal.json`

Current entries end at idx 4 (`0004_practical_journey`). **0005 is leased to onboarding (AR47).** Insert 0005 first if it is not already present. Then append:

```json
{
  "idx": 6,
  "version": "6",
  "when": 1788948000000,
  "tag": "0006_contextual_retention",
  "breakpoints": true
}
```

Do not register `0006_contextual_retention` as idx 5. DBs that applied 0006 as idx 5 cannot be silently reordered.

## 2. `src/main/workspace-migration.ts`

Set `LATEST_WORKSPACE_MIGRATION` to `1788948000000` (or the 0006 `when` actually recorded).

Add to `EXPECTED_TABLE_COLUMNS` (generated columns are omitted from sqlite `pragma table_info` — list stored columns only):

```ts
  retained_explanations: [
    'id',
    'project_id',
    'contract_version',
    'intent',
    'origin_json',
    'useful_attempt_id',
    'created_at',
    'updated_at',
  ],
  explanation_attempts: [
    'attempt_id',
    'explanation_id',
    'project_id',
    'attempt_json',
    'status',
    'intent',
    'recorded_at',
  ],
  explanation_attempt_grounding: [
    'attempt_id',
    'project_id',
    'grounding_json',
  ],
  explanation_scene_state: [
    'explanation_id',
    'project_id',
    'parameter_revision',
    'state_json',
    'updated_at',
  ],
  trusted_scene_captures: [
    'capture_id',
    'explanation_id',
    'project_id',
    'parameter_revision',
    'capture_json',
    'measured_at',
  ],
  explanation_canvas_placements: [
    'explanation_id',
    'project_id',
    'view',
    'x',
    'y',
    'updated_at',
  ],
```

Do **not** merge explanation Drizzle tables into `workspaceSchema`. Follow PracticalRecords: extra query mappings against the store-owned connection.

## 3. `src/main/workspace-store.ts`

```ts
import { ExplanationRecords } from './explanation-records';

export class WorkspaceStore {
  private readonly practical: PracticalRecords;
  readonly explanations: ExplanationRecords;
  constructor(path: string) {
    // existing migrate + pragmas + drizzle(...)
    this.practical = new PracticalRecords(this.orm);
    this.explanations = new ExplanationRecords(this.orm);
  }
}
```

One SQLite connection. No second `new Database`.

## 4. Channels already frozen in contracts

Request/cancel: `learning:request-contextual-help`, `learning:cancel-contextual-help`.

Additional names owned in `src/main/contextual-help-channels.ts`:

- `learning:load-retained-explanation`
- `learning:list-retained-explanations`
- `learning:save-explanation-scene-state`
- `learning:load-explanation-scene-state`
- `learning:accept-scene-capture`
- `learning:load-trusted-scene-capture`
- `learning:open-retained-clip-media`
- `learning:place-retained-explanation`
- `learning:list-explanation-placements`

Register them in `src/contracts/desktop.ts` (or a thin renderer-facing type) + preload + main. Renderer already types `ContextualHelpBridge` in `src/renderer/explanations/contextual-help-bridge.ts`.

## 5. `src/main/index.ts`

Construct next to `sourceOperations`:

```ts
import { ContextualHelpOperations } from './contextual-help-operations';
import { makeContextualHelpTransport } from './contextual-help-transport';
import { CONTEXTUAL_HELP_CHANNELS } from './contextual-help-channels';

const contextualHelp = new ContextualHelpOperations({
  records: store.explanations,
  authenticated: () => authenticated,
  transport: makeContextualHelpTransport({
    request: globalThis.fetch,
    sessionCookie: () =>
      authController.state().session === 'signed-in' ? authSdk.getCookie() : '',
  }),
});
```

On `SOURCE_CHANNELS.activate`, also `contextualHelp.activate(value)`.
On `revokeWorkspaceOperations` / sign-out / window close, `contextualHelp.revoke()`.
Register `CONTEXTUAL_HELP_CHANNELS.*` with the existing trusted `handle()` wrapper, including `loadScene` → `contextualHelp.loadScene`.
Remove handlers on window closed.

`cancel` must abort **and remove** the pending request. Main still permits only one in-flight explanation; if cancel only signals abort, a later selection can get a false `Another explanation request is already in progress.` The panel awaits that cancel before submitting the next origin.

Pass a stable `ContextualHelpBridge` into `ContextualHelpPanel` (preload `window.appliedResearch` is fine). Do not allocate a new bridge object on every Shell render.

Cookie stays in main. Do not expose `askTutor` for this path. Do not accept renderer-provided source/AI bodies.

## 6. `src/preload/index.ts`

Named invokes only. Example:

```ts
requestContextualHelp: (input) =>
  ipcRenderer.invoke(CONTEXTUAL_HELP_CHANNELS.request, input),
cancelContextualHelp: (input) =>
  ipcRenderer.invoke(CONTEXTUAL_HELP_CHANNELS.cancel, input),
loadRetainedExplanation: (input) =>
  ipcRenderer.invoke(CONTEXTUAL_HELP_CHANNELS.load, input),
listRetainedExplanations: (input) =>
  ipcRenderer.invoke(CONTEXTUAL_HELP_CHANNELS.list, input),
saveExplanationSceneState: (input) =>
  ipcRenderer.invoke(CONTEXTUAL_HELP_CHANNELS.saveScene, input),
loadExplanationSceneState: (input) =>
  ipcRenderer.invoke(CONTEXTUAL_HELP_CHANNELS.loadScene, input),
acceptSceneCapture: (input) =>
  ipcRenderer.invoke(CONTEXTUAL_HELP_CHANNELS.capture, input),
loadTrustedSceneCapture: (input) =>
  ipcRenderer.invoke(CONTEXTUAL_HELP_CHANNELS.loadCapture, input),
openRetainedClipMedia: (input) =>
  ipcRenderer.invoke(CONTEXTUAL_HELP_CHANNELS.openClip, input),
placeRetainedExplanation: (input) =>
  ipcRenderer.invoke(CONTEXTUAL_HELP_CHANNELS.place, input),
listExplanationPlacements: (input) =>
  ipcRenderer.invoke(CONTEXTUAL_HELP_CHANNELS.listPlacements, input),
```

## 7. `src/renderer/Shell.tsx`

Remove `<ReaderExplanations active={destination === 'reader'} />`.

Mount one controller/panel. Pass the existing Reader callback through. Quote is the retained selection/highlight; do not re-read the DOM after the request.

```tsx
import { ContextualHelpPanel } from './explanations/ContextualHelpPanel';
import { useContextualSelection } from './explanations/contextual-help-controller';

const { selection, openExplanationId, explainSelection } =
  useContextualSelection();
// generations: start at 1 / 0 after activate; main.activate returns them — thread if you expose that from SOURCE_CHANNELS.activate.

<Reader
  onExplainSelection={explainSelection}
  explanation={
    <ContextualHelpPanel
      projectId={workspace.project.id}
      projectGeneration={projectGeneration}
      requestGeneration={requestGeneration}
      bridge={bridge}
      selection={selection}
      openExplanationId={openExplanationId}
      active={destination === 'reader'}
      onReturnToOrigin={(origin) => reader.current?.openOrigin(origin)}
    />
  }
/>;
```

Only the active destination owns WebGL (`active={destination === 'reader'}`). Canvas may show the same retained identity/origin without a second live runtime until that mapping is mounted; do not start two SceneCanvas instances.

`projectGeneration` / `requestGeneration` must match `ContextualHelpOperations.activate` (first activate → projectGeneration 1, requestGeneration 0). Thread those values from main if you extend activate's return.

## 8. `src/renderer/App.test.tsx`

Delete the production assertion that Reader always shows **Explore a two-link arm** / **Interactive explanations**. After this mount, those launchers are gone. Keep ToolPanel/local ExplanationExperience tests.

## 9. Canvas artifact mapping (AR-49/AR-56)

Producer: `projectRetainedExplanationToCanvas` / `explanationCanvasPlacement` plus SQLite `explanation_canvas_placements` (proposed **0008**). **Not Canvas-done until this patch is applied.** No `workspace_records` row. `authorKind: 'assistant'`. `activeRuntime: false`.

Journal (after 0005/0006/0007). Root coordinates numbering if 0008 is taken:

```json
{
  "idx": 8,
  "version": "6",
  "when": 1788952000000,
  "tag": "0008_explanation_canvas_placements",
  "breakpoints": true
}
```

Copy `context/design-handoff/ar51-integration-patches/0008_explanation_canvas_placements.sql` to `drizzle/0008_explanation_canvas_placements.sql`. Add to `EXPECTED_TABLE_COLUMNS`:

```ts
explanation_canvas_placements: [
  'explanation_id',
  'project_id',
  'view',
  'x',
  'y',
  'updated_at',
],
```

Main operations (already on ContextualHelpOperations):

- `placeExplanation({ projectId, explanationId, view, x, y })`
- `listPlacements({ projectId })`
- `load({ projectId, explanationId })` — reopen without a new highlight or paid request

Register:

- `learning:place-retained-explanation`
- `learning:list-explanation-placements`

Read-model: union `listPlacements` with `projectRetainedExplanationToCanvas(load(explanationId))`. `moveLearningRecord` must not relabel an explanation as a note. Open Canvas card → `openRetainedExplanation({ explanationId, intent, origin, quote })` on the existing panel.

Only the active surface (`destination === 'reader'` today) passes `active` into `RetainedScene`. Canvas cards stay `activeRuntime: false`.

## 10. AR-54 clip player (opaque media only)

Panel mounts `RetainedClipPlayer` when the useful result is `{ kind: 'clip' }`. Main `openClip` returns `{ status: 'ready', objectUrl: 'ar-media://clip/<uuid>' }` or missing/corrupt/unauthorized. Renderer never receives paths, `file:` URLs, https CDNs, or account ids.

Register `learning:open-retained-clip-media`. Wire `openRetainedClip` to AR-54 `RetainedMediaStore.objectUrl` after `registerRetainedMediaScheme` / `installRetainedMediaProtocol` (AR-54 patch). Default without that store is `{ status: 'missing' }` — do **not** invent `{ kind: 'ready' }` from `requestClip`.

Shell `access.open(mediaId)` → `bridge.openRetainedClipMedia({ projectId, artifactId: mediaId })`. Pass `openExplanationId` from `useContextualSelection()`.
