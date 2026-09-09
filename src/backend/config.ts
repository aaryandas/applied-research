import { Data } from 'effect';
import {
  LEARNING_MODEL_ALLOWLIST,
  type LearningModel,
} from '../contracts/learning-api.js';
import {
  API_ORIGIN,
  EMBEDDING_EVAL_LIMIT_MICROUSD,
  MAX_CONCURRENT_PROVIDER_REQUESTS,
  MAX_PROVIDER_DURATION_MS,
  MONTHLY_LIMIT_MICROUSD,
  TURBOPUFFER_OREGON_REGIONS,
  type TurbopufferRegion,
} from './policy.js';
import { OPENALEX_KEYWORD_SEARCH_MAXIMUM_MICROUSD } from './sourcing/openalex/budget.js';

export class ConfigurationError extends Data.TaggedError('ConfigurationError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export interface BackendConfig {
  port: number;
  databaseUrl: string;
  betterAuthUrl: string;
  betterAuthSecret: string;
  githubClientId: string;
  githubClientSecret: string;
  openRouterApiKey: string;
  aiEnabled: boolean;
  monthlyLimitMicrousd: number;
  model: LearningModel;
  providerTimeoutMs: number;
  providerConcurrency: number;
  openAlexApiKey: string | null;
  openAlexMonthlyLimitMicrousd: number | null;
  turbopufferApiKey: string | null;
  turbopufferRegion: TurbopufferRegion | null;
  sourceIndexLive: boolean;
  embeddingEvalLimitMicrousd: number;
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (!value) throw new ConfigurationError({ message: `${name} is required.` });
  return value;
}

function exactBoolean(value: string | undefined, name: string): boolean {
  if (value === 'true') return true;
  if (value === 'false' || value === undefined) return false;
  throw new ConfigurationError({ message: `${name} must be true or false.` });
}

function port(value: string | undefined): number {
  const parsed = Number(value ?? '3000');
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new ConfigurationError({ message: 'PORT must be a valid TCP port.' });
  }
  return parsed;
}

function usdMicrousd(value: string, name: string): number {
  if (!/^\d+(?:\.\d{1,6})?$/.test(value)) {
    throw new ConfigurationError({
      message: `${name} must be a decimal amount.`,
    });
  }
  const [whole = '0', fraction = ''] = value.split('.');
  return Number(whole) * 1_000_000 + Number(fraction.padEnd(6, '0'));
}

function optionalSecret(
  environment: NodeJS.ProcessEnv,
  name: string,
): string | null {
  const value = environment[name];
  if (value === undefined || value === '') return null;
  return value;
}

function turbopufferRegion(
  value: string | undefined,
): TurbopufferRegion | null {
  if (value === undefined || value === '') return null;
  if (!(TURBOPUFFER_OREGON_REGIONS as readonly string[]).includes(value)) {
    throw new ConfigurationError({
      message:
        'TURBOPUFFER_REGION must be an approved Oregon region (aws-us-west-2 or gcp-us-west1).',
    });
  }
  return value as TurbopufferRegion;
}

function embeddingEvalLimit(value: string | undefined): number {
  if (value === undefined) return EMBEDDING_EVAL_LIMIT_MICROUSD;
  const microusd = usdMicrousd(value, 'EMBEDDING_EVAL_LIMIT_USD');
  if (microusd !== EMBEDDING_EVAL_LIMIT_MICROUSD) {
    throw new ConfigurationError({
      message:
        'EMBEDDING_EVAL_LIMIT_USD must remain at the approved value of 0.25.',
    });
  }
  return microusd;
}

function openAlexMonthlyLimit(value: string | undefined): number | null {
  if (value === undefined || value === '') return null;
  const microusd = usdMicrousd(value, 'OPENALEX_MONTHLY_LIMIT_USD');
  if (microusd < OPENALEX_KEYWORD_SEARCH_MAXIMUM_MICROUSD) {
    throw new ConfigurationError({
      message:
        'OPENALEX_MONTHLY_LIMIT_USD is below the verified per-search ceiling; OpenAlex stays disabled.',
    });
  }
  return microusd;
}

function monthlyLimit(value: string | undefined): number {
  if (value === undefined) return MONTHLY_LIMIT_MICROUSD;
  const microusd = usdMicrousd(value, 'AI_MONTHLY_LIMIT_USD');
  if (microusd !== MONTHLY_LIMIT_MICROUSD) {
    throw new ConfigurationError({
      message: 'AI_MONTHLY_LIMIT_USD must remain at the approved value of 20.',
    });
  }
  return microusd;
}

function isLearningModel(value: string): value is LearningModel {
  const approvedModels: readonly string[] = LEARNING_MODEL_ALLOWLIST;
  return approvedModels.includes(value);
}

function model(value: string | undefined): LearningModel {
  const selected = value ?? LEARNING_MODEL_ALLOWLIST[0];
  if (!isLearningModel(selected)) {
    throw new ConfigurationError({
      message: 'AI_MODEL is not in the approved allowlist.',
    });
  }
  return selected;
}

function validateBackendUrl(
  value: string,
  environment: NodeJS.ProcessEnv,
): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch (cause) {
    throw new ConfigurationError({
      message: 'BETTER_AUTH_URL is invalid.',
      cause,
    });
  }
  const permitsLocalDevelopment =
    environment.NODE_ENV === 'test' || environment.NODE_ENV === 'development';
  if (parsed.origin !== API_ORIGIN && !permitsLocalDevelopment) {
    throw new ConfigurationError({
      message: `BETTER_AUTH_URL must be ${API_ORIGIN}.`,
    });
  }
  if (parsed.username || parsed.password || parsed.pathname !== '/') {
    throw new ConfigurationError({ message: 'BETTER_AUTH_URL is invalid.' });
  }
  return parsed.origin;
}

function databaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch (cause) {
    throw new ConfigurationError({
      message: 'DATABASE_URL is invalid.',
      cause,
    });
  }
  if (
    (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') ||
    !parsed.hostname ||
    parsed.pathname === '/'
  ) {
    throw new ConfigurationError({ message: 'DATABASE_URL is invalid.' });
  }
  return value;
}

export function loadDatabaseUrl(environment: NodeJS.ProcessEnv): string {
  return databaseUrl(required(environment, 'DATABASE_URL'));
}

export function loadBackendConfig(
  environment: NodeJS.ProcessEnv,
): BackendConfig {
  const betterAuthSecret = required(environment, 'BETTER_AUTH_SECRET');
  if (betterAuthSecret.length < 32) {
    throw new ConfigurationError({
      message: 'BETTER_AUTH_SECRET must contain at least 32 characters.',
    });
  }
  const openAlexApiKey = optionalSecret(environment, 'OPENALEX_API_KEY');
  const openAlexMonthlyLimitMicrousd = openAlexMonthlyLimit(
    environment.OPENALEX_MONTHLY_LIMIT_USD,
  );
  if ((openAlexApiKey === null) !== (openAlexMonthlyLimitMicrousd === null)) {
    throw new ConfigurationError({
      message:
        'OPENALEX_API_KEY and OPENALEX_MONTHLY_LIMIT_USD must be configured together. Missing allowance fails closed.',
    });
  }
  const sourceIndexLive = exactBoolean(
    environment.SOURCE_INDEX_LIVE,
    'SOURCE_INDEX_LIVE',
  );
  const turbopufferApiKey = optionalSecret(environment, 'TURBOPUFFER_API_KEY');
  const region = turbopufferRegion(environment.TURBOPUFFER_REGION);
  const embeddingEvalLimitMicrousd = embeddingEvalLimit(
    environment.EMBEDDING_EVAL_LIMIT_USD,
  );
  if (sourceIndexLive) {
    if (!turbopufferApiKey || !region) {
      throw new ConfigurationError({
        message:
          'SOURCE_INDEX_LIVE requires TURBOPUFFER_API_KEY and an approved Oregon TURBOPUFFER_REGION.',
      });
    }
    if (embeddingEvalLimitMicrousd <= 0) {
      throw new ConfigurationError({
        message:
          'Live source indexing fails closed without an embedding evaluation budget.',
      });
    }
  }
  return {
    port: port(environment.PORT),
    databaseUrl: loadDatabaseUrl(environment),
    betterAuthUrl: validateBackendUrl(
      required(environment, 'BETTER_AUTH_URL'),
      environment,
    ),
    betterAuthSecret,
    githubClientId: required(environment, 'GITHUB_CLIENT_ID'),
    githubClientSecret: required(environment, 'GITHUB_CLIENT_SECRET'),
    openRouterApiKey: required(environment, 'OPENROUTER_API_KEY'),
    aiEnabled: exactBoolean(environment.AI_ENABLED, 'AI_ENABLED'),
    monthlyLimitMicrousd: monthlyLimit(environment.AI_MONTHLY_LIMIT_USD),
    model: model(environment.AI_MODEL),
    providerTimeoutMs: MAX_PROVIDER_DURATION_MS,
    providerConcurrency: MAX_CONCURRENT_PROVIDER_REQUESTS,
    openAlexApiKey,
    openAlexMonthlyLimitMicrousd,
    turbopufferApiKey: sourceIndexLive ? turbopufferApiKey : null,
    turbopufferRegion: sourceIndexLive ? region : null,
    sourceIndexLive,
    embeddingEvalLimitMicrousd,
  };
}
