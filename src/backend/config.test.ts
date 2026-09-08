import { describe, expect, it } from 'vitest';
import {
  ConfigurationError,
  loadBackendConfig,
  loadDatabaseUrl,
} from './config.js';
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
    });
  });

  it.each([
    ['PORT', '0'],
    ['PORT', '3.5'],
    ['AI_ENABLED', 'yes'],
    ['AI_MONTHLY_LIMIT_USD', '20.000001'],
    ['AI_MONTHLY_LIMIT_USD', '21'],
    ['AI_MODEL', 'unapproved/model'],
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

  it('loads migration configuration without reading unrelated services', () => {
    expect(
      loadDatabaseUrl({ DATABASE_URL: validEnvironment.DATABASE_URL }),
    ).toBe(validEnvironment.DATABASE_URL);
  });
});
