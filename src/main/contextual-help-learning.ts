import {
  LEARNING_API_VERSION,
  LEARNING_MODEL_ALLOWLIST,
  type AccountingDisposition,
  type AiProvenance,
  type LearningResponse,
  type LearningSuccess,
  type MonthlyQuota,
  type SourceCitation,
  type SourceRevisionInput,
  type TutorContribution,
} from '../contracts/learning-api';
import {
  decodeAiProvenance,
  isExactExcerptMapping,
} from '../contracts/contextual-help';
import {
  decodeExplanationPlan,
  type ExplanationPlan,
} from '../contracts/explanation-artifacts';
import {
  decodeExactRecord,
  extraKeyReason,
  failed,
  isBoundedRemoteText,
  isContractGeneration,
  isContractRecord,
  isDenseArray,
  type ContractDecode,
} from '../contracts/contextual-contract-guards';

const ANSWER_LIMIT = 24_000;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,99}$/;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;
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

function includes<T>(values: readonly T[], value: unknown): value is T {
  const candidates: readonly unknown[] = values;
  return candidates.includes(value);
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
  const limitMicrousd = decoded.value.limitMicrousd;
  const committedMicrousd = decoded.value.committedMicrousd;
  const reservedMicrousd = decoded.value.reservedMicrousd;
  const remainingMicrousd = decoded.value.remainingMicrousd;
  if (
    !isContractGeneration(limitMicrousd) ||
    !isContractGeneration(committedMicrousd) ||
    !isContractGeneration(reservedMicrousd) ||
    !isContractGeneration(remainingMicrousd)
  ) {
    return failed('bounds');
  }
  return {
    ok: true,
    value: {
      month: decoded.value.month,
      limitMicrousd,
      committedMicrousd,
      reservedMicrousd,
      remainingMicrousd,
    },
  };
}

function decodeTutorCitation(
  value: unknown,
  sources: readonly SourceRevisionInput[],
): ContractDecode<SourceCitation> {
  const decoded = decodeExactRecord(value, [
    'sourceId',
    'revisionId',
    'start',
    'end',
    'quote',
  ]);
  if (!decoded.ok) return decoded;
  const source = sources.find(
    (candidate) =>
      candidate.sourceId === decoded.value.sourceId &&
      candidate.revisionId === decoded.value.revisionId,
  );
  const start = decoded.value.start;
  const end = decoded.value.end;
  const quote = decoded.value.quote;
  if (
    !source ||
    typeof start !== 'number' ||
    typeof end !== 'number' ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    typeof quote !== 'string' ||
    !isExactExcerptMapping(source.canonicalText, start, end, quote)
  ) {
    return failed('origin');
  }
  return {
    ok: true,
    value: {
      sourceId: source.sourceId,
      revisionId: source.revisionId,
      start,
      end,
      quote,
    },
  };
}

function decodeTutorContribution(
  value: unknown,
  sources: readonly SourceRevisionInput[],
): ContractDecode<TutorContribution> {
  const decoded = decodeExactRecord(value, [
    'kind',
    'body',
    'nextAction',
    'citations',
  ]);
  if (!decoded.ok) return decoded;
  if (decoded.value.kind !== 'source-grounded-tutor') return failed('shape');
  if (
    !isBoundedRemoteText(decoded.value.body, ANSWER_LIMIT) ||
    !isBoundedRemoteText(decoded.value.nextAction, 1_000)
  ) {
    return failed('bounds');
  }
  if (
    !isDenseArray(decoded.value.citations) ||
    decoded.value.citations.length < 1 ||
    decoded.value.citations.length > 12
  ) {
    return failed('bounds');
  }
  const citations: SourceCitation[] = [];
  for (const item of decoded.value.citations) {
    const citation = decodeTutorCitation(item, sources);
    if (!citation.ok) return citation;
    citations.push(citation.value);
  }
  return {
    ok: true,
    value: {
      kind: 'source-grounded-tutor',
      body: decoded.value.body,
      nextAction: decoded.value.nextAction,
      citations,
    },
  };
}

function requestIdMatches(
  value: unknown,
  expected: string,
): value is string | null {
  if (value === null) return true;
  return value === expected && IDENTIFIER_PATTERN.test(expected);
}

export type TutorLearningResponse =
  | (Omit<LearningSuccess, 'contribution'> & {
      contribution: TutorContribution;
    })
  | Exclude<LearningResponse, LearningSuccess>;

export function decodeTutorLearningResponse(
  value: unknown,
  expectedRequestId: string,
  sources: readonly SourceRevisionInput[],
): ContractDecode<TutorLearningResponse> {
  if (!isContractRecord(value) || typeof value.outcome !== 'string') {
    return failed('shape');
  }
  if (value.outcome === 'success') {
    const decoded = decodeExactRecord(value, [
      'outcome',
      'requestId',
      'contribution',
      'provenance',
      'quota',
    ]);
    if (!decoded.ok) return decoded;
    if (decoded.value.requestId !== expectedRequestId)
      return failed('identity');
    const contribution = decodeTutorContribution(
      decoded.value.contribution,
      sources,
    );
    if (!contribution.ok) return contribution;
    const provenance = decodeAiProvenance(decoded.value.provenance);
    if (!provenance.ok) return provenance;
    if (
      provenance.value.model !== LEARNING_MODEL_ALLOWLIST[0] ||
      provenance.value.requestVersion !== LEARNING_API_VERSION
    ) {
      return failed('provenance');
    }
    const quota = decodeQuota(decoded.value.quota);
    if (!quota.ok) return quota;
    return {
      ok: true,
      value: {
        outcome: 'success',
        requestId: expectedRequestId,
        contribution: contribution.value,
        provenance: provenance.value,
        quota: quota.value,
      },
    };
  }
  if (
    value.outcome === 'invalid-request' ||
    value.outcome === 'unsupported' ||
    value.outcome === 'unauthenticated'
  ) {
    const extra = extraKeyReason(value, ['outcome', 'requestId', 'message']);
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
    return {
      ok: true,
      value: {
        outcome: value.outcome,
        requestId: value.requestId,
        message: value.message,
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
    if (!requestIdMatches(value.requestId, expectedRequestId)) {
      return failed('identity');
    }
    if (
      typeof value.message !== 'string' ||
      !isBoundedRemoteText(value.message, 400) ||
      typeof value.retryable !== 'boolean' ||
      !includes(ACCOUNTING, value.accounting)
    ) {
      return failed('shape');
    }
    return {
      ok: true,
      value: {
        outcome: 'unavailable',
        requestId: value.requestId,
        message: value.message,
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
      !isBoundedRemoteText(value.message, 400) ||
      typeof value.retryable !== 'boolean' ||
      !includes(CANCEL_ACCOUNTING, value.accounting)
    ) {
      return failed('shape');
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

export interface ExplanationPlanSuccess {
  outcome: 'success';
  requestId: string;
  plan: ExplanationPlan;
  provenance: AiProvenance;
  quota: MonthlyQuota;
}

export type ExplanationPlanResponse =
  ExplanationPlanSuccess | Exclude<LearningResponse, LearningSuccess>;

export function decodeExplanationPlanResponse(
  value: unknown,
  expectedRequestId: string,
): ContractDecode<ExplanationPlanResponse> {
  if (!isContractRecord(value) || typeof value.outcome !== 'string') {
    return failed('shape');
  }
  if (value.outcome === 'success') {
    const decoded = decodeExactRecord(value, [
      'outcome',
      'requestId',
      'plan',
      'provenance',
      'quota',
    ]);
    if (!decoded.ok) return decoded;
    if (decoded.value.requestId !== expectedRequestId)
      return failed('identity');
    const plan = decodeExplanationPlan(decoded.value.plan);
    if (!plan.ok) return plan;
    const provenance = decodeAiProvenance(decoded.value.provenance);
    if (!provenance.ok) return provenance;
    if (
      provenance.value.model !== LEARNING_MODEL_ALLOWLIST[0] ||
      provenance.value.requestVersion !== LEARNING_API_VERSION
    ) {
      return failed('provenance');
    }
    const quota = decodeQuota(decoded.value.quota);
    if (!quota.ok) return quota;
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
  const failure = decodeTutorLearningResponse(value, expectedRequestId, []);
  if (!failure.ok) return failure;
  if (failure.value.outcome === 'success') return failed('shape');
  return { ok: true, value: failure.value };
}
