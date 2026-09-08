import { Data } from 'effect';
import { LEARNING_MODEL_ALLOWLIST } from '../contracts/learning-api.js';
import type { LearningModel } from '../contracts/learning-api.js';
import {
  API_ORIGIN,
  MAX_CONCURRENT_PROVIDER_REQUESTS,
  MAX_PROVIDER_DURATION_MS,
  MONTHLY_LIMIT_MICROUSD,
} from './policy.js';

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

function monthlyLimit(value: string | undefined): number {
  if (value === undefined) return MONTHLY_LIMIT_MICROUSD;
  if (!/^\d+(?:\.\d{1,6})?$/.test(value)) {
    throw new ConfigurationError({
      message: 'AI_MONTHLY_LIMIT_USD must be a decimal amount.',
    });
  }
  const [whole = '0', fraction = ''] = value.split('.');
  const microusd = Number(whole) * 1_000_000 + Number(fraction.padEnd(6, '0'));
  if (microusd !== MONTHLY_LIMIT_MICROUSD) {
    throw new ConfigurationError({
      message: 'AI_MONTHLY_LIMIT_USD must remain at the approved value of 20.',
    });
  }
  return microusd;
}

function model(value: string | undefined): LearningModel {
  const selected = value ?? LEARNING_MODEL_ALLOWLIST[0];
  if (!LEARNING_MODEL_ALLOWLIST.some((candidate) => candidate === selected)) {
    throw new ConfigurationError({
      message: 'AI_MODEL is not in the approved allowlist.',
    });
  }
  return selected as LearningModel;
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
  };
}
