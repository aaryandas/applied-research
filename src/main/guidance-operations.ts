import {
  decodeCompanionGuidanceCancelRequest,
  decodeCompanionGuidanceRequest,
  type CompanionGuidanceReply,
  type CompanionGuidanceRequest,
} from '../contracts/companion-guidance';
import { isContractUuid } from '../contracts/contextual-contract-guards';
import { buildCompanionGuidanceEnvelope } from './guidance-envelope';
import type { CompanionGuidanceEnvelope } from './guidance-envelope';
import {
  CompanionGuidanceTransportError,
  type makeCompanionGuidanceTransport,
} from './guidance-transport';
import type { CompanionResolveResult } from './guidance-context';

export type CompanionGuidanceRevokeReason =
  | 'user-stop'
  | 'sign-out'
  | 'project-replaced'
  | 'attempt-replaced'
  | 'selection-replaced'
  | 'tool-closed'
  | 'external-handoff'
  | 'teardown'
  | 'unmount';

export interface CompanionGuidanceOperationsOptions {
  /** True only for the signed-in desktop session. */
  readonly authenticated: () => boolean;
  /** Currently bound workspace for this window. */
  readonly activeProject: () => { projectId: string } | null;
  /** Increments when the owning surface replaces selection/attempt/tool. */
  readonly selectionEpoch: () => number;
  readonly resolve: (
    request: CompanionGuidanceRequest,
    signal: AbortSignal,
  ) => Promise<CompanionResolveResult>;
  readonly post:
    | ReturnType<typeof makeCompanionGuidanceTransport>
    | ((
        envelope: CompanionGuidanceEnvelope,
        signal: AbortSignal,
      ) => Promise<CompanionGuidanceReply>);
}

export interface CompanionGuidanceGenerations {
  readonly projectGeneration: number;
  readonly requestGeneration: number;
}

export interface CompanionGuidanceOperations {
  activate(projectId: string): CompanionGuidanceGenerations;
  request(value: unknown): Promise<CompanionGuidanceReply>;
  cancel(value: unknown): void;
  revoke(reason: CompanionGuidanceRevokeReason): void;
  dispose(): void;
}

function failure(
  outcome: Exclude<CompanionGuidanceReply['outcome'], 'success'>,
  requestId: string | null,
  message: string,
): CompanionGuidanceReply {
  return { outcome, requestId, message };
}

function lateReply(
  aborted: boolean,
  requestId: string,
): CompanionGuidanceReply {
  return failure(
    aborted ? 'cancelled' : 'stale',
    requestId,
    aborted
      ? 'The companion request was cancelled.'
      : 'The selected context changed. Ask again.',
  );
}

export function createCompanionGuidanceOperations(
  options: CompanionGuidanceOperationsOptions,
): CompanionGuidanceOperations {
  let projectId: string | null = null;
  let projectGeneration = 0;
  let requestGeneration = 0;
  let disposed = false;
  const pending = new Map<string, AbortController>();

  function current(): boolean {
    return !disposed && projectId !== null;
  }

  function revoke(reason: CompanionGuidanceRevokeReason): void {
    for (const controller of pending.values()) controller.abort();
    pending.clear();
    requestGeneration += 1;
    if (
      reason === 'sign-out' ||
      reason === 'teardown' ||
      reason === 'unmount' ||
      reason === 'project-replaced'
    ) {
      projectId = null;
    }
  }

  return {
    activate(nextProjectId) {
      if (disposed) {
        return { projectGeneration, requestGeneration };
      }
      if (!isContractUuid(nextProjectId)) {
        revoke('project-replaced');
        return { projectGeneration, requestGeneration };
      }
      if (nextProjectId === projectId) {
        return { projectGeneration, requestGeneration };
      }
      revoke('project-replaced');
      projectId = nextProjectId;
      projectGeneration += 1;
      requestGeneration = 0;
      return { projectGeneration, requestGeneration };
    },
    cancel(value) {
      const decoded = decodeCompanionGuidanceCancelRequest(value);
      if (!decoded.ok) return;
      if (
        decoded.value.expectedProjectGeneration !== projectGeneration ||
        decoded.value.expectedRequestGeneration !== requestGeneration
      ) {
        return;
      }
      pending.get(decoded.value.requestId)?.abort();
    },
    revoke,
    dispose() {
      if (disposed) return;
      revoke('teardown');
      disposed = true;
    },
    async request(value) {
      const decoded = decodeCompanionGuidanceRequest(value);
      if (!decoded.ok) {
        return failure(
          'invalid-request',
          null,
          'The companion request is invalid.',
        );
      }
      const request = decoded.value;
      const active = options.activeProject();
      if (
        !current() ||
        !active ||
        request.target.projectId !== projectId ||
        request.target.projectId !== active.projectId
      ) {
        return failure(
          'stale',
          request.requestId,
          'This request does not belong to the active learning space.',
        );
      }
      if (
        request.expectedProjectGeneration !== projectGeneration ||
        request.expectedRequestGeneration !== requestGeneration
      ) {
        return failure(
          'stale',
          request.requestId,
          'Companion guidance is out of date. Ask again.',
        );
      }
      if (pending.size >= 1) {
        return failure(
          'invalid-request',
          request.requestId,
          'A companion guidance request is already in progress.',
        );
      }
      if (!options.authenticated()) {
        return failure(
          'unauthenticated',
          request.requestId,
          'Sign in to use remote learning.',
        );
      }
      const epoch = options.selectionEpoch();
      const controller = new AbortController();
      pending.set(request.requestId, controller);
      const stillHeld = (): boolean =>
        current() &&
        request.target.projectId === projectId &&
        request.expectedProjectGeneration === projectGeneration &&
        request.expectedRequestGeneration === requestGeneration &&
        options.selectionEpoch() === epoch &&
        !controller.signal.aborted;

      try {
        const resolved = await options.resolve(request, controller.signal);
        if (!stillHeld()) {
          return lateReply(controller.signal.aborted, request.requestId);
        }
        if (!resolved.ok) return resolved.reply;
        const envelope = buildCompanionGuidanceEnvelope({
          requestId: request.requestId,
          projectId: request.target.projectId,
          projectGeneration,
          requestGeneration,
          cause: request.cause,
          resolved: resolved.value,
        });
        const reply = await options.post(envelope, controller.signal);
        if (!stillHeld()) {
          return lateReply(controller.signal.aborted, request.requestId);
        }
        if (
          reply.outcome === 'success' &&
          reply.requestId !== request.requestId
        ) {
          return failure(
            'stale',
            request.requestId,
            'The selected context changed. Ask again.',
          );
        }
        return reply;
      } catch (error) {
        if (controller.signal.aborted || disposed) {
          return failure(
            'cancelled',
            request.requestId,
            'The companion request was cancelled.',
          );
        }
        if (error instanceof CompanionGuidanceTransportError) {
          return failure(error.code, request.requestId, error.message);
        }
        return failure(
          'unavailable',
          request.requestId,
          'Remote learning is temporarily unavailable.',
        );
      } finally {
        if (pending.get(request.requestId) === controller) {
          pending.delete(request.requestId);
        }
      }
    },
  };
}
