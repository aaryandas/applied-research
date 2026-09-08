# Original Manim render worker

AR-23 foundation: two installed mathematical recipes produce real 10-second, 1280 × 720, 30 fps H.264 MP4 files. This package has no Electron, account, provider, database or transport dependency. It does not attach a clip to a Reader/Canvas record, persist a request, export a user file, or establish mastery.

## Public seam

`AnimationRenderWorker.create(options?)` creates a private temporary root. `render(recipeJson, abortSignal?)` decodes the complete JSON request before queueing. It resolves to `succeeded`, `invalid`, `unsupported`, `cancelled` or `failed`; no generated source is accepted. The shared decoder separately reports `supported` for a valid recipe.

A success contains `jobId`, an internal `artifactPath`, and the serializable artifact record: complete recipe/version/asset version/origin, exact renderer version/image, deterministic recipe SHA256, output SHA256, measured bytes/duration/dimensions, independently computed endpoint, named stage times, and queue/compute/verification durations. `artifactPath` is an internal handoff, never a browser URL or public response field. The authenticated artifact owner must copy the verified file into its own retention boundary before calling `release(jobId)`. `close()` cancels active/queued work and removes this instance's temporary files. At most eight queued, active or retained jobs may exist; one renders at a time. Retained files count against capacity until released.

Minimal later integration:

1. Authenticate and authorize the project/source-version/question origin before submission. The worker validates UUID shape, not account ownership. `origin: null` explicitly represents unbound/synthetic content.
2. Persist a request/attempt identity outside this package. Keep the previous attempt when retrying; a new worker job always gets a distinct directory/container.
3. Pass request cancellation through the `AbortSignal`. Recheck attempt ownership/cancellation before committing an artifact transaction; cancellation after this promise resolves belongs to that transaction boundary.
4. Copy the verified file, retain its full artifact record, then release temporary ownership. Serve authorized bytes through the account-bound endpoint. Never expose host paths, Docker options or diagnostics as user-editable request fields.
5. Wire Reader/Canvas playback to this same identity, and implement durable local/offline retention and explicit user export separately. No durable queue/recovery or transport/accounting design is inferred here.

## Recipe contract

`src/contracts/animation-recipes.ts` is the strict shared boundary. Every key is required; extra keys are rejected. Requests are at most 4096 characters. Numbers are finite multiples of 0.001. Matrix entries and vector coordinates range from −3 to 3; weights range from 0 to 100 and at least one must be positive. Titles are 1–48 characters; the two vector labels are 1–18 characters. The deliberately narrow initial alphabet is ASCII letters/digits, spaces and `.,()'-`, with an alphanumeric first character and no outer whitespace. Unicode/localized labels need a separately reviewed expansion.

Only `linear-transform` and `weighted-combination`, version `1`, asset version `original-manim-1`, are accepted. Unknown recipe/version combinations return `unsupported`; malformed shapes, labels and parameters return `invalid`. Python independently checks the same boundary. Labels flow through Pango `Text`, never `MarkupText`, TeX, Typst, a compiler, a shell, imports, asset URLs or source interpolation.

- **Linear transformation:** fixed coordinate grid, basis arrows, original unit-square outline, continuously transformed filled square and sample vector. The animation interpolates matrices from identity to A; the right-angle example has a right-angle endpoint and does not claim a rigid rotation trajectory. A zero map becomes a point. Final basis coordinates, row products and `A v` remain visible for five seconds.
- **Weighted combination:** original vectors and raw weights, their positive total, normalized shares and a proportional bar, continuous vector scaling and head-to-tail translation with both arrows rebuilt per frame to preserve their colors, and the resulting vector. The stroke stays capped at 5 with a length ratio of 12 so short moving arrows retain visible color in the delivered H.264 clip. Zero shares have no bar area and a zero-length vector is a dot; opposite equal vectors end at the origin. Displayed values are rounded to three decimal places with `~` when approximate. The geometry uses full precision.

Semantic stages are `[0, 2, 5]` seconds for linear transformation and `[0, 2, 5, 8]` for weighted combination. No automatic playback is implied by a completed artifact. A reduced-motion consumer should load paused and allow direct stage selection; this is demonstrated in the isolated harness.

## Runtime boundary and limits

The adapter invokes the already installed OrbStack context with structured `spawn` argv, `shell: false` and a provider-free child environment. It pins the approved image digest in `docker.ts`, prohibits pulling, mounts only the installed `presets/` directory read-only and one private job directory writable, requires a non-root POSIX host and runs as its UID/GID, disables networking, uses a read-only root filesystem, drops capabilities, enables no-new-privileges and init, and limits CPU (2), memory/swap (1 GiB), PIDs (128), temporary memory (128 MiB) and per-file size (96 MiB). Aggregate working output is monitored against 96 MiB every 200 ms. This monitor is an application limit, not a hard filesystem quota; the fixed presets, memory/file limits and 120-second render deadline also bound exposure. A deployment on another Docker runtime must verify these controls and supply its trusted context/tool paths.

Cancellation/deadline kills the CLI process group, including descendants, then forcibly removes the daemon-owned container by its unique name. The process result explicitly distinguishes not-started, started and unknown launch state. A confirmed pre-launch failure such as ENOENT returns `runtime` with an allowlisted diagnostic and needs no container removal. A runner exception or daemon disconnection after a launch attempt never proves the absence of a container; cleanup must still be confirmed. Queued cancellation resolves without launching. Late output cannot become a success after cancellation during render, probe, decoding or hashing. Failed/aborted jobs remove their directory. Safe cleanup diagnostics are retained even when cancellation was requested. A `cleanup` failure is distinct: the container runtime could not confirm removal; an operator must inspect the named `ar-manim-*` containers before treating that infrastructure as healthy. This is not a recovery daemon.

After the container exits, only `/job/artifact.mp4` is considered. The host rejects symlinks, hardlinks, nonregular/missing files, wrong containment, unexpected MP4 signature and output over 24 MiB. It checks FFprobe metadata (one H.264/yuv420p video, 1280 × 720, 30 fps, 300 frames, approximately 10 seconds), fully decodes with FFmpeg and checks SHA256 before success. Media tools permit file/pipe protocols only, with 10/15-second deadlines and bounded diagnostic output. Rendering and media tools are deployment prerequisites, not Electron dependencies. Third-party text is withheld from returned diagnostics; only fixed safe markers survive, so source labels cannot leak through tracebacks.

## Build and verification

Use Node 24 and the repository's exact lockfile. No npm dependencies were added. Build this isolated package with:

```sh
node src/render-worker/build.mjs /private/tmp/ar-manim-evidence/compiled
node_modules/.bin/vitest run --project unit src/render-worker
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s src/render-worker/presets -p 'test_*.py'
```

`tsconfig.node.json` includes this source in the repository type gate. The isolated build copies only static presets beside the compiled worker. Do not mount the repository/Electron application into the image.

In a coordinator-granted heavy/native slot:

```sh
node src/render-worker/render-evidence.mjs
node src/render-worker/runtime-probes.mjs
node src/render-worker/capture-evidence.mjs
node src/render-worker/color-evidence.mjs
node src/render-worker/playback-evidence.mjs
npm run check
```

Evidence defaults to `/private/tmp/ar-manim-evidence`. The six synthetic recipes cover shear, right-angle endpoint, zero map, unequal weights, zero share and zero result. Expected endpoints in the evidence runner are literal values, independent of the Python display code. Render receipts include SHA256 values of the actual compiled worker and preset files. The independent color probe checks at least 50 saturated green pixels in the plane box at seven samples across the weighted transition (including 6.0 seconds), plus measured final endpoints for all six clips. The weighted contact sheet includes the 6.0-second mid-move frame. Receipts separate actual queue time, compute (including startup/teardown), verification and media duration. Local copies have no network transfer time; later account-bound transfer/playback startup needs separate measurement. These runs test the founder's approximate 10-second clip / 20-second wait target on one machine and do not establish a service SLA.

The isolated Electron harness has no preload/Node renderer access, denies network/permissions/popups and loads only generated local media. It records metadata, actual keyboard play/pause/scrub, named-stage jumps, paused-position resume and complete playback of both families. Its video and semantic contact sheets support independent Fable review. Automated focus/visibility observations do not prove real manual minimize behavior. Production Reader controls, active/hidden lifecycle and accessible user-facing integration remain the consumer's responsibility.
