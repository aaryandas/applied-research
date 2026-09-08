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
export const MAX_SOURCE_CHARACTERS = 48_000;
export const MAX_OUTPUT_CHARACTERS = 24_000;
export const MAX_OUTPUT_TOKENS = 2_048;
export const MAX_REASONING_TOKENS = 1_024;
export const MAX_PROVIDER_DURATION_MS = 45_000;
export const MAX_CONCURRENT_PROVIDER_REQUESTS = 8;
export const MAX_IN_FLIGHT_REQUESTS_PER_ACCOUNT = 2;
export const MAX_PROVIDER_REQUEST_PRICE_USD = 0;
export const PROMPT_VERSION = 'learning-v1-2026-09-08';

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
