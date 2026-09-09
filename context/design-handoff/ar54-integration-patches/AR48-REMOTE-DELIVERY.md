# AR-48 remote delivery composition

AR-54 owns `createRemoteRenderEngine`, `createHttpsWorkerTransport`,
`failClosedOriginOwnership`, `backendEvidenceOriginOwnership`, and the public
render HTTP handler. It does **not** edit `src/backend/http.ts`, `runtime.ts`,
`config.ts`, accounting, or schema. Apply this in the backend lane.

Railway remains the authenticated API. Nested Docker on Railway is not possible
and is not requested. The POSIX Docker host is not purchased here.

## 1. Origin ownership (required, fail-closed)

Do not inject `{ assertOwned: async () => true }`, UUID syntax checks, or
`allowUnboundOrigin: true` in production.

```ts
import {
  backendEvidenceOriginOwnership,
  failClosedOriginOwnership,
} from './render-delivery/index.js';

const originOwnership = accountBoundProjectGrant
  ? backendEvidenceOriginOwnership({
      assertAccountOwnsProject: (accountId, projectId) =>
        accountBoundProjectGrant(accountId, projectId),
    })
  : failClosedOriginOwnership();
```

`accountBoundProjectGrant` must use backend-owned evidence (the account's
project rows / grants). Railway has no local SQLite graph. Until that grant
exists, keep `failClosedOriginOwnership()` and renders stay `not-found`.

## 2. Remote engine, not in-process Manim

```ts
import {
  createArtifactStore,
  createRemoteRenderEngine,
  createHttpsWorkerTransport,
  createRenderDeliveryService,
} from './render-delivery/index.js';

const transport = await createHttpsWorkerTransport({
  origin: config.renderWorkerOrigin, // one configured HTTPS URL
  certificates: {
    cert: config.renderWorkerCertPath,
    key: config.renderWorkerKeyPath,
    ca: config.renderWorkerCaPath,
  },
});
const renderDelivery = createRenderDeliveryService({
  engine: createRemoteRenderEngine({
    transport,
    stagingDirectory: config.renderStagingDirectory,
  }),
  store: createArtifactStore(retentionRoot),
  originOwnership,
});
```

Config keys are operator-supplied absolute paths and one HTTPS origin. Reject
relative paths, HTTP, redirects, and caller-selected hosts. Missing certs or
origin → fail closed at startup, do not listen with a guessed worker.

Do **not** construct `AnimationRenderWorker` inside the Railway process.

## 3. Public routes (existing handler)

After auth/learning routes, before 404:

```ts
import {
  handleRenderDelivery,
  matchRenderDeliveryRoute,
} from './render-delivery/index.js';

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

Existing public routes:

- `POST /v1/render/jobs`
- `GET /v1/render/jobs/:requestId`
- `POST /v1/render/jobs/:requestId/cancel`
- `GET /v1/render/artifacts/:mediaId`

Worker daemon routes (`/v1/worker/*`) stay off the public API.

## 4. Config additions (names only)

Suggested env, owned by AR-48 config:

- `AR_RENDER_WORKER_ORIGIN` (`https://…` only)
- `AR_RENDER_WORKER_TLS_CERT` / `_KEY` / `_CA` absolute paths
- `AR_RENDER_STAGING_DIRECTORY` API-private directory

Do not generate certificates, commit secrets, or point at desktop cookies /
provider keys / database URLs.

## 5. Tests AR-48 should add

- Composition: session auth → remote engine → owned retain (can reuse the
  in-process daemon fake from AR-54 unit tests)
- Missing grant stays `not-found`
- Missing worker origin/certs fail closed at boot
