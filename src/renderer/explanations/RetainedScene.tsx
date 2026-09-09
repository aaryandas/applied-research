import type { ReactElement } from 'react';
import {
  EXPLANATION_VERSION,
  type ExplanationSpec,
} from '../../contracts/explanations';
import {
  SCENE_ASSET_VERSION,
  type RetainedExplanation,
  type SceneCaptureRequest,
  type SceneLocalState,
} from '../../contracts/explanation-artifacts';
import { ExplanationExperience } from './ExplanationExperience';

export function RetainedScene({
  explanation,
  scene,
  active,
  onParameters,
  onCaptureRequest,
}: {
  readonly explanation: RetainedExplanation;
  readonly scene: SceneLocalState | null;
  readonly active: boolean;
  readonly onParameters: (state: SceneLocalState) => void;
  readonly onCaptureRequest: (request: SceneCaptureRequest) => void;
}): ReactElement | null {
  const useful = explanation.attempts.find(
    (attempt) => attempt.attemptId === explanation.usefulAttemptId,
  );
  if (useful?.result?.kind !== 'scene') return null;
  const parameters = scene?.parameters ?? useful.result.initialParameters;
  const origin = explanation.origin.sourceRevisionId
    ? {
        projectId: explanation.projectId,
        sourceVersionId: explanation.origin.sourceRevisionId,
        questionId: explanation.origin.entry?.entryId ?? null,
        lessonId: explanation.origin.path?.lessonId ?? null,
      }
    : null;
  const caption =
    useful.plan?.status === 'supported'
      ? useful.plan.caption
      : 'Retained scene';
  const identity = {
    id: explanation.explanationId,
    version: EXPLANATION_VERSION as typeof EXPLANATION_VERSION,
    assetVersion: SCENE_ASSET_VERSION,
    origin,
    caption,
  };
  let spec: ExplanationSpec;
  if (useful.result.family === 'two-link-arm') {
    const arm =
      'selectedPart' in parameters
        ? useful.result.initialParameters
        : parameters;
    if ('selectedPart' in arm) return null;
    spec = { ...identity, recipe: 'two-link-arm', parameters: arm };
  } else {
    const assembly =
      'selectedPart' in parameters
        ? parameters
        : useful.result.initialParameters;
    if (!('selectedPart' in assembly)) return null;
    spec = { ...identity, recipe: 'spatial-assembly', parameters: assembly };
  }
  return (
    <ExplanationExperience
      spec={spec}
      active={active}
      plannedParameters={useful.result.initialParameters}
      parameterRevision={scene?.parameterRevision ?? 1}
      onChange={(next) => {
        onParameters({
          kind: 'scene-local-state',
          explanationId: explanation.explanationId,
          parameterRevision: (scene?.parameterRevision ?? 1) + 1,
          parameters: next.parameters,
          camera: scene?.camera ?? {
            position: { x: 0, y: 0, z: 13 },
            target: { x: 0, y: 0, z: 0 },
          },
        });
      }}
      onCapture={() => undefined}
      onRetainedCapture={onCaptureRequest}
    />
  );
}
