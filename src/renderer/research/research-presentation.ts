import type {
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

export function sourceAvailability(source: MetadataOnlySource): string {
  if (source.usePolicy.access === 'unavailable') return 'Unavailable';
  if (
    source.metadataSummary &&
    source.providerIds.some((id) => id.provider === 'openalex')
  )
    return 'Abstract available';
  if (source.acquisitionLocation) return 'Readable link';
  return 'Catalog only';
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
    default:
      return result.message;
  }
}
