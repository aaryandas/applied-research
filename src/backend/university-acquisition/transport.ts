import { GuardedHttpsClient } from '../sourcing/acquisition/guarded-http.js';
import type {
  UniversityByteFetchResult,
  UniversityByteTransport,
} from './types.js';

export function createGuardedUniversityTransport(
  http: GuardedHttpsClient,
): UniversityByteTransport {
  return {
    async fetch(url, signal): Promise<UniversityByteFetchResult> {
      const fetched = await http.fetch(url, signal);
      if (fetched.outcome === 'success') {
        return {
          outcome: 'success',
          requestedUrl: fetched.requestedUrl,
          acquiredUrl: fetched.acquiredUrl,
          mediaType: fetched.mediaType,
          bytes: fetched.bytes,
          redirectCount: fetched.redirectCount,
        };
      }
      return fetched;
    },
  };
}
