import {
  parseAcquireCanonicalSourceRequest,
  parseAcquireCanonicalSourceResponse,
} from '../backend/sourcing/contract-validation';
import type { AcquiredSource } from '../contracts/sourcing';
import type { DiscoveredSourceProvenance } from '../contracts/source-provenance';
import { decodeRecord, decodeUuid } from './workspace-decoder';

export interface AcquiredSourceAcceptance {
  projectId: string;
  source: AcquiredSource;
}

export function decodeAcquiredSourceAcceptance(
  value: unknown,
): AcquiredSourceAcceptance {
  const input = decodeRecord(value, 'source acceptance');
  const request = parseAcquireCanonicalSourceRequest(input.request);
  const response = parseAcquireCanonicalSourceResponse(input.response, request);
  if (response.outcome !== 'success')
    throw new Error('No acquired source to save.');
  return {
    projectId: decodeUuid(input.projectId, 'project id'),
    source: response.source,
  };
}

export function discoveredProvenance(
  source: AcquiredSource,
): DiscoveredSourceProvenance {
  const { content, ...descriptor } = source;
  return {
    kind: 'discovered',
    locator: descriptor.originalLocation.url,
    remoteSourceId: source.sourceId,
    remoteRevisionId: content.revision.revisionId,
    descriptor,
    acquisition: content.revision.provenance,
    extraction: content.revision.extraction,
  };
}
