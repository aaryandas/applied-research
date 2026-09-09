import type {
  ContextualHelpRequest,
  ContextualHelpResponse,
} from '../../contracts/contextual-help';
import type {
  RetainedExplanation,
  SceneLocalState,
  TrustedSceneCapture,
} from '../../contracts/explanation-artifacts';

export type OpenRetainedClipResult =
  | { readonly status: 'ready'; readonly objectUrl: string }
  | { readonly status: 'missing' | 'corrupt' | 'unauthorized' };

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
  openRetainedClipMedia(input: {
    projectId: string;
    artifactId: string;
  }): Promise<OpenRetainedClipResult>;
  placeRetainedExplanation?(input: {
    projectId: string;
    explanationId: string;
    view: 'distilled' | 'expanded';
    x: number;
    y: number;
  }): Promise<{
    kind: 'retained-explanation-placement';
    explanationId: string;
    projectId: string;
    view: 'distilled' | 'expanded';
    x: number;
    y: number;
  }>;
  listExplanationPlacements?(input: { projectId: string }): Promise<
    ReadonlyArray<{
      kind: 'retained-explanation-placement';
      explanationId: string;
      projectId: string;
      view: 'distilled' | 'expanded';
      x: number;
      y: number;
    }>
  >;
}

export type { ContextualHelpResponse };
