import type { LearningOrigin } from '../../contracts/learning-records';
import type {
  AcquireCanonicalSourceRequest,
  AcquireCanonicalSourceResponse,
  AcquiredSource,
  DiscoverSourcesRequest,
  DiscoverSourcesResponse,
  ProviderIdentity,
} from '../../contracts/sourcing';

export interface ResearchContext {
  projectId: string;
  origin: LearningOrigin | null;
}

export interface ResearchOperation {
  context: ResearchContext;
  question: string;
  signal: AbortSignal;
}

export interface SavedResearchSource {
  projectId: string;
  sourceId: string;
  revisionId: string;
}

export interface StaleResearchProject {
  outcome: 'stale-project';
  requestId: string;
}

export type ResearchDiscoveryResult =
  DiscoverSourcesResponse | StaleResearchProject;

export type ResearchAdoptionResult =
  | {
      outcome: 'saved';
      requestId: string;
      source: AcquiredSource;
      saved: SavedResearchSource;
    }
  | Exclude<AcquireCanonicalSourceResponse, { outcome: 'success' }>
  | StaleResearchProject
  | { outcome: 'save-failed'; requestId: string };

export interface ResearchReaderTarget extends SavedResearchSource {
  question: string;
  origin: LearningOrigin | null;
}

export interface ResearchLinkTarget {
  projectId: string;
  sourceId: string;
  providerIdentity: ProviderIdentity;
}

/**
 * Renderer callbacks, not public IPC. The shell supplies trusted adapters.
 * Adapters resolve typed outcomes and never throw; the renderer's catch
 * branches are a last resort that show generic copy without adapter details.
 */
export interface ResearchCallbacks {
  onDiscover: (
    request: DiscoverSourcesRequest,
    operation: ResearchOperation,
  ) => Promise<ResearchDiscoveryResult>;
  /**
   * Resolves saved only after trusted acquisition AND local commit. When the
   * operation signal aborts before that commit, resolve `cancelled`, never
   * `saved`. A commit that completed before the abort was observed still
   * resolves `saved`; the renderer records it without opening Reader.
   */
  onAcquireAndSave: (
    request: AcquireCanonicalSourceRequest,
    operation: ResearchOperation,
  ) => Promise<ResearchAdoptionResult>;
  /** The shell flushes existing drafts before navigating to this exact version. */
  onOpenReader: (
    target: ResearchReaderTarget,
  ) => Promise<'opened' | 'blocked' | 'missing-source' | 'stale-project'>;
  /** Resolve this identity behind existing navigation policy, never raw URLs. */
  onOpenOriginal: (
    target: ResearchLinkTarget,
  ) => Promise<'opened' | 'unavailable'>;
}

export interface ResearchEntryProps extends ResearchCallbacks {
  context: ResearchContext;
  initialQuestion?: string;
}
