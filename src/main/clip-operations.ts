import type { LearningOrigin } from '../contracts/learning-records';
import type {
  RetainedExplanationResult,
  SupportedExplanationPlan,
} from '../contracts/explanation-artifacts';
import {
  clipResultFromRetained,
  isSupportedClipPlan,
  recipeJsonFromClipPlan,
} from './clip-projection';
import type { ClipApiTransport } from './clip-transport';

export type ClipPlaybackResult =
  | { kind: 'unavailable'; message: string }
  | {
      kind: 'ready';
      result: Extract<RetainedExplanationResult, { kind: 'clip' }>;
    };

export interface ClipRequestIdentities {
  readonly requestId: string;
  readonly projectId: string;
  readonly explanationId: string;
  readonly explanationAttemptId: string;
  readonly origin: LearningOrigin;
  readonly projectGeneration: number;
  readonly requestGeneration: number;
}

export interface ClipRequestInput {
  readonly plan: SupportedExplanationPlan;
  readonly identities: ClipRequestIdentities;
}

export interface ClipOperationsDependencies {
  readonly accountId: () => string | null;
  readonly transport: ClipApiTransport;
  readonly now?: () => number;
  readonly lifetimeMs?: number;
  readonly isCurrent: (input: ClipRequestInput) => boolean;
}

const DEFAULT_LIFETIME_MS = 120_000;

export function createClipOperations(
  dependencies: ClipOperationsDependencies,
): {
  request(
    input: ClipRequestInput,
    signal: AbortSignal,
  ): Promise<ClipPlaybackResult>;
  revoke(): void;
} {
  const now = dependencies.now ?? Date.now;
  const lifetimeMs = dependencies.lifetimeMs ?? DEFAULT_LIFETIME_MS;
  const controllers = new Set<AbortController>();
  let revoked = 0;

  return {
    async request(input, signal) {
      const startedAt = now();
      const epoch = revoked;
      if (signal.aborted) {
        return {
          kind: 'unavailable',
          message: 'The clip request was cancelled.',
        };
      }
      if (!isSupportedClipPlan(input.plan)) {
        return {
          kind: 'unavailable',
          message: 'Only installed clip recipes can be rendered.',
        };
      }
      const accountId = dependencies.accountId();
      if (!accountId) {
        return {
          kind: 'unavailable',
          message: 'Sign in to request a rendered clip.',
        };
      }
      const mapped = recipeJsonFromClipPlan({
        plan: input.plan,
        requestId: input.identities.requestId,
        projectId: input.identities.projectId,
        origin: input.identities.origin,
      });
      if (!mapped.ok) {
        return { kind: 'unavailable', message: mapped.message };
      }
      const local = new AbortController();
      const abort = (): void => local.abort();
      signal.addEventListener('abort', abort, { once: true });
      controllers.add(local);
      try {
        const outcome = await dependencies.transport.submitAndRetain({
          requestId: input.identities.requestId,
          accountId,
          recipeJson: mapped.json,
          signal: local.signal,
        });
        if (epoch !== revoked || !dependencies.isCurrent(input)) {
          return {
            kind: 'unavailable',
            message: 'A newer clip request replaced this result.',
          };
        }
        if (now() - startedAt > lifetimeMs) {
          return {
            kind: 'unavailable',
            message: 'The clip request expired before it could be published.',
          };
        }
        if (outcome.status === 'cancelled' || local.signal.aborted) {
          return {
            kind: 'unavailable',
            message: 'The clip request was cancelled.',
          };
        }
        if (outcome.status !== 'ready') {
          return {
            kind: 'unavailable',
            message:
              outcome.status === 'corrupt'
                ? 'The retained clip failed verification.'
                : outcome.message,
          };
        }
        const result = clipResultFromRetained(outcome.record, input.plan);
        if (!result) {
          return {
            kind: 'unavailable',
            message: 'The retained clip failed verification.',
          };
        }
        return { kind: 'ready', result };
      } catch (error) {
        if (local.signal.aborted || signal.aborted) {
          return {
            kind: 'unavailable',
            message: 'The clip request was cancelled.',
          };
        }
        return {
          kind: 'unavailable',
          message:
            error instanceof Error
              ? error.message
              : 'The clip could not be requested.',
        };
      } finally {
        signal.removeEventListener('abort', abort);
        controllers.delete(local);
      }
    },
    revoke() {
      revoked += 1;
      for (const controller of controllers) controller.abort();
      controllers.clear();
    },
  };
}
