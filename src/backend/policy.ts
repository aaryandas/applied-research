import type { LearningModel } from '../contracts/learning-api.js';

export const API_ORIGIN = 'https://api-production-e7aa.up.railway.app';
export const DESKTOP_SCHEME = 'com.aaryandas.appliedresearch';
export const DESKTOP_TRUSTED_ORIGIN = `${DESKTOP_SCHEME}:/`;
export const DESKTOP_CALLBACK = `${DESKTOP_SCHEME}://auth/callback`;
export const ELECTRON_AUTH_CALLBACK_PATH = '/auth/electron/callback';
export const ELECTRON_AUTH_CALLBACK_SCRIPT_PATH = '/auth/electron/callback.js';
export const ELECTRON_AUTH_CALLBACK_URL = `${API_ORIGIN}${ELECTRON_AUTH_CALLBACK_PATH}`;
export const GITHUB_CALLBACK = `${API_ORIGIN}/api/auth/callback/github`;

export const SESSION_EXPIRES_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_UPDATE_SECONDS = 24 * 60 * 60;
export const MONTHLY_LIMIT_MICROUSD = 20_000_000;
export const MAX_REQUEST_BYTES = 64 * 1024;
export const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
export const MAX_SOURCE_CHARACTERS = 48_000;
export const SOURCE_ROUTE_TIMEOUT_MS = 30_000;
export const SOURCED_ROUTE_TIMEOUT_MS = 230_000;
export const EMBEDDING_PROVIDER = 'openrouter';
/** OpenRouter request model id. Not a valid response `model` value. */
export const EMBEDDING_MODEL = 'qwen/qwen3-embedding-8b';
/**
 * Exact DeepInfra/Qwen upstream id returned by OpenRouter. The only reviewed
 * response alias for `EMBEDDING_MODEL`; arbitrary aliases and truncation are
 * forbidden.
 */
export const EMBEDDING_UPSTREAM_MODEL = 'Qwen/Qwen3-Embedding-8B';
export const EMBEDDING_PROVIDER_ROUTE = 'deepinfra';
export const EMBEDDING_DIMENSIONS = 1024;
export const EMBEDDING_MODEL_VERSION = 'qwen3-embedding-8b-1024-v1';
export const EMBEDDING_PRICE_USD_PER_MILLION = '0.01';
export const EMBEDDING_PRICING_VERIFIED_AT = '2026-09-09';
export const EMBEDDING_EVAL_LIMIT_MICROUSD = 250_000;
export const EMBEDDING_EVAL_ALLOWANCE_ID =
  'ar48-initial-embedding-evaluation-2026-09-09';
export const EMBEDDING_EVAL_PRIOR_OPERATION_IDS = [
  'fba2defc-8bdf-4482-a779-15b7e8359449',
  'e4dec66c-5cdc-47c4-84c8-bede89b7db18',
] as const;
export const EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD = 4;
export const EMBEDDING_EVAL_REMAINING_MICROUSD =
  EMBEDDING_EVAL_LIMIT_MICROUSD - EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD;
export const EMBEDDING_QUERY_INSTRUCTION =
  'Instruct: Given a learning or research query, retrieve exact educational passages that support the query\nQuery:';
/** Passage text is embedded without an Instruct prefix (asymmetric retrieval). */
export const EMBEDDING_DOCUMENT_INSTRUCTION = '';
export const SOURCE_INDEX_SCHEMA_VERSION = 'passage-v1';
export const SOURCE_INDEX_CORPUS_VERSION = 'starter-v1';
export const TURBOPUFFER_OREGON_REGIONS = [
  'gcp-us-west1',
  'aws-us-west-2',
] as const;
export type TurbopufferRegion = (typeof TURBOPUFFER_OREGON_REGIONS)[number];
export const TURBOPUFFER_FOUNDER_REGION: TurbopufferRegion = 'aws-us-west-2';
export const MAX_EMBEDDING_BATCH = 32;
export const MAX_EMBEDDING_INPUT_CHARACTERS = 8_000;
export const MAX_OUTPUT_CHARACTERS = 24_000;
/**
 * Top-level OpenRouter `max_tokens`. Combined reasoning + visible output cap
 * for the approved Gemini 3.8 Flash route, not a visible-only ceiling.
 */
export const MAX_OUTPUT_TOKENS = 2_048;
/**
 * Conservative monetary reservation margin used with `MAX_OUTPUT_TOKENS`.
 * Not an independent verified thinking ceiling; do not treat sample usage as
 * proof of a lower output bound.
 */
export const MAX_REASONING_TOKENS = 1_024;
export const COMBINED_OUTPUT_TOKEN_CAP = MAX_OUTPUT_TOKENS;
export const PROVIDER_ROUTE_ONLY = ['google-ai-studio'] as const;
export const GENERATION_EVAL_LIMIT_MICROUSD = 2_000_000;
export const GENERATION_EVAL_DISPATCH_LIMIT = 10;
export const GENERATION_EVAL_ALLOWANCE_ID =
  'ar48-initial-generation-evaluation-2026-09-09';
export const GENERATION_EVAL_PRIOR_SETTLED_MICROUSD = 0;
export const GENERATION_EVAL_PRIOR_DISPATCHES = 0;
export const MAX_PROVIDER_DURATION_MS = 45_000;
export const MAX_CONCURRENT_PROVIDER_REQUESTS = 8;
export const MAX_IN_FLIGHT_REQUESTS_PER_ACCOUNT = 2;
export const MAX_PROVIDER_REQUEST_PRICE_USD = 0;
export const PROMPT_VERSION = 'learning-v2-2026-09-09';

export interface ModelAdmission {
  model: LearningModel;
  inputUsdPerMillionTokens: string;
  outputUsdPerMillionTokens: string;
  webSearchUsdPerThousandCalls: string;
  supportsStructuredOutputs: boolean;
  pricingVerifiedAt: string;
  enabledFeatures: readonly ['structured-output'];
}

export const MODEL_ADMISSION: ModelAdmission = {
  model: 'google/gemini-3.8-flash',
  inputUsdPerMillionTokens: '0.75',
  outputUsdPerMillionTokens: '3.75',
  webSearchUsdPerThousandCalls: '14.00',
  supportsStructuredOutputs: true,
  pricingVerifiedAt: '2026-09-08',
  enabledFeatures: ['structured-output'],
};
