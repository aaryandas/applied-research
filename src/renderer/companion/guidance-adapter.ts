import type {
  CompanionGuidanceInput,
  CompanionGuidanceReply as CompanionSessionReply,
  CompanionVersion,
} from '../../contracts/companion';
import {
  COMPANION_GUIDANCE_CONTRACT_VERSION,
  type CompanionEvidenceReference,
  type CompanionGuidanceCancelRequest,
  type CompanionGuidanceCause,
  type CompanionGuidanceReply,
  type CompanionGuidanceRequest,
  type CompanionHumanUtterance,
  type CompanionSelectedTarget,
} from '../../contracts/companion-guidance';
import type { PracticalEvidenceReference } from '../../contracts/practical-work';

export const CONSUMER_ANSWER_LIMIT = 12_000;

export interface CompanionGuidanceBridge {
  requestCompanionGuidance(
    request: CompanionGuidanceRequest,
  ): Promise<CompanionGuidanceReply>;
  cancelCompanionGuidance(request: CompanionGuidanceCancelRequest): void;
}

export interface CompanionGuidanceHostOptions {
  readonly bridge: CompanionGuidanceBridge;
  readonly activate: (
    projectId: string,
  ) =>
    | { projectGeneration: number; requestGeneration: number }
    | Promise<{ projectGeneration: number; requestGeneration: number }>;
  readonly createRequestId: () => string;
}

export interface CompanionGuidanceHostState {
  readonly projectId: string | null;
  readonly projectGeneration: number;
  readonly requestGeneration: number;
  readonly pending: 'requesting' | null;
  readonly draining: boolean;
  readonly activity: 'off' | 'starting' | 'active';
  readonly selection: CompanionSelectedTarget | null;
  readonly evidence: CompanionEvidenceReference;
  readonly utterance: CompanionHumanUtterance;
  readonly reply: CompanionGuidanceReply | null;
}

export interface CompanionGuidanceController {
  getState(): CompanionGuidanceHostState;
  subscribe(listener: () => void): () => void;
  bindProject(projectId: string): Promise<void>;
  setSelection(
    target: CompanionSelectedTarget | null,
    evidence?: CompanionEvidenceReference,
  ): void;
  setUtterance(utterance: CompanionHumanUtterance): void;
  askOnce(cause?: CompanionGuidanceCause): Promise<CompanionGuidanceReply>;
  startActivity(): Promise<CompanionGuidanceReply>;
  cancel(): void;
  stop(): void;
  invalidate(): void;
  requestFromSession(
    input: CompanionGuidanceInput,
    signal: AbortSignal,
  ): Promise<CompanionSessionReply>;
  dispose(): void;
}

const EMPTY: CompanionGuidanceHostState = {
  projectId: null,
  projectGeneration: 0,
  requestGeneration: 0,
  pending: null,
  draining: false,
  activity: 'off',
  selection: null,
  evidence: { kind: 'none' },
  utterance: { kind: 'none' },
  reply: null,
};

function boundAnswer(reply: CompanionGuidanceReply): CompanionGuidanceReply {
  if (reply.outcome !== 'success') return reply;
  if (!reply.text.trim() || reply.text.length > CONSUMER_ANSWER_LIMIT) {
    return {
      outcome: 'unavailable',
      requestId: reply.requestId,
      message: 'The guidance answer is outside the consumer limit.',
    };
  }
  return reply;
}

function toSessionReply(reply: CompanionGuidanceReply): CompanionSessionReply {
  if (reply.outcome === 'success') {
    return { status: 'answered', text: reply.text };
  }
  if (
    reply.outcome === 'unauthenticated' ||
    reply.outcome === 'offline' ||
    reply.outcome === 'cancelled' ||
    reply.outcome === 'stale'
  ) {
    return { status: reply.outcome, message: reply.message };
  }
  if (
    reply.outcome === 'quota-exceeded' ||
    reply.outcome === 'invalid-request'
  ) {
    return { status: 'error', message: reply.message };
  }
  return { status: 'unavailable', message: reply.message };
}

function opaqueEvidence(
  reference: PracticalEvidenceReference,
): CompanionEvidenceReference {
  if (reference.kind === 'user-selected-file') {
    return {
      kind: 'user-selected-file',
      selectionId: reference.selectionId,
    };
  }
  return { kind: 'app-measured', captureId: reference.captureId };
}

function versionUtterance(
  version: CompanionVersion,
  question: string,
): CompanionHumanUtterance {
  if (version.kind === 'saved') {
    return {
      kind: 'human',
      text: question,
      persistence: 'saved',
      savedRevision: version.revision,
    };
  }
  return {
    kind: 'human',
    text: question,
    persistence: 'unsaved-draft',
    savedRevision: version.lastAcknowledgedRevision,
  };
}

function requestFromSessionMapping(input: CompanionGuidanceInput): {
  utterance: CompanionHumanUtterance;
  evidence: CompanionEvidenceReference;
} {
  const context = input.context;
  if (context.target === 'selected-result') {
    if (context.result.kind === 'trusted-selected-evidence') {
      return {
        utterance: {
          kind: 'app-authored-intent',
          intent: 'ask-about-selection',
        },
        evidence: opaqueEvidence(context.result.reference),
      };
    }
    return {
      utterance: versionUtterance(
        context.result.version,
        'Help me interpret the selected result.',
      ),
      evidence: { kind: 'none' },
    };
  }
  if (context.target === 'reflection') {
    return {
      utterance: versionUtterance(
        context.version,
        'Help me improve this reflection without rewriting it for me.',
      ),
      evidence: { kind: 'none' },
    };
  }
  return {
    utterance: {
      kind: 'app-authored-intent',
      intent: 'ask-about-selection',
    },
    evidence: { kind: 'none' },
  };
}

function practicalTarget(
  input: CompanionGuidanceInput,
): Extract<CompanionSelectedTarget, { surface: 'practical-work' }> | null {
  const activity = input.requestedTarget.activity;
  if (input.requestedTarget.surface !== 'practical-work') return null;
  return {
    surface: 'practical-work',
    projectId: activity.projectId,
    attemptId: input.requestedTarget.attemptId,
    target: input.requestedTarget.target,
  };
}

export function createCompanionGuidanceHost(
  options: CompanionGuidanceHostOptions,
): CompanionGuidanceController {
  const listeners = new Set<() => void>();
  let state: CompanionGuidanceHostState = EMPTY;
  let disposed = false;
  let inFlight: AbortController | null = null;
  let inFlightId: string | null = null;

  function publish(next: CompanionGuidanceHostState): void {
    state = next;
    for (const listener of listeners) listener();
  }

  function abortSlot(): void {
    const controller = inFlight;
    const requestId = inFlightId;
    if (controller) {
      controller.abort();
      if (requestId && state.projectId) {
        options.bridge.cancelCompanionGuidance({
          requestId,
          expectedProjectGeneration: state.projectGeneration,
          expectedRequestGeneration: state.requestGeneration,
        });
      }
    }
  }

  async function dispatch(
    cause: CompanionGuidanceCause,
    target: CompanionSelectedTarget,
    utterance: CompanionHumanUtterance,
    evidence: CompanionEvidenceReference,
    signal?: AbortSignal,
    publishReply = true,
  ): Promise<CompanionGuidanceReply> {
    if (disposed) {
      return {
        outcome: 'cancelled',
        requestId: null,
        message: 'Guidance stopped. Ask again when ready.',
      };
    }
    if (inFlight) {
      return {
        outcome: 'invalid-request',
        requestId: null,
        message: 'A companion guidance request is already in progress.',
      };
    }
    const controller = new AbortController();
    inFlight = controller;
    const onAbort = (): void => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) controller.abort();
    try {
      if (state.projectId !== target.projectId) {
        await bind(target.projectId);
      }
      if (disposed || controller.signal.aborted) {
        return {
          outcome: 'cancelled',
          requestId: null,
          message: 'Guidance stopped. Ask again when ready.',
        };
      }
      const requestId = options.createRequestId();
      inFlightId = requestId;
      const payload: CompanionGuidanceRequest = {
        contractVersion: COMPANION_GUIDANCE_CONTRACT_VERSION,
        requestId,
        expectedProjectGeneration: state.projectGeneration,
        expectedRequestGeneration: state.requestGeneration,
        trigger: 'explicit-action',
        cause,
        target,
        utterance,
        selectedEvidence: evidence,
        pageAccess: 'none',
      };
      if (publishReply) {
        publish({
          ...state,
          pending: 'requesting',
          draining: false,
          activity: cause === 'activity-start' ? 'starting' : state.activity,
          reply: null,
        });
      }
      const reply = boundAnswer(
        await options.bridge.requestCompanionGuidance(payload),
      );
      if (controller.signal.aborted || disposed) {
        const cancelled: CompanionGuidanceReply = {
          outcome: 'cancelled',
          requestId,
          message: 'Guidance stopped. Ask again when ready.',
        };
        if (publishReply) {
          publish({
            ...state,
            pending: null,
            draining: false,
            activity: 'off',
            reply: cancelled,
          });
        }
        return cancelled;
      }
      const activity =
        cause === 'activity-start' && reply.outcome === 'success'
          ? 'active'
          : cause === 'activity-start'
            ? 'off'
            : state.activity === 'starting'
              ? 'off'
              : state.activity;
      if (publishReply) {
        publish({
          ...state,
          pending: null,
          draining: false,
          activity,
          reply,
        });
      }
      return reply;
    } catch {
      const failed: CompanionGuidanceReply = controller.signal.aborted
        ? {
            outcome: 'cancelled',
            requestId: inFlightId,
            message: 'Guidance stopped. Ask again when ready.',
          }
        : {
            outcome: 'unavailable',
            requestId: inFlightId,
            message: 'Guidance could not finish. Try again explicitly.',
          };
      if (publishReply) {
        publish({
          ...state,
          pending: null,
          draining: false,
          activity: 'off',
          reply: failed,
        });
      }
      return failed;
    } finally {
      signal?.removeEventListener('abort', onAbort);
      if (inFlight === controller) {
        inFlight = null;
        inFlightId = null;
      }
    }
  }

  async function bind(projectId: string): Promise<void> {
    const gens = await options.activate(projectId);
    if (disposed) return;
    publish({
      ...state,
      projectId,
      projectGeneration: gens.projectGeneration,
      requestGeneration: gens.requestGeneration,
    });
  }

  async function ask(
    cause: CompanionGuidanceCause,
  ): Promise<CompanionGuidanceReply> {
    if (!state.selection) {
      return {
        outcome: 'invalid-request',
        requestId: null,
        message: 'Select an available target to ask about.',
      };
    }
    return dispatch(cause, state.selection, state.utterance, state.evidence);
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    bindProject: bind,
    setSelection(target, evidence = { kind: 'none' }) {
      publish({
        ...state,
        selection: target,
        evidence,
      });
    },
    setUtterance(utterance) {
      publish({ ...state, utterance });
    },
    askOnce(cause = 'ask-once') {
      return ask(cause);
    },
    startActivity() {
      return ask('activity-start');
    },
    cancel() {
      if (!inFlight) return;
      publish({
        ...state,
        pending: null,
        draining: true,
        activity: 'off',
        reply: {
          outcome: 'cancelled',
          requestId: inFlightId,
          message: 'Guidance stopped. Ask again when ready.',
        },
      });
      abortSlot();
    },
    stop() {
      publish({
        ...state,
        pending: null,
        draining: inFlight !== null,
        activity: 'off',
        reply: {
          outcome: 'cancelled',
          requestId: inFlightId,
          message: 'Guidance stopped. Ask again when ready.',
        },
      });
      abortSlot();
    },
    invalidate() {
      const requestId = inFlightId;
      abortSlot();
      publish({
        ...state,
        pending: null,
        draining: false,
        activity: 'off',
        reply: requestId
          ? {
              outcome: 'cancelled',
              requestId,
              message: 'Guidance stopped. Ask again when ready.',
            }
          : state.reply,
      });
    },
    async requestFromSession(input, signal) {
      if (input.cause !== 'ask-once' && input.cause !== 'activity-start') {
        return {
          status: 'unavailable',
          message:
            'Tool navigation does not request another answer. Ask explicitly.',
        };
      }
      const target = practicalTarget(input);
      if (!target) {
        return {
          status: 'stale',
          message: 'This target belongs to a different activity or attempt.',
        };
      }
      const mapping = requestFromSessionMapping(input);
      const reply = await dispatch(
        input.cause,
        target,
        mapping.utterance,
        mapping.evidence,
        signal,
        false,
      );
      return toSessionReply(reply);
    },
    dispose() {
      disposed = true;
      abortSlot();
      listeners.clear();
      state = EMPTY;
    },
  };
}
