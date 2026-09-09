import { createHash } from 'node:crypto';
import { parse } from 'parse5';
import { createParse5TreeAdapter } from './parse5-tree.js';
import type {
  AcquiredCanonicalSourceRevision,
  AcquiredSource,
  ProviderIdentity,
} from '../../../contracts/sourcing.js';
import {
  canonicalizeSourceBytes,
  type StructuredHtmlParser,
} from './canonicalize.js';
import { type GuardedFetchResult, GuardedHttpsClient } from './guarded-http.js';
import {
  ACQUISITION_PUBLIC_MESSAGES,
  freezeAcquisitionResult,
  type AcquisitionAdapterResult,
  type AcquisitionSourceInput,
} from './types.js';
import { createSourcePassages } from '../corpus/passages.js';
import { parseAcquireCanonicalSourceRequest } from '../contract-validation.js';

export interface AcquisitionClock {
  now(): Date;
}

export class SourceAcquisitionAdapter {
  readonly #http: GuardedHttpsClient;
  readonly #clock: AcquisitionClock;
  readonly #htmlParser: StructuredHtmlParser;

  constructor(options: {
    http: GuardedHttpsClient;
    clock: AcquisitionClock;
    htmlParser?: StructuredHtmlParser;
  }) {
    this.#http = options.http;
    this.#clock = options.clock;
    this.#htmlParser = options.htmlParser ?? createParse5TreeAdapter({ parse });
  }

  async acquire(
    input: AcquisitionSourceInput,
  ): Promise<AcquisitionAdapterResult> {
    const invalidResult = validateInput(input);
    if (invalidResult !== null) return freezeAcquisitionResult(invalidResult);
    if (input.signal.aborted) return this.cancelled(input.request.requestId);
    if (input.source.usePolicy.acquisition.status !== 'permitted') {
      return freezeAcquisitionResult({
        outcome: 'not-permitted',
        requestId: input.request.requestId,
        decision: input.source.usePolicy.acquisition.status,
        message: ACQUISITION_PUBLIC_MESSAGES.notPermitted,
      });
    }
    const acquisitionLocation = input.source.acquisitionLocation;
    if (acquisitionLocation === null) {
      return freezeAcquisitionResult({
        outcome: 'invalid-source',
        requestId: input.request.requestId,
        message: ACQUISITION_PUBLIC_MESSAGES.invalidSource,
      });
    }

    const fetched = await this.#http.fetch(
      acquisitionLocation.url,
      input.signal,
    );
    if (fetched.outcome !== 'success') {
      return this.fetchFailure(input.request.requestId, fetched);
    }
    const canonicalized = canonicalizeSourceBytes({
      bytes: fetched.bytes,
      mediaType: fetched.mediaType,
      title: input.source.title,
      htmlParser: this.#htmlParser,
    });
    if (canonicalized.outcome === 'unsupported') {
      return freezeAcquisitionResult({
        outcome: 'unsupported',
        requestId: input.request.requestId,
        coverage: 'none',
        mediaType: fetched.mediaType,
        message: ACQUISITION_PUBLIC_MESSAGES.unsupported,
      });
    }
    if (canonicalized.outcome === 'malformed-content') {
      return freezeAcquisitionResult({
        outcome: 'malformed-content',
        requestId: input.request.requestId,
        message: ACQUISITION_PUBLIC_MESSAGES.malformedContent,
      });
    }

    const acquiredAt = this.#clock.now().toISOString();
    const canonicalSha256 = sha256(canonicalized.document.text);
    const revision = createRevision({
      input,
      acquiredUrl: fetched.acquiredUrl,
      acquiredAt,
      canonicalSha256,
      canonicalized: canonicalized.document,
    });
    const source: AcquiredSource = {
      ...input.source,
      acquisitionLocation: {
        url: fetched.acquiredUrl,
        trust: 'untrusted-public-url',
      },
      content: { state: 'acquired', revision },
    };
    return freezeAcquisitionResult({
      outcome: 'success',
      requestId: input.request.requestId,
      source,
      passages:
        input.source.usePolicy.indexing.status === 'permitted'
          ? createSourcePassages({
              revision,
              sections: canonicalized.document.sections,
            })
          : [],
      receipt: {
        requestedUrl: fetched.requestedUrl,
        acquiredUrl: fetched.acquiredUrl,
        mediaType: fetched.mediaType,
        sourceBytes: fetched.bytes.byteLength,
        sourceBytesSha256: sha256(fetched.bytes),
        redirectCount: fetched.redirectCount,
      },
    });
  }

  private fetchFailure(
    requestId: string,
    fetched: Exclude<GuardedFetchResult, { outcome: 'success' }>,
  ): AcquisitionAdapterResult {
    if (fetched.outcome === 'unsupported') {
      return freezeAcquisitionResult({
        outcome: 'unsupported',
        requestId,
        coverage: 'none',
        mediaType: fetched.mediaType,
        message: ACQUISITION_PUBLIC_MESSAGES.unsupported,
      });
    }
    if (fetched.outcome === 'cancelled') return this.cancelled(requestId);
    if (fetched.outcome === 'timed-out') {
      return freezeAcquisitionResult({
        outcome: 'timed-out',
        requestId,
        message: ACQUISITION_PUBLIC_MESSAGES.timedOut,
      });
    }
    return freezeAcquisitionResult({
      outcome: 'unavailable',
      requestId,
      retryable: false,
      message: ACQUISITION_PUBLIC_MESSAGES.unavailable,
    });
  }

  private cancelled(requestId: string): AcquisitionAdapterResult {
    return freezeAcquisitionResult({
      outcome: 'cancelled',
      requestId,
      message: ACQUISITION_PUBLIC_MESSAGES.cancelled,
    });
  }
}

export function systemAcquisitionClock(): AcquisitionClock {
  return { now: () => new Date() };
}

function validateInput(
  input: AcquisitionSourceInput,
): AcquisitionAdapterResult | null {
  try {
    parseAcquireCanonicalSourceRequest(input.request);
  } catch {
    return {
      outcome: 'invalid-source',
      requestId: null,
      message: ACQUISITION_PUBLIC_MESSAGES.invalidSource,
    };
  }
  const providerMatches = input.source.providerIds.some((identity) =>
    sameProviderIdentity(identity, input.request.providerIdentity),
  );
  if (
    input.request.sourceId !== input.source.sourceId ||
    input.source.content.state !== 'metadata-only' ||
    input.source.authorship.kind !== 'authored' ||
    !providerMatches
  ) {
    return {
      outcome: 'invalid-source',
      requestId: input.request.requestId,
      message: ACQUISITION_PUBLIC_MESSAGES.invalidSource,
    };
  }
  return null;
}

function sameProviderIdentity(
  left: ProviderIdentity,
  right: ProviderIdentity,
): boolean {
  return left.provider === right.provider && left.id === right.id;
}

function createRevision(options: {
  input: AcquisitionSourceInput;
  acquiredUrl: string;
  acquiredAt: string;
  canonicalSha256: string;
  canonicalized: {
    text: string;
    format: 'plain-text' | 'html';
    canonicalizationVersion: string;
    extraction: AcquiredCanonicalSourceRevision['extraction'];
  };
}): AcquiredCanonicalSourceRevision {
  return {
    sourceId: options.input.source.sourceId,
    revisionId: `revision_${sha256(
      JSON.stringify([
        options.input.source.sourceId,
        options.canonicalized.canonicalizationVersion,
        options.canonicalized.extraction.method,
        options.canonicalSha256,
      ]),
    )}`,
    title: options.input.source.title,
    canonicalText: options.canonicalized.text,
    sha256: options.canonicalSha256,
    format: options.canonicalized.format,
    canonicalizationVersion: options.canonicalized.canonicalizationVersion,
    acquiredAt: options.acquiredAt,
    provenance: {
      kind: 'discovered',
      acquiredFromUrl: options.acquiredUrl,
      providerIdentity: options.input.request.providerIdentity,
      discoveredAt: options.input.source.discoveredAt,
    },
    extraction: options.canonicalized.extraction,
  };
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
