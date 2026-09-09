import { isAllowedTurbopufferRegion } from './live-config.js';
import { IndexOperationError } from './results.js';
import type { TurbopufferIndexOptions, VersionedVector } from './types.js';

export interface ResolvedIndexTransport {
  readonly request: typeof fetch;
  readonly apiKey: string;
  readonly embedQuery: (
    query: string,
    signal: AbortSignal,
  ) => Promise<VersionedVector>;
}

export function resolveIndexTransport(
  options: TurbopufferIndexOptions,
): ResolvedIndexTransport {
  if (options.fixture !== undefined && options.live !== undefined) {
    throw new IndexOperationError('invalid-input');
  }
  if (options.fixture) {
    return {
      request: options.fixture.request,
      apiKey: 'fixture-only',
      embedQuery: options.fixture.embedQuery,
    };
  }
  if (options.live) {
    if (
      options.live.apiKey.length === 0 ||
      !isAllowedTurbopufferRegion(options.live.region)
    ) {
      throw new IndexOperationError('invalid-input');
    }
    return {
      request: options.live.request,
      apiKey: options.live.apiKey,
      embedQuery: options.live.embedQuery,
    };
  }
  throw new IndexOperationError('live-configuration-required');
}
