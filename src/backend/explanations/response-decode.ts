import {
  LEARNING_API_VERSION,
  LEARNING_MODEL_ALLOWLIST,
  type AccountingDisposition,
  type AiProvenance,
  type MonthlyQuota,
  type SourceRevisionLocator,
} from '../../contracts/learning-api.js';
import {
  decodeExactRecord,
  extraKeyReason,
  failed,
  isBoundedRemoteText,
  isContractGeneration,
  isContractRecord,
  isContractSha256,
  isDenseArray,
  isIsoTimestamp,
  type ContractDecode,
} from '../../contracts/contextual-contract-guards.js';
import { decodeExplanationPlan } from './plan-decode.js';
import {
  citedSourcesAreAdmitted,
  decodePlannerRenderReceipt,
} from './render-context.js';
import type { ExplanationPlanHttpResponse } from './types.js';

const MONTH_PATTERN = /^\d{4}-\d{2}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,99}$/;
const ACCOUNTING: readonly AccountingDisposition[] = [
  'none',
  'released',
  'charged',
  'reservation-retained',
];
const CANCEL_ACCOUNTING = [
  'released',
  'charged',
  'reservation-retained',
] as const;
const SOURCE_FORMATS = ['plain-text', 'markdown', 'html', 'pdf'] as const;
const SOURCE_PROVENANCE = [
  'human-imported',
  'generated',
  'discovered',
] as const;

function includes<T>(values: readonly T[], value: unknown): value is T {
  const candidates: readonly unknown[] = values;
  return candidates.includes(value);
}

function requestIdMatches(
  value: unknown,
  expected: string,
): value is string | null {
  if (value === null) return true;
  return value === expected;
}

function decodeQuota(value: unknown): ContractDecode<MonthlyQuota> {
  const decoded = decodeExactRecord(value, [
    'month',
    'limitMicrousd',
    'committedMicrousd',
    'reservedMicrousd',
    'remainingMicrousd',
  ]);
  if (!decoded.ok) return decoded;
  if (
    typeof decoded.value.month !== 'string' ||
    !MONTH_PATTERN.test(decoded.value.month)
  ) {
    return failed('revision');
  }
  if (
    !isContractGeneration(decoded.value.limitMicrousd) ||
    !isContractGeneration(decoded.value.committedMicrousd) ||
    !isContractGeneration(decoded.value.reservedMicrousd) ||
    !isContractGeneration(decoded.value.remainingMicrousd)
  ) {
    return failed('bounds');
  }
  return {
    ok: true,
    value: {
      month: decoded.value.month,
      limitMicrousd: decoded.value.limitMicrousd,
      committedMicrousd: decoded.value.committedMicrousd,
      reservedMicrousd: decoded.value.reservedMicrousd,
      remainingMicrousd: decoded.value.remainingMicrousd,
    },
  };
}

function decodeLocator(value: unknown): ContractDecode<SourceRevisionLocator> {
  const decoded = decodeExactRecord(value, [
    'sourceId',
    'revisionId',
    'title',
    'sha256',
    'format',
    'canonicalizationVersion',
    'acquiredAt',
    'provenance',
  ]);
  if (!decoded.ok) return decoded;
  if (
    typeof decoded.value.sourceId !== 'string' ||
    !IDENTIFIER_PATTERN.test(decoded.value.sourceId) ||
    typeof decoded.value.revisionId !== 'string' ||
    !IDENTIFIER_PATTERN.test(decoded.value.revisionId) ||
    typeof decoded.value.title !== 'string' ||
    !isBoundedRemoteText(decoded.value.title, 200) ||
    !isContractSha256(decoded.value.sha256) ||
    !includes(SOURCE_FORMATS, decoded.value.format) ||
    typeof decoded.value.canonicalizationVersion !== 'string' ||
    !IDENTIFIER_PATTERN.test(decoded.value.canonicalizationVersion) ||
    !isIsoTimestamp(decoded.value.acquiredAt)
  ) {
    return failed('bounds');
  }
  if (!isContractRecord(decoded.value.provenance)) return failed('shape');
  const provenance = decoded.value.provenance;
  const extra = extraKeyReason(provenance, ['kind', 'locator']);
  if (extra) return failed(extra);
  if (!includes(SOURCE_PROVENANCE, provenance.kind))
    return failed('unsupported');
  if (provenance.locator !== null && typeof provenance.locator !== 'string') {
    return failed('bounds');
  }
  return {
    ok: true,
    value: {
      sourceId: decoded.value.sourceId,
      revisionId: decoded.value.revisionId,
      title: decoded.value.title,
      sha256: decoded.value.sha256,
      format: decoded.value.format,
      canonicalizationVersion: decoded.value.canonicalizationVersion,
      acquiredAt: decoded.value.acquiredAt,
      provenance: {
        kind: provenance.kind,
        locator: provenance.locator,
      },
    },
  };
}

function decodeProvenance(value: unknown): ContractDecode<AiProvenance> {
  const decoded = decodeExactRecord(value, [
    'author',
    'provider',
    'providerRequestId',
    'model',
    'requestVersion',
    'promptVersion',
    'createdAt',
    'sourceRevisions',
  ]);
  if (!decoded.ok) return decoded;
  if (
    decoded.value.author !== 'ai' ||
    decoded.value.provider !== 'openrouter' ||
    typeof decoded.value.providerRequestId !== 'string' ||
    !isBoundedRemoteText(decoded.value.providerRequestId, 200) ||
    decoded.value.model !== LEARNING_MODEL_ALLOWLIST[0] ||
    decoded.value.requestVersion !== LEARNING_API_VERSION ||
    typeof decoded.value.promptVersion !== 'string' ||
    !IDENTIFIER_PATTERN.test(decoded.value.promptVersion) ||
    !isIsoTimestamp(decoded.value.createdAt) ||
    !isDenseArray(decoded.value.sourceRevisions) ||
    decoded.value.sourceRevisions.length < 1 ||
    decoded.value.sourceRevisions.length > 4
  ) {
    return failed('provenance');
  }
  const sourceRevisions: SourceRevisionLocator[] = [];
  for (const item of decoded.value.sourceRevisions) {
    const locator = decodeLocator(item);
    if (!locator.ok) return locator;
    sourceRevisions.push(locator.value);
  }
  return {
    ok: true,
    value: {
      author: 'ai',
      provider: 'openrouter',
      providerRequestId: decoded.value.providerRequestId,
      model: LEARNING_MODEL_ALLOWLIST[0],
      requestVersion: LEARNING_API_VERSION,
      promptVersion: decoded.value.promptVersion,
      createdAt: decoded.value.createdAt,
      sourceRevisions,
    },
  };
}

function decodeMessage(
  value: unknown,
  expectedRequestId: string,
  extraKeys: readonly string[],
): ContractDecode<{ requestId: string | null; message: string }> {
  if (!isContractRecord(value)) return failed('shape');
  const extra = extraKeyReason(value, extraKeys);
  if (extra) return failed(extra);
  if (!requestIdMatches(value.requestId, expectedRequestId)) {
    return failed('identity');
  }
  if (
    typeof value.message !== 'string' ||
    !isBoundedRemoteText(value.message, 400)
  ) {
    return failed('bounds');
  }
  if (value.message === 'Planner settlement placeholder.') {
    return failed('shape');
  }
  return {
    ok: true,
    value: {
      requestId: value.requestId === null ? null : expectedRequestId,
      message: value.message,
    },
  };
}

/** Runtime-validate a stored or HTTP planner body. Rejects tutor success and placeholders. */
export function decodePlannerHttpResponse(
  value: unknown,
  expectedRequestId: string,
): ContractDecode<ExplanationPlanHttpResponse> {
  if (!isContractRecord(value) || typeof value.outcome !== 'string') {
    return failed('shape');
  }
  if (value.outcome === 'success') {
    const extra = extraKeyReason(value, [
      'outcome',
      'requestId',
      'plan',
      'provenance',
      'quota',
      'renderReceipt',
    ]);
    if (extra) return failed(extra);
    if (value.requestId !== expectedRequestId) return failed('identity');
    if ('contribution' in value) return failed('shape');
    const plan = decodeExplanationPlan(value.plan);
    if (!plan.ok) return plan;
    const provenance = decodeProvenance(value.provenance);
    if (!provenance.ok) return provenance;
    const quota = decodeQuota(value.quota);
    if (!quota.ok) return quota;
    if (!Object.hasOwn(value, 'renderReceipt')) {
      return {
        ok: true,
        value: {
          outcome: 'success',
          requestId: expectedRequestId,
          plan: plan.value,
          provenance: provenance.value,
          quota: quota.value,
        },
      };
    }
    const receipt = decodePlannerRenderReceipt(
      value.renderReceipt,
      expectedRequestId,
      decodeLocator,
    );
    if (!receipt.ok) return receipt;
    if (
      plan.value.status === 'supported' &&
      receipt.value.family !== plan.value.family
    ) {
      return failed('shape');
    }
    if (
      !provenance.value.sourceRevisions.some(
        (locator) =>
          locator.revisionId === receipt.value.origin.sourceRevisionId,
      ) ||
      !citedSourcesAreAdmitted(plan.value, provenance.value.sourceRevisions)
    ) {
      return failed('origin');
    }
    return {
      ok: true,
      value: {
        outcome: 'success',
        requestId: expectedRequestId,
        plan: plan.value,
        provenance: provenance.value,
        quota: quota.value,
        renderReceipt: receipt.value,
      },
    };
  }
  if (
    value.outcome === 'invalid-request' ||
    value.outcome === 'unsupported' ||
    value.outcome === 'unauthenticated'
  ) {
    const message = decodeMessage(value, expectedRequestId, [
      'outcome',
      'requestId',
      'message',
    ]);
    if (!message.ok) return message;
    return {
      ok: true,
      value: {
        outcome: value.outcome,
        requestId: message.value.requestId,
        message: message.value.message,
      },
    };
  }
  if (value.outcome === 'quota-exceeded') {
    const extra = extraKeyReason(value, [
      'outcome',
      'requestId',
      'message',
      'quota',
    ]);
    if (extra) return failed(extra);
    if (value.requestId !== expectedRequestId) return failed('identity');
    if (
      typeof value.message !== 'string' ||
      !isBoundedRemoteText(value.message, 400)
    ) {
      return failed('bounds');
    }
    const quota = decodeQuota(value.quota);
    if (!quota.ok) return quota;
    return {
      ok: true,
      value: {
        outcome: 'quota-exceeded',
        requestId: expectedRequestId,
        message: value.message,
        quota: quota.value,
      },
    };
  }
  if (value.outcome === 'unavailable') {
    const extra = extraKeyReason(value, [
      'outcome',
      'requestId',
      'message',
      'retryable',
      'accounting',
    ]);
    if (extra) return failed(extra);
    const message = decodeMessage(value, expectedRequestId, [
      'outcome',
      'requestId',
      'message',
      'retryable',
      'accounting',
    ]);
    if (!message.ok) return message;
    if (typeof value.retryable !== 'boolean') return failed('shape');
    if (!includes(ACCOUNTING, value.accounting)) return failed('unsupported');
    return {
      ok: true,
      value: {
        outcome: 'unavailable',
        requestId: message.value.requestId,
        message: message.value.message,
        retryable: value.retryable,
        accounting: value.accounting,
      },
    };
  }
  if (value.outcome === 'cancelled') {
    const extra = extraKeyReason(value, [
      'outcome',
      'requestId',
      'message',
      'retryable',
      'accounting',
    ]);
    if (extra) return failed(extra);
    if (value.requestId !== expectedRequestId) return failed('identity');
    if (
      typeof value.message !== 'string' ||
      !isBoundedRemoteText(value.message, 400)
    ) {
      return failed('bounds');
    }
    if (typeof value.retryable !== 'boolean') return failed('shape');
    if (!includes(CANCEL_ACCOUNTING, value.accounting)) {
      return failed('unsupported');
    }
    return {
      ok: true,
      value: {
        outcome: 'cancelled',
        requestId: expectedRequestId,
        message: value.message,
        retryable: value.retryable,
        accounting: value.accounting,
      },
    };
  }
  return failed('unsupported');
}
