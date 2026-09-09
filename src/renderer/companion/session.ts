import type {
  CompanionContext,
  CompanionGuidanceInput,
  CompanionOutcome,
  CompanionSession,
  CompanionSessionOptions,
  CompanionState,
  CompanionStopReason,
} from '../../contracts/companion';
import type {
  PracticalGuidanceRequest,
  PracticalTarget,
} from '../../contracts/practical-work';

const NAVIGATION_INTERVAL_MS = 15_000;
const MAX_CONTEXT_CHARACTERS = 12_000;
const MAX_ANSWER_CHARACTERS = 12_000;
const cancelled = (): CompanionOutcome => ({
  status: 'cancelled',
  message: 'Guidance stopped. Ask again when ready.',
});

function hasForeignGuest(
  context: CompanionContext,
  binding: { sessionId: string; url: string } | null,
): boolean {
  if (context.target !== 'tool-controls' || !context.guest || !binding)
    return false;
  return (
    context.guest.sessionId !== binding.sessionId ||
    context.guest.url !== binding.url
  );
}

/** Compare every immutable origin field; neither object identity nor projectId alone is sufficient. */
function sameTargetIdentity(
  left: PracticalTarget,
  right: PracticalTarget,
): boolean {
  const a = left.activity;
  const b = right.activity;
  return (
    left.scope === right.scope &&
    left.surface === right.surface &&
    left.attemptId === right.attemptId &&
    a.projectId === b.projectId &&
    a.origin.sourceRevisionId === b.origin.sourceRevisionId &&
    a.origin.highlightId === b.origin.highlightId &&
    a.origin.path.pathId === b.origin.path.pathId &&
    a.origin.path.pathRevision === b.origin.path.pathRevision &&
    a.origin.path.topicId === b.origin.path.topicId &&
    a.origin.path.lessonId === b.origin.path.lessonId &&
    a.title === b.title &&
    a.objective === b.objective &&
    a.instructions === b.instructions
  );
}

export function createCompanionSession(
  options: CompanionSessionOptions,
): CompanionSession {
  const identity = structuredClone({
    attemptId: options.attemptId,
    activity: options.activity,
  });
  const binding = options.toolSession ? { ...options.toolSession } : null;
  let currentTool = binding
    ? { sessionId: binding.sessionId, url: binding.initialUrl }
    : null;
  const boundTarget: PracticalTarget = {
    ...identity,
    scope: 'applied-research',
    surface: 'practical-work',
    target: 'activity-instructions',
  };
  let state: CompanionState = {
    activity: identity,
    observation: { status: 'inactive', reason: null },
    pending: null,
    draining: false,
    outcome: null,
  };
  let generation = 0;
  let disposed = false;
  // Retain the physical request slot until even an uncooperative transport settles.
  let inFlight: AbortController | null = null;
  let pendingTarget: PracticalTarget['target'] | null = null;
  let lastUrl = binding?.initialUrl ?? '';
  let lastAt = -Infinity;

  function publish(): void {
    if (!disposed) options.onStateChange(structuredClone(state));
  }
  function stop(reason: CompanionStopReason): void {
    generation += 1;
    state = {
      ...state,
      observation: { status: 'inactive', reason },
      pending: null,
      draining: inFlight !== null,
      outcome: cancelled(),
    };
    const controller = inFlight;
    controller?.abort();
    publish();
  }

  async function execute(
    request: PracticalGuidanceRequest,
    cause: CompanionGuidanceInput['cause'],
  ): Promise<CompanionOutcome> {
    if (disposed) return cancelled();
    if (
      request.trigger !== 'explicit-action' ||
      !sameTargetIdentity(boundTarget, request.target)
    ) {
      const outcome: CompanionOutcome = {
        status: 'stale',
        message: 'This target belongs to a different activity or attempt.',
      };
      state = { ...state, outcome };
      publish();
      return outcome;
    }
    if (inFlight) return { status: 'ignored', reason: 'busy' };
    if (cause === 'activity-start' && state.observation.status !== 'inactive')
      return { status: 'ignored', reason: 'already-active' };
    const selected = structuredClone(request);
    const controller = new AbortController();
    const token = generation;
    inFlight = controller;
    pendingTarget = selected.target.target;
    const current = (): boolean =>
      !disposed && generation === token && !controller.signal.aborted;
    if (cause === 'activity-start') {
      state = {
        ...state,
        observation: {
          status: 'starting',
          target: selected.target,
          toolSessionId:
            selected.target.target === 'tool-controls'
              ? (binding?.sessionId ?? null)
              : null,
        },
      };
    }
    state = { ...state, pending: 'resolving', outcome: null };
    publish();
    let outcome: CompanionOutcome;
    try {
      if (!current()) return cancelled();
      const resolved = await options.resolveTarget(
        structuredClone(selected),
        controller.signal,
      );
      if (!current()) return cancelled();
      if (resolved.status !== 'available') outcome = resolved;
      else if (
        !sameTargetIdentity(selected.target, resolved.requestedTarget) ||
        resolved.context.target !== selected.target.target ||
        resolved.requestedTarget.target !== selected.target.target ||
        hasForeignGuest(resolved.context, currentTool)
      ) {
        outcome = {
          status: 'stale',
          message: 'The selected context changed. Select the target again.',
        };
      } else if (
        JSON.stringify(resolved.context).length > MAX_CONTEXT_CHARACTERS
      ) {
        outcome = {
          status: 'unavailable',
          message: 'The selected context exceeds the guidance limit.',
        };
      } else {
        const input: CompanionGuidanceInput = {
          requestId: options.createRequestId(),
          requestedTarget: selected.target,
          cause,
          context: structuredClone(resolved.context),
          pageAccess: 'none',
        };
        state = { ...state, pending: 'requesting' };
        publish();
        if (!current()) return cancelled();
        const reply = await options.requestGuidance(
          structuredClone(input),
          controller.signal,
        );
        if (!current()) return cancelled();
        if (
          reply.status === 'answered' &&
          (!reply.text.trim() || reply.text.length > MAX_ANSWER_CHARACTERS)
        ) {
          throw new Error('Invalid guidance answer');
        }
        outcome =
          reply.status === 'answered'
            ? {
                ...input,
                status: 'answered',
                authorKind: 'ai',
                text: reply.text,
              }
            : reply;
      }
    } catch {
      outcome = current()
        ? {
            status: 'error',
            message: 'Guidance could not finish. Try again explicitly.',
          }
        : cancelled();
    } finally {
      if (inFlight === controller) {
        inFlight = null;
        pendingTarget = null;
        if (state.draining) {
          state = { ...state, draining: false };
          publish();
        }
      }
    }
    if (!current()) return cancelled();
    if (
      cause === 'activity-start' ||
      outcome.status === 'offline' ||
      outcome.status === 'unauthenticated'
    ) {
      if (
        outcome.status === 'answered' &&
        state.observation.status === 'starting'
      ) {
        state = {
          ...state,
          observation: { ...state.observation, status: 'active' },
        };
        lastAt = options.now();
        lastUrl = currentTool?.url ?? lastUrl;
      } else if (outcome.status !== 'answered') {
        generation += 1;
        state = {
          ...state,
          observation: { status: 'inactive', reason: 'start-failed' },
        };
      }
    }
    state = { ...state, pending: null, outcome: structuredClone(outcome) };
    publish();
    return structuredClone(outcome);
  }

  return {
    getState: () => structuredClone(state),
    askOnce: (request) => execute(request, 'ask-once'),
    startActivity: (request) => execute(request, 'activity-start'),
    async observeToolNavigation(event) {
      if (disposed) return { status: 'ignored', reason: 'inactive' };
      const observation = state.observation;
      const changedTool =
        currentTool &&
        event.sessionId === currentTool.sessionId &&
        (event.loading ||
          event.error !== null ||
          event.url !== currentTool.url);
      if (currentTool && event.sessionId === currentTool.sessionId)
        currentTool = { sessionId: event.sessionId, url: event.url };
      if (
        observation.status === 'starting' &&
        event.sessionId === observation.toolSessionId &&
        changedTool
      ) {
        stop('tool-navigation');
        return cancelled();
      }
      if (changedTool && pendingTarget === 'tool-controls') {
        generation += 1;
        inFlight?.abort();
        state = {
          ...state,
          pending: null,
          draining: inFlight !== null,
          outcome: {
            status: 'stale',
            message: 'The tool navigated. The previous cue was discarded.',
          },
        };
        publish();
      }
      if (
        disposed ||
        observation.status !== 'active' ||
        !observation.toolSessionId
      )
        return { status: 'ignored', reason: 'inactive' };
      if (
        event.sessionId !== observation.toolSessionId ||
        event.loading ||
        event.error !== null ||
        !event.url ||
        event.url === lastUrl
      )
        return { status: 'ignored', reason: 'navigation' };
      // Consume the URL even when busy/throttled: no trailing queued read.
      lastUrl = event.url;
      const time = options.now();
      if (inFlight || time - lastAt < NAVIGATION_INTERVAL_MS)
        return { status: 'ignored', reason: 'navigation' };
      lastAt = time;
      return execute(
        { trigger: 'explicit-action', target: observation.target },
        'tool-navigation',
      );
    },
    stop,
    dispose() {
      if (!disposed) {
        stop('unmount');
        disposed = true;
      }
    },
  };
}
