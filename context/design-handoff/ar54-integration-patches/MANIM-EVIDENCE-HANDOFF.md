# AR-54 → AR-41 Manim evidence workflow handoff

This is a reviewable patch, not a claim that the job ran.

## Requested action

1. Copy `context/design-handoff/ar54-integration-patches/manim-evidence.yml`
   to `.github/workflows/manim-evidence.yml`.
2. Do not edit `ci.yml`, `verify.yml`, `sonar.yml`, `linear-gate.yml`,
   `claude-review.yml`, or `lane-guard.yml`.
3. **Lane request: none.** `.github/**` is already on the shared allowlist.
   Optional: land the file on `lane:explanations` PR 49, or in a dedicated
   AR-41 delivery PR. AR-54 is not activating the workflow.
4. After publication, run it against the AR-54 PR head SHA (workflow_dispatch
   `source_sha`, or the pull_request event). Return the run URL and artifact
   name `manim-evidence-<sha>`.
5. AR-54 will consume the actual MP4s, contact sheets, and receipts. Do not
   treat this proposal as executed evidence.

## What the job does

- `runs-on: ubuntu-24.04-arm` (normal GitHub-hosted VM, not a container job,
  not self-hosted).
- 20-minute timeout, serialized by `concurrency.group: manim-evidence`.
- Pinned Actions: checkout `11d5960a326750d5838078e36cf38b85af677262`,
  setup-node `49933ea5288caeca8642d1e84afbd3f7d6820020`, upload-artifact
  `ea165f8d65b6e75b540449e92b4886f43607fa02`.
- `permissions: contents: read`. No `environment`, secrets, provider calls,
  release, or deploy.
- Checks out the exact 40-character PR head SHA with
  `persist-credentials: false`. Branch names are rejected.
- Node 24 from `.node-version`, `npm ci` with the committed lockfile.
- Host FFmpeg/FFprobe from the runner's apt archive. Records uid, arch,
  Docker client/server/context, absolute executable paths/modes, and disk.
  Fails if a prerequisite is missing. Does not create an `orbstack` alias.
- Pre-pulls only
  `manimcommunity/manim:v0.21.0@sha256:89ab433ce59134a4dcf351deb2511e067ab354393c0bb7d1859f3e8f0b2406a3`,
  inspects digest/platform, stops on mismatch. Worker still uses `--pull=never`.
- Private mode-0700 evidence directory. Isolated `build.mjs`, then
  render-evidence / runtime-probes / capture / color with explicit
  `--docker`, `--docker-context`, `--ffmpeg`, `--ffprobe`.
- Six synthetic recipes, literal endpoints, static presets. Container mounts
  presets read-only and the private job directory only.
- Isolation flags unchanged. Validation thresholds unchanged.
- Success uploads verified MP4s, contact sheets, hashes, metadata, runtime
  identity, and receipts. Failure uploads only `FAIL` receipts.

## What this does not prove

CI clips prove fixed-recipe rendering only. They do not establish an always-on
production service, authenticated desktop delivery, Reader/Canvas playback, or
AR-54 Done. A separate cloud desktop recording is still required after AR-48/AR-53
integration. Independent critic inspection binds to the resulting SHA and hashes.

## Implementer blocker until publication

The Cursor Cloud VM has no Docker and is amd64. This implementer did not install
Docker there, did not use QEMU, did not swap an amd64 digest, and did not run
the proposed job. After AR-41 publishes and runs it, consume those artifacts.
