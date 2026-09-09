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

/** Matches AR-51 `RetainedClipRequestContext`. Identity is reserved before this call. */
export interface RetainedClipRequestContext {
  readonly explanationId: string;
  readonly attemptId: string;
  readonly origin: LearningOrigin;
  readonly plan: SupportedExplanationPlan;
  readonly signal: AbortSignal;
}

export interface ClipOperationsDependencies {
  readonly accountId: () => string | null;
  readonly projectId: () => string | null;
  readonly transport: ClipApiTransport;
  readonly now?: () => number;
  readonly lifetimeMs?: number;
  readonly isCurrent?: (context: RetainedClipRequestContext) => boolean;
}

const DEFAULT_LIFETIME_MS = 120_000;
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;

export function createClipOperations(
  dependencies: ClipOperationsDependencies,
): {
  request(context: RetainedClipRequestContext): Promise<ClipPlaybackResult>;
  revoke(): void;
} {
  const now = dependencies.now ?? Date.now;
  const lifetimeMs = dependencies.lifetimeMs ?? DEFAULT_LIFETIME_MS;
  const isCurrent = dependencies.isCurrent ?? (() => true);
  const controllers = new Set<AbortController>();
  let revoked = 0;

  return {
    async request(context) {
      const startedAt = now();
      const epoch = revoked;
      if (context.signal.aborted) {
        return {
          kind: 'unavailable',
          message: 'The clip request was cancelled.',
        };
      }
      if (!UUID.test(context.explanationId) || !UUID.test(context.attemptId)) {
        return {
          kind: 'unavailable',
          message: 'Clip identity must be a UUID.',
        };
      }
      if (!isSupportedClipPlan(context.plan)) {
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
      const projectId = dependencies.projectId();
      if (!projectId) {
        return {
          kind: 'unavailable',
          message: 'The clip request has no active learning space.',
        };
      }
      const mapped = recipeJsonFromClipPlan({
        plan: context.plan,
        requestId: context.attemptId,
        projectId,
        origin: context.origin,
      });
      if (!mapped.ok) {
        return { kind: 'unavailable', message: mapped.message };
      }
      const local = new AbortController();
      const abort = (): void => local.abort();
      context.signal.addEventListener('abort', abort, { once: true });
      controllers.add(local);
      try {
        const outcome = await dependencies.transport.submitAndRetain({
          requestId: context.attemptId,
          accountId,
          recipeJson: mapped.json,
          signal: local.signal,
        });
        if (epoch !== revoked || !isCurrent(context)) {
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
        const result = clipResultFromRetained(outcome.record, context.plan);
        if (!result) {
          return {
            kind: 'unavailable',
            message: 'The retained clip failed verification.',
          };
        }
        return { kind: 'ready', result };
      } catch (error) {
        if (local.signal.aborted || context.signal.aborted) {
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
        context.signal.removeEventListener('abort', abort);
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
