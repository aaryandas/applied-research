# AR-54 coordinator integration patches

AR-54 does not edit `http.ts`, `runtime.ts`, `provider.ts`, `policy.ts`,
`learning.ts`, `src/main/index.ts`, preload, `desktop.ts`, workspace schema, or
Shell. Apply these narrow patches in a coordinator/integration PR after this
slice is reviewed.

Remote delivery composition is in:

- [AR48-REMOTE-DELIVERY.md](./AR48-REMOTE-DELIVERY.md) — remote engine, origin grant, public routes
- [AR51-CLIP-IDENTITY.md](./AR51-CLIP-IDENTITY.md) — reserved explanation IDs and previous useful result
- [AR56-CLIP-PLAYER.md](./AR56-CLIP-PLAYER.md) — opaque `ar-media:` mount
- [LANE-ALLOWLIST.md](./LANE-ALLOWLIST.md) — `src/main/clip-*.ts`

Public artifact types remain AR-53. Replace the internal mirror in
`src/backend/render-delivery/types.ts` with that import when the checkpoint SHA
is posted.

## 1. Lane

`.github/lanes.json` `lane:explanations` includes:

- `src/backend/render-delivery/**`
- `src/render-worker/**`
- `src/main/retained-media-*.ts`
- `src/main/clip-*.ts`

## 2. `tsconfig.backend.json`

Only required if the backend process constructs `AnimationRenderWorker` in
process. Prefer running the worker via `src/render-worker/delivery-engine.ts`
in a dedicated Node 24 service. If in-process:

```json
"include": [
  "src/backend/**/*.ts",
  "src/contracts/learning-api.ts",
  "src/contracts/animation-recipes.ts",
  "src/contracts/explanations.ts",
  "src/render-worker/**/*.ts"
]
```

Exclude `src/**/*.test.ts` as today. Copy `src/render-worker/presets/` next to
the compiled worker; never mount the Electron tree.

## 3. `src/backend/http.ts` / `runtime.ts`

Do not change provider/policy. After auth/learning routes, before 404:

```ts
import {
  handleRenderDelivery,
  matchRenderDeliveryRoute,
} from './render-delivery/index.js';

// HttpDependencies gains optional `renderDelivery?: RenderDeliveryService`

const route = matchRenderDeliveryRoute(url.pathname, request.method ?? '');
if (route) {
  if (!dependencies.renderDelivery) {
    writeJson(response, 503, {
      outcome: 'unavailable',
      message: 'Rendering is not connected on this host.',
    });
    return;
  }
  await handleRenderDelivery(route, request, response, {
    auth: dependencies.auth,
    delivery: dependencies.renderDelivery,
  });
  return;
}
```

`startBackend` constructs the service only when
`resolveTrustedRenderRuntime()` succeeds. Missing Docker/context is
unavailable, not a guessed OrbStack/Railway runtime.

Worker adapter:

```ts
import { AnimationRenderWorker } from '../render-worker/worker.js';
import { workerRenderEngine } from '../render-worker/delivery-engine.js';

const runtime = await resolveTrustedRenderRuntime();
const worker = await AnimationRenderWorker.create({
  docker: runtime.docker,
  dockerContext: runtime.dockerContext,
  ffmpeg: runtime.ffmpeg,
  ffprobe: runtime.ffprobe,
});
const renderDelivery = createRenderDeliveryService({
  engine: workerRenderEngine(worker),
  store: createArtifactStore(retentionRoot),
  originOwnership: { assertOwned: /* workspace authority */ },
});
```

## 4. Main / preload / desktop contract

Call from `src/main/index.ts` **before** `app.whenReady`, beside auth:

```ts
import {
  installRetainedMediaProtocol,
  registerRetainedMediaScheme,
} from './retained-media-protocol';
import { RetainedMediaStore } from './retained-media-store';
import { makeRetainedMediaTransport } from './retained-media-transport';

registerRetainedMediaScheme(protocol);
```

After userData exists:

```ts
const retainedMedia = new RetainedMediaStore(
  join(app.getPath('userData'), 'retained-media'),
);
installRetainedMediaProtocol(protocol, retainedMedia);
```

Named bridge only, for example `retainReadyClip({ requestId })` returning the
opaque `ar-media://clip/<uuid>` object URL plus serializable metadata. Cookie
stays in main. Do not add raw IPC, SQL, or filesystem paths.

CSP in `electron.vite.config.ts` (delivery lane):

Production: add `media-src 'self' ar-media:;`
Development: same, plus existing Vite refresh exceptions. Do not add
`media-src https:`.

## 5. Schema / Shell / Reader / Canvas

Do not create a second SQLite connection. Add retained `mediaId` columns
through the existing store/migration owner. Shell mounts
`RetainedClipPlayer` with main-provided `access.open` that returns
`ar-media://clip/<id>` only. AR-51 owns Ask/planner/scene controller; this
player is the clip consumer.

## 6. What remains blocked after this PR

- Trusted Docker context + pinned ARM image on GitHub-hosted `ubuntu-24.04-arm`
  (proposed job in `manim-evidence.yml`; AR-41 must publish and run it)
- AR-53 public type names
- AR-48 route composition
- Electron CSP/protocol registration
- Reader/Canvas artifact node
- A separate cloud desktop recording of retained Reader/Canvas playback after
  AR-48/AR-53 integration

## 7. Proposed Manim evidence workflow (AR-41)

Exact file: `manim-evidence.yml` in this directory.

Copy destination: `.github/workflows/manim-evidence.yml`.

Lane request: none. `.github/**` is already on the shared allowlist, so
`lane:explanations` may carry it, but AR-54 is not activating the workflow.
AR-41 / the coordinator owns publication, first run, and artifact retention.

Do not edit `ci.yml`, `verify.yml`, `sonar.yml`, `linear-gate.yml`,
`claude-review.yml`, or lane-guard as part of this patch.
