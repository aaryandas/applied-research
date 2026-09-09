import type {
  AcquiredCanonicalSourceRevision,
  MetadataOnlySource,
  SourceDiscoveryProvider,
} from '../../contracts/sourcing';
import type {
  ResearchAdoptionResult,
  ResearchDiscoveryResult,
} from './research-contract';

const PROVIDER_NAMES = {
  openalex: 'OpenAlex',
  'mit-open-courseware': 'MIT OpenCourseWare',
  'curated-catalog': 'Curated catalog',
};

export function providerName(provider: SourceDiscoveryProvider): string {
  return PROVIDER_NAMES[provider];
}

export function canAcquire(source: MetadataOnlySource): boolean {
  return (
    source.usePolicy.acquisition.status === 'permitted' &&
    source.acquisitionLocation !== null &&
    source.providerIds.length > 0
  );
}

/**
 * Only OpenAlex's summary has an adapter guarantee that it is an abstract, and
 * only when it is the sole provider identity: a merged record carries no such
 * guarantee for whichever provider supplied the text.
 */
export function isAbstract(source: MetadataOnlySource): boolean {
  return (
    source.metadataSummary !== null &&
    source.providerIds.length === 1 &&
    source.providerIds[0]?.provider === 'openalex'
  );
}

export type SourceAvailability =
  | 'acquired'
  | 'acquiring'
  | 'not-permitted'
  | 'unavailable'
  | 'readable'
  | 'abstract'
  | 'catalog';

export const AVAILABILITY_LABELS: Record<SourceAvailability, string> = {
  acquired: 'Acquired',
  acquiring: 'Acquiring…',
  'not-permitted': 'Not permitted',
  unavailable: 'Unavailable',
  readable: 'Readable link',
  abstract: 'Abstract available',
  catalog: 'Catalog only',
};

/** One derivation for the state line, so it never disagrees with the actions. */
export function sourceAvailability(
  source: MetadataOnlySource,
  state: { saved: boolean; acquiring: boolean; permissionDenied: boolean },
): SourceAvailability {
  if (state.saved) return 'acquired';
  if (state.acquiring) return 'acquiring';
  if (state.permissionDenied) return 'not-permitted';
  if (source.usePolicy.access === 'unavailable') return 'unavailable';
  if (canAcquire(source)) return 'readable';
  if (isAbstract(source)) return 'abstract';
  return 'catalog';
}

/** Learner-facing version line; the revision id stays in the provenance disclosure. */
export function acquiredVersion(
  revision: AcquiredCanonicalSourceRevision,
): string {
  const coverage =
    revision.extraction.coverage === 'partial'
      ? 'Partial text'
      : 'Complete extraction';
  return `Acquired ${revision.acquiredAt.slice(0, 10)} · ${coverage}`;
}

export function retryDelay(milliseconds: number): string {
  return `Suggested retry delay: ${Math.ceil(milliseconds / 1000)} seconds.`;
}

export function researchMessage(
  result: ResearchDiscoveryResult | ResearchAdoptionResult,
): string {
  switch (result.outcome) {
    case 'stale-project':
      return 'This project changed. Search again in the current project.';
    case 'save-failed':
      return 'The source could not be saved. Try acquiring it again.';
    case 'success':
    case 'partial':
    case 'saved':
      return '';
    case 'rate-limited':
      return result.retryAfterMilliseconds === null
        ? result.message
        : `${result.message} ${retryDelay(result.retryAfterMilliseconds)}`;
    case 'timed-out':
    case 'unavailable':
      return `${result.message} ${
        result.retryable ? 'Try again.' : 'Retrying will not help.'
      }`;
    default:
      return result.message;
  }
}
