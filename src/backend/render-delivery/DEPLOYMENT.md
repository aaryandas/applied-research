# AR-54 render worker deployment requirements

This is a reviewable infrastructure request, not an authorization to deploy or
buy anything. The existing Railway HTTP backend is not render capacity.

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

## Why current Railway is not that host

The production API (`railway.json`) is a Railpack **Node** service. Railway can
build/start a service _from_ a Dockerfile; that makes the process _be_ a
container. It does not give the process a Docker daemon, `docker.sock`, or the
ability to `docker run` nested Manim jobs. Compose on Railway maps files to
separate services; it is not Docker-in-Docker.

Do not compose `AnimationRenderWorker` into the existing authenticated HTTP
service and call that “render is deployed.”

## Proposed deployable service (approval required)

A **separate** non-root worker service, not a second SQLite owner and not a
purchased third-party renderer:

1. Dedicated POSIX VM with Docker Engine (or equivalent trusted context),
   not OrbStack.
2. Pre-pull the reviewed image digest before start (`--pull=never` in the
   worker). If production is amd64, **request a founder-reviewed amd64
   digest** of Manim Community 0.21.0; do not swap the ARM pin silently.
3. Run Node 24 as a non-root user. Environment:
   - `AR_MANIM_DOCKER` absolute docker CLI
   - `AR_MANIM_DOCKER_CONTEXT` (for example `default` on that host after
     `docker context ls` proves it)
   - `AR_FFMPEG_PATH` / `AR_FFPROBE_PATH` absolute, not group/world-writable
4. Mount only the compiled worker + `presets/` and a private job volume.
   Never mount the Electron app, credentials, or the workspace SQLite.
5. Expose the additive `/v1/render/*` handler from this package behind the
   existing session authenticator (AR-48 registration patch). Bound to the
   same cookie origin, or a private network the desktop already trusts.
6. Disk: ≥20 GiB for the image plus eight 24 MiB retained clips. RAM: 2 GiB
   host + 1 GiB container. One concurrent render.

## Indicative monthly cost (do not purchase)

Prices are public list estimates for a single always-on host, September 2026,
excluding bandwidth surprises and without GPU (these recipes are Cairo/CPU):

| Host                                           | Why                                             | Approx.          |
| ---------------------------------------------- | ----------------------------------------------- | ---------------- |
| Hetzner CAX11 (Ampere ARM, 2 vCPU, 4 GiB)      | Matches the current ARM digest                  | ~€4–5 / month    |
| Hetzner CX22 (x86, 2 vCPU, 4 GiB)              | Only after an amd64 digest is reviewed          | ~€5 / month      |
| Fly.io `shared-cpu-2x` 2 GiB persistent volume | If we already operate there                     | ~$10–15 / month  |
| Railway CPU service                            | Can host the **HTTP** process, not `docker run` | Not a substitute |

First-month extras: image pull (~1–2 GiB once), no new paid Manim/SaaS, no
GPU SKU. Operator time to install Docker, pin the image, and confirm
`--network=none` still holds on that engine.

## Approval to ask for

- A non-root VM (or equivalent) with Docker Engine and the pinned image already
  loaded
- Architecture decision: keep ARM digest and buy an ARM host, **or** review an
  amd64 digest of the same Manim 0.21.0 tag
- AR-48 registration of `/v1/render/jobs` and `/v1/render/artifacts/:mediaId`
- Coordinator CSP/`ar-media:` protocol wiring for Electron playback

Until those exist, this slice is internally testable and not production render
capacity.

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
