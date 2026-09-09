# Companion consumer checkpoint · AR-25

Delivery base: `94340203891406d012028d4762ae15fbfe04e04a`. Recovers only companion-owned code from `86ef7c3`, `c53bb17` and `933300c`, using the reviewed AR-19/AR-15/AR-12 checkpoints on that base. This is an in-process consumer interface, not a production bridge schema or full AR-25 acceptance. See [current behavior and delivery limits](../../../context/companion.md).

`createCompanionSession` snapshots one immutable activity/attempt. Inject `resolveTarget(request, signal)`, authenticated `requestGuidance(input, signal)`, `onStateChange`, a monotonic `now`, and unique `createRequestId`. `askOnce` resolves once and requests once when admitted; overlapping actions return `ignored/busy` and never queue. `startActivity` captures that target, requests an initial cue and arms only after success. A one-shot during active guidance retains the original scope. No automatic retries. A stopped uncooperative transport retains the physical request slot until settlement; late output is discarded.

Only a `tool-controls` start with a fixed `toolSession: {sessionId, initialUrl}` admits navigation cues. Host must bind the subscription to that exact session before delivering events. Successful changed URLs are consumed even when throttled/busy; no trailing work. Initial success starts the 15-second throttle. All other targets can receive initial activity guidance without navigation observation. Tool controls contain supported app controls/state and optional trusted guest identity; **pageAccess is always none**. Guest-page reading is unavailable in this checkpoint, including one-shot. A future reviewed explicit-page capability must retain main's 12,000-character bound and post-read navigation-race check; never map a tool-controls request to `includePage: true`.

## Minimal shell integration (integrator-owned)

```ts
const requester = createCompanionRequester({
  activity,
  attemptId,
  requestGuidance: authenticatedGuidanceAdapter,
  onStateChange: setCompanionState,
  now: () => performance.now(),
  createRequestId: () => crypto.randomUUID(),
  // Omit until the host has a trustworthy bound subscription:
  toolSession: {
    sessionId: boundToolSession.id,
    initialUrl: boundToolSession.url,
  },
});
const companion = requester.session;
// PracticalWork owns mounting/unmounting the real resolver:
const registerGuidanceResolver = requester.registerResolver;
// PracticalWork:
const onRequestGuidance = (request: PracticalGuidanceRequest) => {
  void companion.askOnce(request);
};
// Exactly one host subscription; do not tag arbitrary old events with a new ID.
const unsubscribe = boundToolSession.subscribe((event) => {
  void companion.observeToolNavigation(event);
});
// Before replacement, external handoff, sign-out, completion or close:
companion.stop('attempt-replaced');
const flushed = await practicalFlush();
if (flushed.status === 'ready') replaceActivity();
// A blocked flush keeps the draft and does not restart guidance.
// On unmount: unsubscribe(); requester.dispose();
```

Replace App's legacy guidance identity, askTutor/start-stop path and navigation-cue listener when promoting this module. Never leave two active cue consumers. Stop synchronously before downstream navigation/external opening/sign-out work. The session has no global bus and installs no navigation listeners; host owns subscription cleanup. Saved results never imply activity completion or mastery.

## Exact producer patches still required

Practical author: add an optional resolver registration parallel to `registerFlush`, scoped to the mounted activity/attempt and removed on unmount. The additive prop can be `registerGuidanceResolver?: RegisterCompanionResolver` (exported from `src/contracts/companion.ts`). Also expose per-target availability from owned state (for example `availableGuidanceTargets: readonly PracticalTarget['target'][]`) so unsupported Ask actions are disabled individually and the shell can supply `selectedRequest: null`; the existing request callback alone does not establish availability. These availability updates must not resolve content or trigger guidance. Signature is `CompanionSessionOptions['resolveTarget']`. Reject mismatched project/attempt/all origin fields. Read one selected target from the owned save-session closure only on invocation. Return `unavailable` when absent and `stale` when selection/revision changes during asynchronous resolution. Abort must cancel downstream work; no typing subscription.

- Instructions: return only supplied title/objective/instructions; `requestedTarget` retains immutable origin.
- Controls: shell supplies only actually supported control descriptions/loading/error and optional trusted session identity. No guest page content.
- Selected result: choose the selected opaque `captureId`/`selectionId`, resolve it through the trusted project/attempt-owned producer, return one bounded text with `provenanceId` and original reference. Otherwise return only explicitly human-reported text with its saved revision or unsaved-draft marker. Do not fallback from an unavailable selected capture to the whole result collection.
- Reflection: return only human reflection and `version: {kind:'saved', revision}` or `{kind:'unsaved-draft', lastAcknowledgedRevision}`. Snapshot actual dirty/acknowledged state, never claim unsaved text is saved. No AI adoption callback exists.

Auth/backend owner: provide abortable, runtime-validated per-request guidance with unique `requestId`, exact attempt/origin/target and selected context; verify evidence ownership through trusted storage. Return safe typed offline/unauthenticated/unavailable/stale/cancelled/error or answered text. Keep credentials and provider calls behind the authenticated adapter. Legacy `askTutor(projectId,prompt,includePage)` and global `stopTutor` are not compatible fallbacks. Renderer tags do not establish measured provenance or IPC trust.

Fixtures exist only in tests. The owned consumer has component/session tests and an isolated real Electron fixture with explicitly synthetic adapters. These do not establish production resolver, authenticated transport, bridge, capture or persistence integration. Production-connected acceptance, Cursor recording, independent Fable review, blocking macOS CI and hosted Sonar remain outstanding. Under the founder's recovery instruction, only focused unit TDD and `npm run check` run locally. Cursor cloud owns targeted Playwright and video evidence; GitHub CI owns full desktop verification; Railway/GitHub owns hosted Sonar. Do not launch local Playwright, desktop/package smoke tests, video/trace capture or Sonar. The existing PR becomes ready for remote verification after permitted local checks pass; readiness is not connected acceptance. The dispatcher owns Linear transitions and the coordinator handles prior lane/bootstrap limitations.

## Component integration

`Companion` takes the session, its latest `CompanionState`, a `selectedRequest` (or null), and an app-owned `pointerSurface` HTMLElement. Selection must come from the real Practical producer; pass null and `unavailableMessage` when it cannot resolve that target. The shell's `onStateChange` updates the supplied state. Mount one component per session and keep the session/options stable. The component stops on unmount or session replacement; the shell owns final `dispose()` and tool-subscription removal. Cleanup uses replay-safe stop so React StrictMode does not permanently dispose a shell-owned session during effect replay.

```tsx
<Companion
  key={attemptId}
  session={companion}
  state={companionState}
  selectedRequest={availableSelection}
  pointerSurface={appOwnedSurface}
  parkPointer={guestObscuresSurface}
/>
```

Cmd/Ctrl+J opens the disclosure and focuses the ordinary Ask button; Escape closes it and returns focus. The shortcut is attached only to the supplied app surface. Scope and Stop stay visible when the disclosure is closed. Answers render as plain text labelled AI guidance, with selected-target attribution and reflection saved/draft wording. There is no draft-write or adoption operation.

The decorative existing mark follows app-owned pointer events on one coalesced animation frame, clamped within the viewport. It has pointer-events:none and aria-hidden; no ambient loop, context read, capture or request. Surface exit, blur, resize, entering reduced motion and cleanup park the mark and cancel the frame. Leaving reduced motion keeps the mark parked until the next app-owned pointer event and must not undo a follow that already observed the live preference. Reduced motion keeps the mark stationary while controls remain usable. Host must exclude the isolated native guest from `pointerSurface` or set `parkPointer` whenever it obscures the surface. Native guest pointer tracking is unavailable; do not infer it from missing renderer events. Replace App's existing follower and Cmd/Ctrl+J listener at integration as well as its legacy guidance observer.

The resolver result's serialized selected context is capped at 12,000 characters in this consumer. This conservative cap is independent of main's existing page-text bound; no guest read exists here. Producers must apply their own per-field/content limits and validate saved revisions and evidence ownership. Transport is responsible for runtime request/reply validation, output bounds and server identity checks.

## Semantic pointing and reveal · separate UI contract

The recovered `CompanionResolution`, `CompanionContext`, `CompanionVersion` and session method signatures remain compatible. Additive contract changes are resolver registration/requester types, `tool-navigation`/`target-unavailable` stop reasons and optional `CompanionState.draining` to expose physical cancellation settlement. The separate `CompanionTargetRevealer` in `target-pointer.ts` is an app-local presentation seam. Supply it through `Companion.targetRevealer` to enable **Show selected target**. That explicit action reveals the selected semantic target and draws a viewport-clipped, non-interactive outline/mark around its actual app-owned bounds; it invokes neither the content resolver nor guidance transport. Missing geometry is unavailable, never a guessed point. The target vocabulary remains `PracticalTarget`.

Practical owns direct React refs for its instructions, selected-result and reflection sections/controls. The shell/ToolPanel owner supplies the app-owned tool-controls ref. The producer's `reveal(target, signal)` validates mounted project/attempt/all origin fields and current target availability, reveals only that ref, moves keyboard focus to it (a section may use tabIndex=-1), and waits one local animation frame for its instant reveal scroll/layout to settle (checking abort/lifecycle again), then measures one `getBoundingClientRect()`. It returns `{status:'revealed', target, bounds:{x,y,width,height}}` in CSS viewport pixels, or typed unavailable/stale/cancelled. Use instant scrolling; local pointing is static under both normal and reduced motion. Do not read text, query data attributes, inspect guest DOM, accept AI-generated selectors/coordinates, or scroll/click/type inside a guest. No reference to a renderer overlay establishes native guest content bounds.

`onInvalidate(listener)` is mandatory on the supplied revealer and returns unregister. The owning ref registry must emit **before** project/attempt replacement, sign-out, tool close/external handoff, target removal or layout/selection changes. Abort pending reveals and check the signal plus the producer's own lifecycle generation immediately before scroll/focus/measurement; a consumer can discard late geometry but cannot undo a late producer DOM side effect. A failed Practical flush leaves the human draft mounted and pointing/guidance revoked. A new explicit command is required to reveal again. Coordinator integration composes this same host invalidation with the existing synchronous guidance stop.

```ts
// Owned shell/Practical registry, not Companion DOM discovery:
const targetRevealer: CompanionTargetRevealer = {
  reveal: revealMountedPracticalTarget,
  onInvalidate: registerTargetInvalidation,
};
// Before downstream handoff/replacement/sign-out:
invalidateMountedTargets(); // local owned registry: abort reveal + clear geometry FIRST
companion.stop('external-handoff');
const flushed = await practicalFlush();
if (flushed.status === 'ready') await openExternalTool();
// <Companion ... targetRevealer={targetRevealer} />
```

The consumer rejects foreign/relabelled targets and nonfinite/empty/offscreen bounds; it clips partial bounds to the viewport, suppresses late results, and clears on Stop, selection/session replacement, unmount, host invalidation, scroll after reveal, resize and blur. Its own instant reveal scroll may finish while resolution is pending; the producer measures only after it settles. It does not continuously measure or track geometry. Re-reveal is explicit after layout changes. The overlay is pointer-events:none/aria-hidden; the producer focuses the normal app-owned control, while status text announces the target. Native visual alignment and actual producer ref wiring remain integrated acceptance work; synthetic geometry tests cannot establish them.

## Requester and cancellation lifecycle

`createCompanionRequester(options)` accepts the session options except `resolveTarget` and returns `{session, registerResolver, dispose}`. It supplies an unavailable result until the real mounted producer registers. Registration does no reading or requesting. Replacement aborts the old request before installing the new resolver; each registration has its own cleanup token, so stale cleanup cannot remove a newer producer even when both used the same function. Unregistration stops observation and clears the answer. Call `dispose()` for permanent teardown. Never recreate requesters on every render or register a resolver on each keystroke. Practical's stable resolver reads its live owned draft only when explicitly invoked.

The shell must forward the actual bound tool's navigation metadata even while guidance is off; this updates only the locally known identity and does not resolve context. A context that names a different bound tool session or URL is rejected. Navigation during initial tool resolution cancels the start. Later navigation aborts an in-flight tool cue, retains only an already-authorized activity scope, consumes successful URLs even while busy and never queues a trailing cue. A reflection request does not become a tool read. The physical request slot is retained until an aborted adapter settles; `draining: true` disables further requests and displays cancellation progress. Only cancellation settlement is published afterward, never old content or reactivated observation. Offline/unauthenticated results revoke ongoing guidance and require another explicit start.

`requestGuidance` must settle after abort and enforce a bounded deadline in its trusted adapter; the consumer never releases an uncooperative physical request slot early. Blank/whitespace-only answers or answers above 12,000 characters are errors and cannot activate guidance. Accepted answer text and human context are preserved verbatim. Failure messages must already be safe public copy. UI labels distinguish AI guidance, saved/unsaved human reflection, saved/unsaved human reports, imported results and app-measured results.
