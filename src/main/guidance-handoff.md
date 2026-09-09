# AR-55 companion main producers

Owned by the Companion lane. Main assembler `run-f562` owns `src/main/index.ts`, preload, App/Shell, and journal. Do not register IPC from this patch.

## Exports

| Symbol                                                      | Module                                  |
| ----------------------------------------------------------- | --------------------------------------- |
| `createCompanionGuidanceOperations(options)`                | `src/main/guidance-operations.ts`       |
| `CompanionGuidanceOperationsOptions`                        | same                                    |
| `resolveCompanionGuidanceContext(request, readers, signal)` | `src/main/guidance-context.ts`          |
| `CompanionGuidanceReaders`                                  | same                                    |
| `measuredCaptureTextFromTrusted(capture)`                   | `src/main/guidance-measured-capture.ts` |
| `measuredCaptureTextFromOwnedAttempt(attempt, id, load)`    | same                                    |
| `makeCompanionGuidanceTransport(options)`                   | `src/main/guidance-transport.ts`        |
| `buildCompanionGuidanceEnvelope(...)`                       | `src/main/guidance-envelope.ts`         |

Channels (already in AR53 contracts; do not redeclare):

- `learning:request-companion-guidance`
- `learning:cancel-companion-guidance`

## Exact `CompanionGuidanceOperationsOptions`

```ts
{
  authenticated: () => boolean; // signed-in desktop session only
  activeProject: () => { projectId: string } | null; // this window's bound workspace
  selectionEpoch: () => number; // increment on attempt/selection/tool replacement BEFORE revoke
  resolve: typeof resolveCompanionGuidanceContext; // bind readers below
  post: ReturnType<typeof makeCompanionGuidanceTransport>;
}
```

Public methods: `activate(projectId)`, `request(value)`, `cancel(value)`, synchronous `revoke(reason)`, `dispose()`.

`activate` returns `{ projectGeneration, requestGeneration }`. Same project is idempotent. A new project revokes in-flight work first.

Never trust renderer-supplied context, account, URL, measurement, provenance, or saved-state claims. `request` decodes AR53, checks window/project + generations, resolves through injected readers, posts one envelope, then re-checks generations/selection epoch and suppresses late success.

## Backend compatibility delta (keep `947bd563` available)

Request contract version stays `2026-09-09`. HTTP success from `947bd5637a1a6a0ca54f0fecdb0882e673750d17` already emits `nextAction` and `citations`. This follow-up **stops stripping them** in main transport and requires those keys on the named AR53 success decoder. AR48's 947 HTTP join remains valid. Assembler/preload must pass the extra success keys through named `requestCompanionGuidance`. Do not decode this body with the old five-key success decoder.

AR53 success is the exact seven keys:

```ts
{
  outcome: 'success',
  requestId,
  authorKind: 'ai',
  text,
  provenance, // decodeAiProvenance, exact keys
  nextAction, // nonempty advice, ≤400; never an automatic command
  citations,  // 1–12: decodeSourceCitation (UUID scholarly) or exact-key identifier citations for supplied app/file/measurement context
}
```

Citation reveal is owned retained revision/context copy, not a model URL. Extra keys, missing citations, or quote-length mismatches are `unavailable`.

`revoke('selection-replaced' | 'attempt-replaced' | 'tool-closed' | 'external-handoff' | 'project-replaced')` settles in-flight work as `stale`. User cancel / `user-stop` / sign-out / teardown / unmount remain `cancelled`.

## Exact reader injection (no new storage)

```ts
import { measuredCaptureTextFromOwnedAttempt } from './guidance-context';

const readers: CompanionGuidanceReaders = {
  readWorkspace: (projectId) => store.getLearningWorkspace(projectId),
  loadOwnedAttempt: (projectId, attemptId) => {
    const loaded = practical.loadPracticalAttemptByProjectAndId(
      projectId,
      attemptId,
    );
    return loaded.status === 'loaded' ? loaded.attempt : null;
  },
  readImportedFile: (projectId, attemptId, selectionId) => {
    const loaded = practical.loadPracticalAttemptByProjectAndId(
      projectId,
      attemptId,
    );
    if (loaded.status !== 'loaded' || !loaded.attempt) return null;
    const preview = practical.previewPracticalFile({
      activity: loaded.attempt.activity,
      attemptId,
      selectionId,
    });
    if (preview.status === 'ready') {
      return {
        status: 'ready',
        text: preview.text,
        displayName: preview.displayName,
        completeness: preview.completeness, // preserve 'truncated'
      };
    }
    if (preview.status === 'unsupported-preview') {
      return {
        status: 'unsupported',
        displayName: preview.displayName,
        mediaType: preview.mediaType,
      };
    }
    return null;
  },
  lookupMeasuredCapture: (projectId, attemptId, captureId) => {
    const loaded = practical.loadPracticalAttemptByProjectAndId(
      projectId,
      attemptId,
    );
    if (
      loaded.status !== 'loaded' ||
      !loaded.attempt ||
      loaded.attempt.activity.projectId !== projectId
    ) {
      return null;
    }
    return measuredCaptureTextFromOwnedAttempt(
      loaded.attempt,
      captureId,
      (ownedProjectId, ownedCaptureId) =>
        store.explanations.loadCapture(ownedProjectId, ownedCaptureId),
    );
  },
  boundToolSession: (projectId) => {
    // From the assembler-owned tool host; never a renderer URL.
    return bound;
  },
};
```

`loadPracticalAttemptByProjectAndId` is a **main-internal** PracticalRecords method (not IPC). It decodes persisted `activityJson` then reuses `loadPracticalAttempt`. Exact AR56 store wrapper (do not add generic SQL):

```ts
// src/main/workspace-store.ts — AR56 private wrapper only
loadPracticalAttemptByProjectAndId(projectId: string, attemptId: string) {
  return this.practical.loadPracticalAttemptByProjectAndId(projectId, attemptId);
}
```

Inject capture lookup into `PracticalRecords` when constructing it (AR56 store constructor; this lane did not edit `workspace-store.ts`). `loadExplanation` is required whenever measured associations are enabled. Use the actual AR56 reader — `store.explanations.loadExplanation(projectId, explanationId)` → `RetainedExplanation`. Do not call nonexistent `store.explanations.load`. Pass `Pick<RetainedExplanation, 'explanationId' | 'projectId' | 'origin'>`. Lesson identity is `origin.path.lessonId`; do not invent a null legacy `ExplanationOrigin`.

```ts
this.practical = new PracticalRecords(this.orm, {
  loadCapture: (projectId, captureId) =>
    this.explanations.loadCapture(projectId, captureId),
  loadExplanation: (projectId, explanationId) => {
    const explanation = this.explanations.loadExplanation(
      projectId,
      explanationId,
    );
    return explanation
      ? {
          explanationId: explanation.explanationId,
          projectId: explanation.projectId,
          origin: explanation.origin,
        }
      : null;
  },
});
```

Do not stub fake captures. `api.acceptSceneCapture({ projectId, request })` returns `TrustedSceneCapture` directly (AR56 `c4b65392` / explanations `cef3311b`; main recomputes before persistence). This lane only associates an already-owned capture id onto the attempt draft. A provided `lookupMeasuredCapture` that returns null is `stale`. PNG/PDF previews are `unsupported`, not missing files. `PracticalRecords` may omit an invalid capture from `returnedEvidence` while the saved draft id remains — the measured reader must require the revalidated offer, not `draft.selectedEvidence`.

AR51 `groundingForSource` / `tutorSourceInput` at `f7f733f` were inspected only. This producer inlines a bounded canonicalizer + SHA-256 helper. When the coordinator integrates that exact AR51 SHA, those helpers may replace the local copies; do not merge AR51 from here.

## Exact `index.ts` / preload (assembler-owned)

```ts
import { createCompanionGuidanceOperations } from './guidance-operations';
import { resolveCompanionGuidanceContext } from './guidance-context';
import { makeCompanionGuidanceTransport } from './guidance-transport';
import {
  COMPANION_GUIDANCE_CANCEL_CHANNEL,
  COMPANION_GUIDANCE_REQUEST_CHANNEL,
} from '../contracts/companion-guidance';

const guidance = createCompanionGuidanceOperations({
  authenticated: () => auth.signedIn(),
  activeProject: () =>
    selectedWorkspaceId ? { projectId: selectedWorkspaceId } : null,
  selectionEpoch: () => selectionEpoch,
  resolve: (request, signal) =>
    resolveCompanionGuidanceContext(request, readers, signal),
  post: makeCompanionGuidanceTransport({
    request: (url, init) => net.fetch(url, init),
    sessionCookie: () => auth.cookie(),
  }),
});

handle(COMPANION_GUIDANCE_REQUEST_CHANNEL, (value) => guidance.request(value));
handle(COMPANION_GUIDANCE_CANCEL_CHANNEL, (value) => guidance.cancel(value));
// activate/revoke are not renderer-callable:
// on workspace bind: guidance.activate(projectId)
// on sign-out / tool close / external handoff / attempt replace:
//   revealRegistry.invalidate(); guidance.revoke(reason); companion.stop(reason);
```

Preload: expose **only** named `requestCompanionGuidance` and `cancelCompanionGuidance`. Never raw IPC, SQL, cookies, or `CompanionGuidanceInput`. The named success reply now includes `nextAction` and `citations`; do not project them away.

Transport posts `POST ${DESKTOP_AUTH_API_ORIGIN}/v1/learning/companion` once with `origin: applied-research:/` and the session cookie. No retry after uncertainty. Combined-signal timeout is `unavailable`, not `cancelled`. HTTP 401/403 is `unauthenticated` even if the body is success-shaped. Success-shaped JSON is accepted only with HTTP 200.

## Exact capture-ID handoff (assembler-owned; do not rebuild RetainedScene)

AR56 `c4b65392` `RetainedScene` already retains and displays the trusted capture returned by `api.acceptSceneCapture({ projectId, request })`. That bridge returns `TrustedSceneCapture` directly, not `acceptTrustedSceneCapture` and not a `{ status, capture }` wrapper. Do not tell AR51 to rebuild retain/display.

The remaining assembler gap is an **explicit user action** that copies the returned opaque `captureId` onto the currently mounted owned Practical attempt (same project + activity). Do not auto-select the most recently updated attempt. Practical then records `draft.selectedEvidence: { kind: 'app-measured', captureId }` through the existing result commit. Renderer must not supply measurement text.

```ts
const capture = await api.acceptSceneCapture({ projectId, request });
// capture is TrustedSceneCapture; RetainedScene already displays it.
offerCaptureToMountedPracticalAttempt({
  captureId: capture.captureId,
  projectId, // same project only; current owned attempt only
});
```

## Exact Shell mount (assembler-owned, do not edit Shell here)

```ts
const host = createCompanionGuidanceHost({
  bridge: {
    requestCompanionGuidance: api.requestCompanionGuidance,
    cancelCompanionGuidance: api.cancelCompanionGuidance,
  },
  activate: (projectId) => windowCompanionGenerations(projectId),
  createRequestId: () => crypto.randomUUID(),
});
const requester = createCompanionRequester({
  ...identity,
  requestGuidance: (input, signal) => host.requestFromSession(input, signal),
  onStateChange,
  now,
  createRequestId,
});
// session outcome now carries citations, nextAction, and AI provenance.
```
