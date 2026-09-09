import { useEffect, useRef, useState, type ReactElement } from 'react';
import {
  EXPLANATION_VERSION,
  type ExplanationSpec,
} from '../../contracts/explanations';
import {
  SCENE_ASSET_VERSION,
  type RetainedExplanation,
  type SceneCaptureRequest,
  type SceneLocalState,
  type TrustedSceneCapture,
} from '../../contracts/explanation-artifacts';
import { ExplanationExperience } from './ExplanationExperience';

function captureKey(
  explanationId: string,
  usefulAttemptId: string | null,
): string {
  return `${explanationId}:${usefulAttemptId ?? ''}`;
}

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
  readonly onCaptureRequest: (
    request: SceneCaptureRequest,
  ) => Promise<TrustedSceneCapture | void> | TrustedSceneCapture | void;
}): ReactElement | null {
  const useful = explanation.attempts.find(
    (attempt) => attempt.attemptId === explanation.usefulAttemptId,
  );
  const mountedRef = useRef(true);
  const key = captureKey(
    explanation.explanationId,
    explanation.usefulAttemptId,
  );
  const [capture, setCapture] = useState<{
    key: string;
    generation: number;
    trusted: TrustedSceneCapture | null;
    error: string | null;
  }>({ key, generation: 0, trusted: null, error: null });
  if (capture.key !== key) {
    setCapture({
      key,
      generation: capture.generation + 1,
      trusted: null,
      error: null,
    });
  }
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const trustedCapture =
    capture.key === key &&
    capture.trusted?.explanationId === explanation.explanationId
      ? capture.trusted
      : null;
  const captureError = capture.key === key ? capture.error : null;
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
    <>
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
        onRetainedCapture={(request) => {
          const generationAtClick = capture.generation;
          const explanationId = explanation.explanationId;
          const usefulAttemptId = explanation.usefulAttemptId;
          void Promise.resolve(onCaptureRequest(request)).then(
            (captured) => {
              if (!mountedRef.current) return;
              setCapture((current) => {
                if (current.generation !== generationAtClick) return current;
                if (
                  captured &&
                  captured.kind === 'app-measured' &&
                  captured.explanationId === explanationId
                ) {
                  return {
                    key: captureKey(captured.explanationId, usefulAttemptId),
                    generation: generationAtClick,
                    trusted: captured,
                    error: null,
                  };
                }
                return {
                  key: captureKey(explanationId, usefulAttemptId),
                  generation: generationAtClick,
                  trusted: null,
                  error:
                    'Main did not return a trusted scene capture. Parameters are unchanged.',
                };
              });
            },
            (failure: unknown) => {
              if (!mountedRef.current) return;
              setCapture((current) => {
                if (current.generation !== generationAtClick) return current;
                return {
                  key: captureKey(explanationId, usefulAttemptId),
                  generation: generationAtClick,
                  trusted: null,
                  error:
                    failure instanceof Error
                      ? failure.message
                      : 'Could not retain this capture. Parameters are unchanged.',
                };
              });
            },
          );
        }}
      />
      {captureError ? <p role="alert">{captureError}</p> : null}
      {trustedCapture ? (
        <output className="explanation-capture">
          <strong>Captured · app-measured</strong>
          <pre aria-label="Captured scene record">
            {JSON.stringify(trustedCapture, null, 2)}
          </pre>
        </output>
      ) : null}
    </>
  );
}
