import type {
  ContextualHelpRequest,
  ContextualHelpResponse,
} from '../../contracts/contextual-help';
import type {
  RetainedExplanation,
  SceneLocalState,
  TrustedSceneCapture,
} from '../../contracts/explanation-artifacts';

export interface ContextualHelpBridge {
  requestContextualHelp(input: ContextualHelpRequest): Promise<unknown>;
  cancelContextualHelp(input: {
    requestId: string;
    expectedProjectGeneration: number;
    expectedRequestGeneration: number;
  }): Promise<void>;
  loadRetainedExplanation(input: {
    projectId: string;
    explanationId: string;
  }): Promise<RetainedExplanation | null>;
  listRetainedExplanations(input: {
    projectId: string;
  }): Promise<RetainedExplanation[]>;
  saveExplanationSceneState(input: {
    projectId: string;
    state: SceneLocalState;
  }): Promise<SceneLocalState>;
  loadExplanationSceneState(input: {
    projectId: string;
    explanationId: string;
  }): Promise<SceneLocalState | null>;
  acceptSceneCapture(input: {
    projectId: string;
    request: unknown;
  }): Promise<TrustedSceneCapture>;
}

export type { ContextualHelpResponse };
