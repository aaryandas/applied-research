import type { AiProvenance } from './learning-api';
import type { SourceCitation } from './learning-records';
import type {
  AcquiredCanonicalSourceRevision,
  SourceDescriptor,
} from './sourcing';

export interface DiscoveredSourceProvenance {
  kind: 'discovered';
  locator: string;
  remoteSourceId: string;
  remoteRevisionId: string;
  descriptor: SourceDescriptor;
  acquisition: AcquiredCanonicalSourceRevision['provenance'];
  extraction: AcquiredCanonicalSourceRevision['extraction'];
}

export type StoredAiProvenance = Omit<
  AiProvenance,
  'model' | 'requestVersion'
> & { model: string; requestVersion: string };

export interface GeneratedSourceProvenance {
  kind: 'generated';
  locator: null;
  remoteSourceId: string;
  remoteRevisionId: string;
  requestId: string;
  generation: StoredAiProvenance;
  citations: SourceCitation[];
}

export type SourceProvenance =
  | { kind: 'human-imported'; locator: string | null }
  | DiscoveredSourceProvenance
  | GeneratedSourceProvenance;
