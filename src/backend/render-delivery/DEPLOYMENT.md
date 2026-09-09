# AR-54 render worker deployment requirements

This is a reviewable infrastructure request, not an authorization to deploy,
purchase, or create a host. Host selection and price approval follow review of
this adapter. Do not treat any figure below as a confirmed quote.

Railway remains the authenticated API. A separately approved POSIX Docker host
would run constrained jobs. The existing Railway API cannot run privileged
nested Docker. Do not compose `AnimationRenderWorker` into the Railway Node
service and call that “render is deployed.”

## Observed Cloud VM (this implementer)

Inspected 2026-09-09 on the Cursor Cloud host for this run:

- Linux x86_64, non-root uid 1000, 4 CPU, 16 GiB RAM, 246 GiB free
- FFmpeg/FFprobe 6.1.1 at `/usr/bin/ffmpeg` and `/usr/bin/ffprobe` (mode 755)
- **No** Docker, Podman, nerdctl, containerd, runc, or docker.sock
- cgroup shows a Kubernetes-style pod; effective capabilities are empty
- The founder-pinned image digest is the ARM64 OrbStack evidence image from
  AR-23. This VM is amd64. Do not silently substitute another digest.

A real worker-isolated MP4 cannot be produced on this VM until a trusted
container runtime and a reviewed image for this architecture are provided.
Host-side Manim, a recorder, or a synthetic MP4 is not product-clip evidence.

## Runtime the worker actually needs

The bounded worker already requires:

- Non-root POSIX process (`getuid() !== 0`)
- Docker CLI talking to a **named, pre-existing** context (not inferred
  `orbstack`, not guessed `railway`)
- `--pull=never` against the pinned image
  `manimcommunity/manim:v0.21.0@sha256:89ab433ce59134a4dcf351deb2511e067ab354393c0bb7d1859f3e8f0b2406a3`
- Network disabled, read-only root, dropped capabilities, no-new-privileges,
  2 CPU / 1 GiB / 128 PIDs, 96 MiB working output, 24 MiB published MP4
- Host FFmpeg/FFprobe for verification
- Compiled worker from `node src/render-worker/build.mjs` plus `presets/` only
- HTTPS listen with operator-supplied mTLS certificate **paths** (this slice
  does not generate or commit certificates)

## Why current Railway is not that host

The production API (`railway.json`) is a Railpack **Node** service. Railway can
build/start a service _from_ a Dockerfile; that makes the process _be_ a
container. It does not give the process a Docker daemon, `docker.sock`, or the
ability to `docker run` nested Manim jobs. Compose on Railway maps files to
separate services; it is not Docker-in-Docker.

The remote engine downloads a successful daemon artifact into a **private
API-owned staging file** and returns only that local path to `ArtifactStore`.
Daemon-supplied paths are never deserialized.

## Proposed deployable split (approval required)

1. Keep the existing authenticated Railway HTTP API. AR-48 composes
   `createRemoteRenderEngine` plus the public `/v1/render/*` routes and an
   account-bound origin-ownership grant. Railway does not run Manim.
2. A **separate** POSIX VM with Docker Engine, not OrbStack and not nested
   Docker on Railway. The coordinator-local host note proposes an OCI ARM A2
   San Jose shape (1 OCPU / 4 GB / 50 GB, public list around $18.19 / month,
   initial cap discussion around 25). That host is **not approved or created**.
   Do not choose it, purchase it, or quote that price as confirmed.
3. Pre-pull the reviewed ARM image digest before start (`--pull=never`). If
   production is amd64, request a founder-reviewed amd64 digest of Manim
   Community 0.21.0; do not swap the ARM pin silently.
4. Run Node 24 as a non-root user. Daemon argv names Docker, context, FFmpeg,
   FFprobe, listen host/port, and TLS cert/key/CA **paths**. Desktop cookies,
   provider keys, and database credentials never reach the worker.
5. Mount only the compiled worker + `presets/` and a private job volume.
   Never mount the Electron app, credentials, or the workspace SQLite.
6. One concurrent render, eight resident daemon jobs, bounded replay. Lost
   in-memory jobs after restart report unavailable; they are not recovered.

## Indicative public list prices (not a purchase and not a quote)

Older Hetzner/Fly rows in prior drafts are superseded by the coordinator-local
host note. No vendor, SKU, or monthly amount is authorized here. First-month
extras would still include a one-time image pull (~1–2 GiB) and operator time
to install Docker, pin the image, and confirm `--network=none`.

## Approval to ask for after this review

- Whether to purchase any POSIX Docker host at all, and which architecture
- Operator-supplied mTLS material for API → worker (not generated in-app)
- AR-48 registration of `/v1/render/jobs` and `/v1/render/artifacts/:mediaId`
  using the planner render receipt (not a global project ACL)
- AR-48 account-bound origin ownership evidence (Railway has no local SQLite
  project graph; `failClosedOriginOwnership` is the default)
- AR-48 registration of `/v1/render/jobs` and `/v1/render/artifacts/:mediaId`
  plus remote-engine composition
- Coordinator CSP / `ar-media:` protocol wiring for Electron playback

Until those exist, this slice is internally testable with fake transports and
is not production render capacity. Real hosted MP4 acceptance is later.

## First evidence host (no purchase)

Do not buy a VM for AR-54 acceptance. GitHub's standard public
`ubuntu-24.04-arm` runner already has Docker client/server. The reviewable job
is `context/design-handoff/ar54-integration-patches/manim-evidence.yml`. AR-41
owns copying it to `.github/workflows/manim-evidence.yml`. This implementer
must not activate it.

That job is bounded CI rendering of the six synthetic recipes. It is not an
always-on production service, authenticated desktop delivery, or completed
AR-54 acceptance. The Cursor Cloud VM remains amd64 without Docker; do not
install Docker there, swap an amd64 digest, use QEMU, or use the founder's Mac.
