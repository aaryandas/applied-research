import { describe, expect, it } from 'vitest';
import { ConfigurationError, loadBackendConfig } from './config.js';
import { API_ORIGIN, MONTHLY_LIMIT_MICROUSD } from './policy.js';

const validEnvironment: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgresql://localhost/test',
  BETTER_AUTH_URL: API_ORIGIN,
  BETTER_AUTH_SECRET: 's'.repeat(32),
  GITHUB_CLIENT_ID: 'client',
  GITHUB_CLIENT_SECRET: 'github-secret',
  OPENROUTER_API_KEY: 'provider-secret',
  AI_ENABLED: 'false',
  AI_MONTHLY_LIMIT_USD: '20',
};

describe('backend configuration', () => {
  it('loads the approved defaults without exposing secret values', () => {
    const config = loadBackendConfig(validEnvironment);
    expect(config).toMatchObject({
      port: 3000,
      betterAuthUrl: API_ORIGIN,
      aiEnabled: false,
      monthlyLimitMicrousd: MONTHLY_LIMIT_MICROUSD,
      model: 'google/gemini-3.8-flash',
      sourceIndexLive: false,
      turbopufferApiKey: null,
      openAlexApiKey: null,
    });
  });

  it.each([
    ['PORT', '0'],
    ['PORT', '3.5'],
    ['AI_ENABLED', 'yes'],
    ['AI_MONTHLY_LIMIT_USD', '20.000001'],
    ['AI_MONTHLY_LIMIT_USD', '21'],
    ['AI_MODEL', 'unapproved/model'],
    ['SOURCE_INDEX_LIVE', 'yes'],
    ['TURBOPUFFER_REGION', 'gcp-us-central1'],
    ['EMBEDDING_EVAL_LIMIT_USD', '1'],
  ])('rejects unsafe %s configuration', (name, value) => {
    expect(() =>
      loadBackendConfig({ ...validEnvironment, [name]: value }),
    ).toThrow(ConfigurationError);
  });

  it('rejects missing or weak secrets and non-owned production origins', () => {
    expect(() =>
      loadBackendConfig({ ...validEnvironment, DATABASE_URL: undefined }),
    ).toThrow('DATABASE_URL is required');
    expect(() =>
      loadBackendConfig({ ...validEnvironment, BETTER_AUTH_SECRET: 'short' }),
    ).toThrow('at least 32');
    expect(() =>
      loadBackendConfig({ ...validEnvironment, DATABASE_URL: 'not-a-url' }),
    ).toThrow(ConfigurationError);
    expect(() =>
      loadBackendConfig({ ...validEnvironment, DATABASE_URL: 'https://db/x' }),
    ).toThrow(ConfigurationError);
    expect(() =>
      loadBackendConfig({
        ...validEnvironment,
        BETTER_AUTH_URL: 'https://example.com',
      }),
    ).toThrow(API_ORIGIN);
    expect(() =>
      loadBackendConfig({ ...validEnvironment, BETTER_AUTH_URL: 'not-a-url' }),
    ).toThrow(ConfigurationError);
  });

  it('permits an explicit localhost origin only in test or development', () => {
    expect(
      loadBackendConfig({
        ...validEnvironment,
        NODE_ENV: 'test',
        BETTER_AUTH_URL: 'http://127.0.0.1:3000',
      }).betterAuthUrl,
    ).toBe('http://127.0.0.1:3000');
  });

  it('fails closed when OpenAlex key and monthly limit are not paired', () => {
    expect(() =>
      loadBackendConfig({
        ...validEnvironment,
        OPENALEX_API_KEY: 'openalex-key',
      }),
    ).toThrow('together');
    expect(() =>
      loadBackendConfig({
        ...validEnvironment,
        OPENALEX_MONTHLY_LIMIT_USD: '1',
      }),
    ).toThrow('together');
  });

  it('requires Oregon turbopuffer configuration before enabling live indexing', () => {
    expect(() =>
      loadBackendConfig({
        ...validEnvironment,
        SOURCE_INDEX_LIVE: 'true',
      }),
    ).toThrow('TURBOPUFFER_API_KEY');
    expect(
      loadBackendConfig({
        ...validEnvironment,
        SOURCE_INDEX_LIVE: 'true',
        TURBOPUFFER_API_KEY: 'tpuf-key',
        TURBOPUFFER_REGION: 'aws-us-west-2',
      }).turbopufferRegion,
    ).toBe('aws-us-west-2');
  });
});
