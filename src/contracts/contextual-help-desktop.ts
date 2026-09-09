import {
  CONTEXTUAL_HELP_CANCEL_CHANNEL,
  CONTEXTUAL_HELP_REQUEST_CHANNEL,
  type ContextualHelpRequest,
} from './contextual-help';
import type {
  RetainedExplanation,
  SceneLocalState,
  TrustedSceneCapture,
} from './explanation-artifacts';

export const CONTEXTUAL_HELP_CHANNELS = {
  request: CONTEXTUAL_HELP_REQUEST_CHANNEL,
  cancel: CONTEXTUAL_HELP_CANCEL_CHANNEL,
  load: 'learning:load-retained-explanation',
  list: 'learning:list-retained-explanations',
  saveScene: 'learning:save-explanation-scene-state',
  loadScene: 'learning:load-explanation-scene-state',
  capture: 'learning:accept-scene-capture',
  loadCapture: 'learning:load-trusted-scene-capture',
  openClip: 'learning:open-retained-clip-media',
  place: 'learning:place-retained-explanation',
  listPlacements: 'learning:list-explanation-placements',
} as const;

export type OpenRetainedClipResult =
  | { readonly status: 'ready'; readonly objectUrl: string }
  | { readonly status: 'missing' | 'corrupt' | 'unauthorized' };

export interface RetainedExplanationPlacementInput {
  projectId: string;
  explanationId: string;
  view: 'distilled' | 'expanded';
  x: number;
  y: number;
}

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
  loadTrustedSceneCapture(input: {
    projectId: string;
    captureId: string;
  }): Promise<TrustedSceneCapture | null>;
  openRetainedClipMedia(input: {
    projectId: string;
    artifactId: string;
  }): Promise<OpenRetainedClipResult>;
  placeRetainedExplanation(input: RetainedExplanationPlacementInput): Promise<{
    kind: 'retained-explanation-placement';
    explanationId: string;
    projectId: string;
    view: 'distilled' | 'expanded';
    x: number;
    y: number;
  }>;
  listExplanationPlacements(input: { projectId: string }): Promise<
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
