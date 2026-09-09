import { GUARDED_HTTP_LIMITS } from '../sourcing/acquisition/guarded-http.js';
import { pinnedUniversitySource, universityCandidate } from './catalog.js';
import { externalCourseEntry } from './directory.js';
import { sha256Bytes } from './hashes.js';
import {
  UNIVERSITY_PUBLIC_MESSAGES,
  freezeUniversityValue,
  type UniversityAdmissionResult,
  type UniversityByteFetchResult,
  type UniversityByteTransport,
} from './types.js';

export async function admitUniversityBytes(options: {
  candidateId: string;
  transport: UniversityByteTransport;
  signal: AbortSignal;
}): Promise<UniversityAdmissionResult> {
  const directory = externalCourseEntry(options.candidateId);
  if (directory !== null) {
    return freezeUniversityValue({
      outcome: 'directory-only',
      candidateId: options.candidateId,
      message: UNIVERSITY_PUBLIC_MESSAGES.directoryOnly,
      publicState: {
        reachability: directory.reachability,
        permission: directory.permission,
        extraction: 'none',
        indexing: 'not-indexed',
      },
    });
  }
  const candidate = universityCandidate(options.candidateId);
  if (candidate === null) {
    return freezeUniversityValue({
      outcome: 'invalid-source',
      candidateId: options.candidateId,
      message: UNIVERSITY_PUBLIC_MESSAGES.invalidSource,
      publicState: {
        reachability: 'unchecked',
        permission: 'directory-only',
        extraction: 'none',
        indexing: 'not-indexed',
      },
    });
  }
  if (options.signal.aborted) {
    return cancelled(options.candidateId);
  }
  const pinned = pinnedUniversitySource(options.candidateId);
  if (pinned === null) {
    return admitUnpinned(candidate.id, candidate.acquisitionUrl, options);
  }
  const sourceFetched = await options.transport.fetch(
    pinned.source.url,
    options.signal,
  );
  const sourceFailure = fetchFailure(
    options.candidateId,
    sourceFetched,
    options.signal,
  );
  if (sourceFailure !== null) return sourceFailure;
  if (sourceFetched.outcome !== 'success') {
    return unavailable(options.candidateId);
  }
  if (options.signal.aborted) return cancelled(options.candidateId);
  const licenseFetched = await options.transport.fetch(
    pinned.license.url,
    options.signal,
  );
  const licenseFailure = fetchFailure(
    options.candidateId,
    licenseFetched,
    options.signal,
  );
  if (licenseFailure !== null) return licenseFailure;
  if (licenseFetched.outcome !== 'success') {
    return unavailable(options.candidateId);
  }
  if (
    sourceFetched.bytes.byteLength > GUARDED_HTTP_LIMITS.decompressedBytes ||
    licenseFetched.bytes.byteLength > GUARDED_HTTP_LIMITS.decompressedBytes
  ) {
    return freezeUniversityValue({
      outcome: 'oversized',
      candidateId: options.candidateId,
      message: UNIVERSITY_PUBLIC_MESSAGES.oversized,
      publicState: {
        reachability: 'reachable-pinned',
        permission: 'hash-verified',
        extraction: 'none',
        indexing: 'not-indexed',
      },
    });
  }
  const sourceHash = sha256Bytes(sourceFetched.bytes);
  const licenseHash = sha256Bytes(licenseFetched.bytes);
  if (
    sourceFetched.bytes.byteLength !== pinned.source.bytes ||
    sourceHash !== pinned.source.sha256 ||
    licenseFetched.bytes.byteLength !== pinned.license.bytes ||
    licenseHash !== pinned.license.sha256
  ) {
    return freezeUniversityValue({
      outcome: 'hash-mismatch',
      candidateId: options.candidateId,
      message: UNIVERSITY_PUBLIC_MESSAGES.hashMismatch,
      publicState: {
        reachability: 'reachable-pinned',
        permission: 'pending-evidence',
        extraction: 'none',
        indexing: 'not-indexed',
      },
    });
  }
  return freezeUniversityValue({
    outcome: 'admitted',
    candidateId: options.candidateId,
    sourceBytes: sourceFetched.bytes,
    sourceBytesSha256: sourceHash,
    licenseBytes: licenseFetched.bytes,
    licenseBytesSha256: licenseHash,
    acquiredSourceUrl: sourceFetched.acquiredUrl,
    acquiredLicenseUrl: licenseFetched.acquiredUrl,
    sourceMediaType: sourceFetched.mediaType,
    redirectCount: sourceFetched.redirectCount + licenseFetched.redirectCount,
  });
}

async function admitUnpinned(
  candidateId: string,
  acquisitionUrl: string | null,
  options: {
    transport: UniversityByteTransport;
    signal: AbortSignal;
  },
): Promise<UniversityAdmissionResult> {
  if (acquisitionUrl === null) return unavailable(candidateId);
  const fetched = await options.transport.fetch(acquisitionUrl, options.signal);
  const failure = fetchFailure(candidateId, fetched, options.signal);
  if (failure !== null) return failure;
  return freezeUniversityValue({
    outcome: 'acquisition-pending',
    candidateId,
    message:
      'Original bytes were not admitted; no canonical hash is recorded for this unresolved acquisition.',
    publicState: {
      reachability:
        fetched.outcome === 'success' ? 'unchecked' : 'challenge-blocked',
      permission: 'pending-evidence',
      extraction: 'none',
      indexing: 'not-indexed',
    },
  });
}

function fetchFailure(
  candidateId: string,
  fetched: UniversityByteFetchResult,
  signal: AbortSignal,
): UniversityAdmissionResult | null {
  if (signal.aborted || fetched.outcome === 'cancelled') {
    return cancelled(candidateId);
  }
  if (fetched.outcome === 'timed-out') {
    return freezeUniversityValue({
      outcome: 'timed-out',
      candidateId,
      message: UNIVERSITY_PUBLIC_MESSAGES.timedOut,
      publicState: {
        reachability: 'unavailable',
        permission: 'pending-evidence',
        extraction: 'none',
        indexing: 'not-indexed',
      },
    });
  }
  if (fetched.outcome === 'unsupported') {
    return freezeUniversityValue({
      outcome: 'unsupported',
      candidateId,
      message: UNIVERSITY_PUBLIC_MESSAGES.unsupported,
      publicState: {
        reachability: 'reachable-pinned',
        permission: 'pending-evidence',
        extraction: 'pending',
        indexing: 'not-indexed',
      },
    });
  }
  if (fetched.outcome === 'unavailable') return unavailable(candidateId);
  return null;
}

function cancelled(candidateId: string): UniversityAdmissionResult {
  return freezeUniversityValue({
    outcome: 'cancelled',
    candidateId,
    message: UNIVERSITY_PUBLIC_MESSAGES.cancelled,
    publicState: {
      reachability: 'unchecked',
      permission: 'pending-evidence',
      extraction: 'none',
      indexing: 'not-indexed',
    },
  });
}

function unavailable(candidateId: string): UniversityAdmissionResult {
  return freezeUniversityValue({
    outcome: 'unavailable',
    candidateId,
    message: UNIVERSITY_PUBLIC_MESSAGES.unavailable,
    publicState: {
      reachability: 'challenge-blocked',
      permission: 'pending-evidence',
      extraction: 'none',
      indexing: 'not-indexed',
    },
  });
}
