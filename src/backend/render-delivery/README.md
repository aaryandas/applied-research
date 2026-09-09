# Authenticated Manim render delivery

AR-54 internal orchestration around `AnimationRenderWorker`. This package does
not register HTTP, preload, Shell or SQLite schema. Those remain isolated
coordinator patches in `context/design-handoff/ar54-integration-patches/`.

The additive public artifact envelope is owned by AR-53. Types in `types.ts`
are an internal mirror until that checkpoint is published.

## What this slice does

- Authenticated account identity comes from the session, never the body.
- Production composition uses `createRemoteRenderEngine` against a private
  worker daemon. `failClosedOriginOwnership` is the default until AR-48 injects
  account-bound evidence. Railway is the API, not the Manim host.
- One in-flight render per account; the worker still allows one active container
  and at most eight resident jobs.
- Recipe JSON is the existing installed `linear-transform` /
  `weighted-combination` contract. No generated Python, compiler markup, URLs
  or executable source.
- Success copies the worker file into an account-owned store, re-hashes it,
  then releases temporary worker ownership. Cancelled, late, corrupt or
  hash-mismatched files never become `ready`.
- Public JSON and the renderer see an opaque `mediaId` plus verified metadata.
  Worker `artifactPath`, Docker argv and cookies never cross that seam.
- Previous ready media remains when a later request fails.

## What this slice does not do

- It is not a durable job engine. Restart forgets queued/active work.
- It does not enable production AI or purchase a render service.
- Cloud fixture success is not Electron-connected Reader/Canvas acceptance.
- OrbStack is not a deployed runtime. `resolveTrustedRenderRuntime` requires
  `AR_MANIM_DOCKER_CONTEXT` and refuses `orbstack` unless
  `AR_MANIM_ALLOW_ORBSTACK=true`.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the concrete host, image and cost
requirements before any production approval.
