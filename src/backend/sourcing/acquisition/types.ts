import type {
  AcquireCanonicalSourceRequest,
  AcquiredSource,
  MetadataOnlySource,
  PassageLocator,
  SourceRevisionIdentity,
} from '../../../contracts/sourcing.js';

export const ACQUISITION_CANONICALIZATION_VERSION = 'canonical-text-v1';
export const PASSAGE_SEGMENTATION_VERSION = 'section-passages-v1';

export const ACQUISITION_PUBLIC_MESSAGES = {
  cancelled: 'The source acquisition was cancelled.',
  invalidSource: 'The source acquisition request is invalid.',
  malformedContent: 'The source content is malformed.',
  notPermitted: 'Source acquisition is not permitted.',
  timedOut: 'The source acquisition timed out.',
  unavailable: 'The source could not be acquired.',
  unsupported: 'This source format is not supported yet.',
} as const;

export interface SourcePassage {
  passageId: string;
  sourceVersion: SourceRevisionIdentity;
  locator: PassageLocator;
  sectionPath: readonly string[];
  segmentationVersion: typeof PASSAGE_SEGMENTATION_VERSION;
}

export interface AcquisitionReceipt {
  requestedUrl: string;
  acquiredUrl: string;
  mediaType: 'text/plain' | 'text/html';
  sourceBytes: number;
  sourceBytesSha256: string;
  redirectCount: number;
}

export type AcquisitionAdapterResult =
  | {
      outcome: 'success';
      requestId: string;
      source: AcquiredSource;
      passages: readonly SourcePassage[];
      receipt: AcquisitionReceipt;
    }
  | {
      outcome: 'not-permitted';
      requestId: string;
      decision: 'forbidden' | 'unknown';
      message: typeof ACQUISITION_PUBLIC_MESSAGES.notPermitted;
    }
  | {
      outcome: 'unsupported';
      requestId: string;
      coverage: 'none' | 'partial';
      mediaType: string | null;
      message: typeof ACQUISITION_PUBLIC_MESSAGES.unsupported;
    }
  | {
      outcome: 'invalid-source';
      requestId: string | null;
      message: typeof ACQUISITION_PUBLIC_MESSAGES.invalidSource;
    }
  | {
      outcome: 'malformed-content';
      requestId: string;
      message: typeof ACQUISITION_PUBLIC_MESSAGES.malformedContent;
    }
  | {
      outcome: 'cancelled';
      requestId: string;
      message: typeof ACQUISITION_PUBLIC_MESSAGES.cancelled;
    }
  | {
      outcome: 'timed-out';
      requestId: string;
      message: typeof ACQUISITION_PUBLIC_MESSAGES.timedOut;
    }
  | {
      outcome: 'unavailable';
      requestId: string;
      retryable: false;
      message: typeof ACQUISITION_PUBLIC_MESSAGES.unavailable;
    };

export interface AcquisitionSourceInput {
  request: AcquireCanonicalSourceRequest;
  source: MetadataOnlySource;
  signal: AbortSignal;
}

export function freezeAcquisitionResult(
  result: AcquisitionAdapterResult,
): AcquisitionAdapterResult {
  const immutableResult = structuredClone(result);
  freezeRecursively(immutableResult);
  return immutableResult;
}

function freezeRecursively(value: unknown): void {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return;
  }
  for (const nested of Object.values(value)) freezeRecursively(nested);
  Object.freeze(value);
}
