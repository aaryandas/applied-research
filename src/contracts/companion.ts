import type { AiProvenance } from './learning-api';
import type { SourceCitation } from './learning-records';
import type {
  PracticalActivity,
  PracticalEvidenceReference,
  PracticalGuidanceRequest,
  PracticalTarget,
} from './practical-work';

/** In-process consumer seam, not a validated IPC schema. */
export interface CompanionIdentity {
  readonly attemptId: string;
  readonly activity: PracticalActivity;
}

export type CompanionVersion =
  | { kind: 'saved'; revision: number }
  | { kind: 'unsaved-draft'; lastAcknowledgedRevision: number | null };

export type CompanionContext =
  | {
      target: Extract<PracticalTarget['target'], 'activity-instructions'>;
      title: string;
      objective: string;
      instructions: string;
    }
  | {
      target: Extract<PracticalTarget['target'], 'tool-controls'>;
      controls: readonly { name: string; description: string }[];
      loading: boolean;
      error: string | null;
      /** Host-verified identity only. This never authorizes a guest page read. */
      guest: { sessionId: string; url: string; title: string } | null;
    }
  | {
      target: Extract<PracticalTarget['target'], 'selected-result'>;
      result:
        | {
            kind: 'user-reported-text';
            text: string;
            version: CompanionVersion;
          }
        | {
            kind: 'trusted-selected-evidence';
            reference: PracticalEvidenceReference;
            /** Resolved by the trusted producer, never synthesized from renderer text. */
            text: string;
            provenanceId: string;
          };
    }
  | {
      target: Extract<PracticalTarget['target'], 'reflection'>;
      authorKind: 'human';
      text: string;
      version: CompanionVersion;
    };

export interface CompanionFailure {
  status:
    | 'unavailable'
    | 'stale'
    | 'offline'
    | 'unauthenticated'
    | 'cancelled'
    | 'error';
  /** Safe, user-facing explanation; never raw transport errors or secrets. */
  message: string;
}

export type CompanionResolution =
  | {
      status: 'available';
      requestedTarget: PracticalTarget;
      context: CompanionContext;
    }
  | CompanionFailure;

export interface CompanionNavigation {
  sessionId: string;
  url: string;
  loading: boolean;
  error: string | null;
}

export interface CompanionGuidanceInput {
  requestId: string;
  requestedTarget: PracticalTarget;
  cause: 'ask-once' | 'activity-start' | 'tool-navigation';
  context: CompanionContext;
  /** Always none in this checkpoint. A tool-controls target is not page consent. */
  pageAccess: 'none';
}

export type CompanionGuidanceReply =
  | {
      status: 'answered';
      text: string;
      nextAction: string;
      citations: readonly SourceCitation[];
      provenance: AiProvenance;
    }
  | CompanionFailure;

export type CompanionOutcome =
  | (CompanionGuidanceInput & {
      status: 'answered';
      authorKind: 'ai';
      text: string;
      nextAction: string;
      citations: readonly SourceCitation[];
      provenance: AiProvenance;
    })
  | CompanionFailure
  | {
      status: 'ignored';
      reason: 'busy' | 'inactive' | 'navigation' | 'already-active';
    };

export type CompanionStopReason =
  | 'user-stop'
  | 'activity-completed'
  | 'project-replaced'
  | 'attempt-replaced'
  | 'tool-closed'
  | 'tool-navigation'
  | 'target-unavailable'
  | 'external-handoff'
  | 'sign-out'
  | 'unmount';

export interface CompanionState {
  activity: CompanionIdentity;
  observation:
    | {
        status: 'inactive';
        reason: CompanionStopReason | 'start-failed' | null;
      }
    | {
        status: 'starting' | 'active';
        target: PracticalTarget;
        toolSessionId: string | null;
      };
  pending: 'resolving' | 'requesting' | null;
  /** Revoked work still owns the physical request slot until its adapter settles. */
  draining?: boolean;
  outcome: CompanionOutcome | null;
}

export interface CompanionSessionOptions extends CompanionIdentity {
  /** Fixed host subscription identity and last successfully loaded URL. No binding = no following. */
  toolSession?: { sessionId: string; initialUrl: string };
  resolveTarget(
    request: PracticalGuidanceRequest,
    signal: AbortSignal,
  ): Promise<CompanionResolution>;
  /** Approved authenticated adapter only. Must validate ownership, bounds and request identity. */
  requestGuidance(
    input: CompanionGuidanceInput,
    signal: AbortSignal,
  ): Promise<CompanionGuidanceReply>;
  onStateChange(state: CompanionState): void;
  now(): number;
  createRequestId(): string;
}

export interface CompanionSession {
  getState(): CompanionState;
  askOnce(request: PracticalGuidanceRequest): Promise<CompanionOutcome>;
  startActivity(request: PracticalGuidanceRequest): Promise<CompanionOutcome>;
  observeToolNavigation(event: CompanionNavigation): Promise<CompanionOutcome>;
  stop(reason: CompanionStopReason): void;
  dispose(): void;
}

/** Mounted Practical producer registration. Registration itself reads no context. */
export type RegisterCompanionResolver = (
  resolve: CompanionSessionOptions['resolveTarget'],
) => () => void;

export interface CompanionRequester {
  session: CompanionSession;
  registerResolver: RegisterCompanionResolver;
  dispose(): void;
}
