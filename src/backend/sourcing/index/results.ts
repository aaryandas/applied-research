import { SOURCING_PUBLIC_MESSAGES } from '../../../contracts/sourcing.js';
import type { RetrieveEvidenceResponse } from '../../../contracts/sourcing.js';

import type { IndexFailureReason } from './types.js';

export class IndexOperationError extends Error {
  /** Only `reason` reaches results; `cause` is the standard Error option, not a public seam. */
  constructor(
    readonly reason: IndexFailureReason,
    options?: { cause?: unknown },
  ) {
    super('The index operation could not complete.', options);
  }
}

export interface IndexSearchResult {
  /** `partial`: valid evidence returned while some provider rows were suppressed. */
  readonly status: 'ready' | 'partial' | IndexFailureReason;
  readonly response: RetrieveEvidenceResponse;
}

export function failureReason(error: unknown): IndexFailureReason {
  return error instanceof IndexOperationError ? error.reason : 'unavailable';
}

export function searchFailure(
  error: unknown,
  inputId: unknown,
): IndexSearchResult {
  const status = failureReason(error);
  const requestId =
    typeof inputId === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9_-]{7,99}$/.test(inputId)
      ? inputId
      : null;
  if (status === 'invalid-input')
    return {
      status,
      response: {
        outcome: 'invalid-request',
        requestId,
        message: SOURCING_PUBLIC_MESSAGES.invalidRequest,
      },
    };
  if (requestId !== null) {
    if (status === 'cancelled')
      return {
        status,
        response: {
          outcome: 'cancelled',
          requestId,
          message: SOURCING_PUBLIC_MESSAGES.cancelled,
        },
      };
    if (status === 'timed-out')
      return {
        status,
        response: {
          outcome: 'timed-out',
          requestId,
          message: SOURCING_PUBLIC_MESSAGES.timedOut,
          retryable: true,
        },
      };
    if (status === 'rate-limited')
      return {
        status,
        response: {
          outcome: 'rate-limited',
          requestId,
          message: SOURCING_PUBLIC_MESSAGES.rateLimited,
          retryAfterMilliseconds: null,
        },
      };
  }
  return {
    status,
    response: {
      outcome: 'unavailable',
      requestId,
      message: SOURCING_PUBLIC_MESSAGES.unavailable,
      retryable: status === 'unavailable' || status === 'index-lag',
    },
  };
}
