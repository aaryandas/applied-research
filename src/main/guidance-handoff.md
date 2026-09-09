# AR-55 companion main producers

Owned by the Companion lane. Main assembler `run-f562` owns `src/main/index.ts`, preload, App/Shell, and journal. Do not register IPC from this patch.

## Exports

| Symbol                                                      | Module                            |
| ----------------------------------------------------------- | --------------------------------- |
| `createCompanionGuidanceOperations(options)`                | `src/main/guidance-operations.ts` |
| `CompanionGuidanceOperationsOptions`                        | same                              |
| `resolveCompanionGuidanceContext(request, readers, signal)` | `src/main/guidance-context.ts`    |
| `CompanionGuidanceReaders`                                  | same                              |
| `makeCompanionGuidanceTransport(options)`                   | `src/main/guidance-transport.ts`  |
| `buildCompanionGuidanceEnvelope(...)`                       | `src/main/guidance-envelope.ts`   |

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

## Exact reader injection (no new storage)

```ts
const readers: CompanionGuidanceReaders = {
  readWorkspace: (projectId) => store.getLearningWorkspace(projectId),
  loadOwnedAttempt: (projectId, attemptId) => {
    const loaded =
      practical.loadPracticalAttempt(/* assembler-owned activity+id */);
    return loaded.status === 'loaded' ? loaded.attempt : null;
  },
  readImportedFile: (projectId, attemptId, selectionId) => {
    const preview = practical.previewPracticalFile({
      activity,
      attemptId,
      selectionId,
    });
    return preview.status === 'ready'
      ? { text: preview.text, displayName: preview.displayName }
      : null;
  },
  // Omit lookupMeasuredCapture until AR56. Do not stub a fake capture.
  boundToolSession: (projectId) => {
    // From the assembler-owned tool host; never a renderer URL.
    // { sessionId, title, controls: [{ name, description }] } | null
    return bound;
  },
};
```

Unresolved producer dependency: **measured-capture lookup** is not on HEAD. Omit `lookupMeasuredCapture` until AR56 injects a real main-owned capture read. The resolver then returns `unavailable` with a precise seam message. Do not invent a second store or a fake capture in this lane. A provided reader that returns null is `stale`.

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

Preload: expose **only** named `requestCompanionGuidance` and `cancelCompanionGuidance`. Never raw IPC, SQL, cookies, or `CompanionGuidanceInput`.

Transport posts `POST ${DESKTOP_AUTH_API_ORIGIN}/v1/learning/companion` once with `origin: applied-research:/` and the session cookie. No retry after uncertainty. Combined-signal timeout is `unavailable`, not `cancelled`. HTTP 401/403 is `unauthenticated` even if the body is success-shaped. Success-shaped JSON is accepted only with HTTP 200.

HTTP success JSON now includes tutor `citations` and `nextAction`. AR53 `CompanionGuidanceReply` is unchanged (`outcome`, `requestId`, `authorKind`, `text`, `provenance`). Main transport maps HTTP→AR53 by omitting those extra keys so preload's exact decoder does not fail. Assembler/AR53 must add a citations field before answer-side citation reveal can be built.

`revoke('selection-replaced' | 'attempt-replaced' | 'tool-closed' | 'external-handoff' | 'project-replaced')` settles in-flight work as `stale`. User cancel / `user-stop` / sign-out / teardown / unmount remain `cancelled`. Do not conflate selection revoke with user cancel.
