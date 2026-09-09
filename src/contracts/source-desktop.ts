import type { LearningWorkspace } from './learning-records';
import type {
  AcquireCanonicalSourceRequest,
  AcquireCanonicalSourceResponse,
  AcquiredSource,
  DiscoverSourcesRequest,
  DiscoverSourcesResponse,
  ProviderIdentity,
} from './sourcing';

export const SOURCE_CHANNELS = {
  activate: 'sources:activate-workspace',
  discover: 'sources:discover',
  acquire: 'sources:acquire-and-save',
  cancel: 'sources:cancel',
  original: 'sources:open-original',
  generate: 'sources:generate-learning-path',
} as const;
export interface SourceOperationScope {
  projectId: string;
}
export interface SourceDiscoveryInput extends SourceOperationScope {
  request: DiscoverSourcesRequest;
}
export interface SourceAcquisitionInput extends SourceOperationScope {
  request: AcquireCanonicalSourceRequest;
}
export interface SourceOriginalInput extends SourceOperationScope {
  sourceId: string;
  providerIdentity: ProviderIdentity;
}
export type StaleSourceOperation = {
  outcome: 'stale-project';
  requestId: string;
};
export type SourceDiscoveryResult =
  DiscoverSourcesResponse | StaleSourceOperation;
export type SourceAcquisitionResult =
  | {
      outcome: 'saved';
      requestId: string;
      source: AcquiredSource;
      saved: { projectId: string; sourceId: string; revisionId: string };
    }
  | Exclude<AcquireCanonicalSourceResponse, { outcome: 'success' }>
  | StaleSourceOperation
  | { outcome: 'save-failed'; requestId: string };
/** Named bounded operations. No renderer-supplied canonical text or provider attribution. */
export interface SourceDesktopBridge {
  /**
   * Compatibility sourced path. Commits immediately and only supports 12 flat
   * first-useful-step lessons. It is not an onboarding preview and must not
   * replace an accepted course when a later chapter is generated. Use
   * `LearningOnboardingBridge` for interview, proposal, acceptance and
   * selected-lesson generation.
   */
  generateSourcedLearning(
    input: SourceGenerationInput,
  ): Promise<SourceGenerationResult>;
  activateSourceWorkspace(projectId: string | null): Promise<void>;
  discoverSources(input: SourceDiscoveryInput): Promise<SourceDiscoveryResult>;
  acquireAndSaveSource(
    input: SourceAcquisitionInput,
  ): Promise<SourceAcquisitionResult>;
  cancelSourceOperation(
    input: SourceOperationScope & { requestId: string },
  ): Promise<void>;
  openSourceOriginal(
    input: SourceOriginalInput,
  ): Promise<'opened' | 'unavailable'>;
}
export type RetainedSourceWorkspace = Pick<
  LearningWorkspace,
  'project' | 'sources'
>;

export interface SourceGenerationInput extends SourceOperationScope {
  requestId: string;
  consent: 'acquire-learning-evidence';
}
export type SourceGenerationResult =
  | {
      outcome: 'saved';
      requestId: string;
      pathId: string;
      pathRevision: number;
    }
  | {
      outcome:
        'stale-project' | 'unavailable' | 'coverage-pending' | 'save-failed';
      requestId: string;
    };
