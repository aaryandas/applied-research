import { Effect } from 'effect';
import { decodeExplanationPlan } from './plan-decode.js';
import type { LearningRequest } from '../../contracts/learning-api.js';
import { usdToMicrousd } from '../money.js';
import {
  MAX_OUTPUT_CHARACTERS,
  MAX_OUTPUT_TOKENS,
  MAX_PROVIDER_REQUEST_PRICE_USD,
  MODEL_ADMISSION,
} from '../policy.js';
import { ProviderFailure } from '../provider.js';
import { isRemoteText } from '../text.js';
import { bindPlanToCanonicalSources } from './canonical-citations.js';
import {
  EXPLANATION_PLANNER_JSON_SCHEMA,
  EXPLANATION_PLANNER_SYSTEM_PROMPT,
} from './schema.js';
import type { ExplanationPlannerRequest } from './types.js';
import type { ExplanationPlan } from './plan-decode.js';

/** Admitted OpenRouter route. AR-48 should export this shared policy. */
export const ADMITTED_OPENROUTER_ROUTE = 'google-ai-studio' as const;
/** Supported thinking level. 1024 is a reservation margin, not a request ceiling. */
export const ADMITTED_REASONING_EFFORT = 'low' as const;

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_PROVIDER_RESPONSE_BYTES = 128 * 1024;

export interface PlannerCompletion {
  readonly plan: ExplanationPlan;
  readonly providerRequestId: string;
  readonly actualMicrousd: number;
  readonly model: ExplanationPlannerRequest['model'];
}

export interface ExplanationPlannerProvider {
  readonly complete: (
    request: ExplanationPlannerRequest,
  ) => Effect.Effect<PlannerCompletion, ProviderFailure>;
}

function object(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}

function outputText(value: unknown, maximum: number, field: string): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > maximum ||
    !isRemoteText(value)
  ) {
    throw new Error(`Provider ${field} is invalid.`);
  }
  return value;
}

export function buildPlannerBody(request: ExplanationPlannerRequest): string {
  const maximumPromptPrice = Number(MODEL_ADMISSION.inputUsdPerMillionTokens);
  const maximumCompletionPrice = Number(
    MODEL_ADMISSION.outputUsdPerMillionTokens,
  );
  return JSON.stringify({
    model: request.model,
    messages: [
      { role: 'system', content: EXPLANATION_PLANNER_SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          apiVersion: request.apiVersion,
          requestId: request.requestId,
          operation: request.operation,
        }),
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'explanation_planner',
        strict: true,
        schema: EXPLANATION_PLANNER_JSON_SCHEMA,
      },
    },
    provider: {
      only: [ADMITTED_OPENROUTER_ROUTE],
      allow_fallbacks: false,
      require_parameters: true,
      max_price: {
        prompt: maximumPromptPrice,
        completion: maximumCompletionPrice,
        request: MAX_PROVIDER_REQUEST_PRICE_USD,
      },
    },
    max_tokens: MAX_OUTPUT_TOKENS,
    reasoning: { effort: ADMITTED_REASONING_EFFORT, exclude: true },
    temperature: 0.2,
  });
}

export function plannerAccountingRequest(
  request: ExplanationPlannerRequest,
): LearningRequest {
  return {
    apiVersion: request.apiVersion,
    requestId: request.requestId,
    model: request.model,
    operation: {
      kind: 'explanation-planner',
      question: request.operation.question,
      sources: request.operation.sources,
      learnerContext: request.operation.learnerContext,
    } as unknown as LearningRequest['operation'],
  };
}

async function boundedResponseText(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_PROVIDER_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error('Provider response is too large.');
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(joined);
}

function knownCost(value: unknown): number | null {
  try {
    const response = object(value, 'Provider response is invalid.');
    const usage = object(response.usage, 'Provider usage is invalid.');
    return usdToMicrousd(usage.cost);
  } catch {
    return null;
  }
}

function parsePlannerCompletion(
  value: unknown,
  request: ExplanationPlannerRequest,
): PlannerCompletion {
  const response = object(value, 'Provider response is invalid.');
  const actualMicrousd = knownCost(value);
  if (actualMicrousd === null) throw new Error('Provider usage is missing.');
  if (
    response.model !== request.model ||
    !Array.isArray(response.choices) ||
    response.choices.length !== 1
  ) {
    throw new Error('Provider response envelope is invalid.');
  }
  const choice = object(response.choices[0], 'Provider choice is invalid.');
  const message = object(choice.message, 'Provider message is invalid.');
  if (
    choice.finish_reason !== 'stop' ||
    'tool_calls' in message ||
    typeof message.content !== 'string' ||
    message.content.length > MAX_OUTPUT_CHARACTERS * 2
  ) {
    throw new Error('Provider message is unsupported.');
  }
  let content: unknown;
  try {
    content = JSON.parse(message.content);
  } catch {
    throw new Error('Provider content is not valid JSON.');
  }
  const plan = decodeExplanationPlan(content);
  if (!plan.ok) {
    throw new Error('Provider planner output is invalid.');
  }
  return {
    plan: bindPlanToCanonicalSources(plan.value, request.operation.sources),
    providerRequestId: outputText(response.id, 200, 'request identifier'),
    actualMicrousd,
    model: request.model,
  };
}

function providerFailure(error: unknown): ProviderFailure {
  if (error instanceof ProviderFailure) return error;
  return new ProviderFailure({
    message: 'The AI provider response could not be validated.',
    charge: { kind: 'unknown' },
    cancelled: false,
    cause: error,
  });
}

function httpFailure(status: number): ProviderFailure {
  const knownNoCharge = status >= 400 && status < 500 && status !== 408;
  return new ProviderFailure({
    message: 'The AI provider is unavailable.',
    charge: knownNoCharge ? { kind: 'none' } : { kind: 'unknown' },
    cancelled: false,
  });
}

export function makeExplanationPlannerProvider(options: {
  apiKey: string;
  request?: typeof fetch;
}): ExplanationPlannerProvider {
  const request = options.request ?? fetch;
  return {
    complete: (plannerRequest) =>
      Effect.tryPromise({
        try: async (signal) => {
          const response = await request(OPENROUTER_URL, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${options.apiKey}`,
              'Content-Type': 'application/json',
              'X-OpenRouter-Title': 'Applied Research',
            },
            body: buildPlannerBody(plannerRequest),
            signal,
          });
          if (!response.ok) throw httpFailure(response.status);
          const text = await boundedResponseText(response);
          let value: unknown;
          try {
            value = JSON.parse(text);
          } catch (cause) {
            throw new ProviderFailure({
              message: 'The AI provider response could not be validated.',
              charge: { kind: 'unknown' },
              cancelled: false,
              cause,
            });
          }
          try {
            return parsePlannerCompletion(value, plannerRequest);
          } catch (cause) {
            const cost = knownCost(value);
            throw new ProviderFailure({
              message: 'The AI provider response could not be validated.',
              charge:
                cost === null
                  ? { kind: 'unknown' }
                  : { kind: 'known', actualMicrousd: cost },
              cancelled: false,
              cause,
            });
          }
        },
        catch: providerFailure,
      }),
  };
}
