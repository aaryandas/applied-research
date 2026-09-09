import {
  lazy,
  Suspense,
  useId,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  ARM_LIMITS,
  DEFAULT_ARM,
  PART_IDS,
  isExplanationSpec,
  type ArmParameters,
  type AssemblyParameters,
  type ExplanationCapture,
  type ExplanationSpec,
  type RecipeId,
} from '../../contracts/explanations';
import type { SceneCaptureRequest } from '../../contracts/explanation-artifacts';
import {
  createExplanation,
  describeCapture,
  formatPoint,
  forwardEndpoint,
  PARTS,
} from './recipes';
import type { SceneRuntime } from './runtime';
import { useSceneVisibility } from './useSceneVisibility';
import './explanations.css';
import {
  ARM_FIELDS,
  parseArmDraft,
  useArmInputs,
  type ArmInputs,
} from './useArmInputs';

const SceneCanvas = lazy(async () => ({
  default: (await import('./SceneCanvas')).SceneCanvas,
}));
interface ExperienceProps {
  readonly spec: ExplanationSpec;
  readonly active: boolean;
  readonly onChange: (spec: ExplanationSpec) => void;
  readonly onCapture: (capture: ExplanationCapture) => void;
  readonly plannedParameters?: AssemblyParameters | ArmParameters;
  readonly parameterRevision?: number;
  readonly onRetainedCapture?: (request: SceneCaptureRequest) => void;
}
function ArmControls({ inputs }: { readonly inputs: ArmInputs }): ReactElement {
  const fieldId = useId();
  return (
    <div className="explanation-parameters">
      {ARM_FIELDS.map((field) => {
        const limit = ARM_LIMITS[field];
        const value = parseArmDraft(field, inputs.drafts[field]);
        const invalid = value === null;
        const errorId = `${fieldId}-${field}-error`;
        return (
          <label key={field}>
            <span>
              {limit.label}
              {field.endsWith('Degrees') ? ' (°)' : ''}
            </span>
            <input
              aria-label={`${limit.label}${field.endsWith('Degrees') ? ' (°)' : ''}`}
              type="text"
              inputMode="decimal"
              role="spinbutton"
              aria-valuemin={limit.min}
              aria-valuemax={limit.max}
              aria-valuenow={value ?? undefined}
              aria-invalid={invalid}
              aria-describedby={invalid ? errorId : undefined}
              value={inputs.drafts[field]}
              onFocus={() => inputs.focus(field)}
              onBlur={() => inputs.focus(null)}
              onChange={(event) => inputs.edit(field, event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')
                  return;
                event.preventDefault();
                if (value === null) return;
                const direction = event.key === 'ArrowUp' ? 1 : -1;
                const stepped = Math.min(
                  limit.max,
                  Math.max(limit.min, value + direction * limit.step),
                );
                inputs.edit(field, String(Number(stepped.toFixed(10))));
              }}
            />
            {invalid && (
              <span id={errorId} role="alert" className="explanation-error">
                {limit.label} must be a complete number between {limit.min} and{' '}
                {limit.max}.
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}
function ValidExperience({
  spec,
  active,
  onChange,
  onCapture,
  plannedParameters,
  parameterRevision = 1,
  onRetainedCapture,
}: ExperienceProps): ReactElement {
  const host = useRef<HTMLElement>(null);
  const runtime = useRef<SceneRuntime | null>(null);
  const { visible, reducedMotion } = useSceneVisibility(host);
  const [graphics, setGraphics] = useState<'loading' | 'ready' | 'unavailable'>(
    'loading',
  );
  const [attempt, setAttempt] = useState(0);
  const running = active && visible;
  const [capture, setCapture] = useState<ExplanationCapture | null>(null);
  const armInputs = useArmInputs(
    spec.recipe === 'two-link-arm' ? spec.parameters : DEFAULT_ARM,
    (parameters) => {
      if (spec.recipe === 'two-link-arm') onChange({ ...spec, parameters });
    },
  );
  const unfinishedInputs =
    spec.recipe === 'two-link-arm' && armInputs.hasUnfinishedInputs;

  const reset = (): void => {
    const armReset =
      plannedParameters && !('selectedPart' in plannedParameters)
        ? plannedParameters
        : DEFAULT_ARM;
    const assemblyReset =
      plannedParameters && 'selectedPart' in plannedParameters
        ? plannedParameters
        : { separation: 0, selectedPart: 'core' as const };
    armInputs.reset(armReset);
    onChange(
      spec.recipe === 'spatial-assembly'
        ? { ...spec, parameters: assemblyReset }
        : { ...spec, parameters: { ...armReset } },
    );
    runtime.current?.resetView();
  };
  const captureResult = (): void => {
    if (unfinishedInputs) return;
    const measured = runtime.current?.capture();
    if (!measured) return;
    if (onRetainedCapture) {
      onRetainedCapture({
        explanationId: spec.id,
        parameterRevision,
        parameters: spec.parameters,
        camera: measured.camera,
      });
      return;
    }
    const result: ExplanationCapture = {
      id: crypto.randomUUID(),
      explanation: structuredClone(spec),
      capturedAt: new Date().toISOString(),
      attribution: 'app-measured',
      retention: 'session-only',
      ...measured,
    };
    setCapture(result);
    onCapture(result);
  };
  return (
    <section
      ref={host}
      className="explanation-experience"
      aria-label={
        spec.recipe === 'spatial-assembly'
          ? 'Beacon module explanation'
          : 'Two-link arm explanation'
      }
    >
      <div className="explanation-title">
        <h2>
          {spec.recipe === 'spatial-assembly'
            ? 'Beacon module'
            : 'Two-link arm'}
        </h2>
        <button className="text-button" onClick={reset}>
          Reset
        </button>
      </div>
      <div
        className="explanation-viewport"
        data-state={running ? graphics : 'paused'}
      >
        {!running && <output>Scene paused while inactive.</output>}
        {running && graphics === 'unavailable' && (
          <div className="explanation-fallback">
            <output>
              3D view unavailable. WebGL may be disabled or its context was
              lost. Your parameters are unchanged.
            </output>
            <button
              className="text-button"
              onClick={() => {
                setGraphics('loading');
                setAttempt((value) => value + 1);
              }}
            >
              Retry 3D view
            </button>
            <p>
              Continue with the part descriptions or endpoint calculation below.
            </p>
          </div>
        )}
        {running && graphics !== 'unavailable' && (
          <Suspense fallback={<output>Loading 3D view…</output>}>
            <SceneCanvas
              key={attempt}
              spec={spec}
              reducedMotion={reducedMotion}
              runtimeRef={runtime}
              onReady={() => setGraphics('ready')}
              onLost={() => setGraphics('unavailable')}
              onSelect={(part) => {
                if (spec.recipe === 'spatial-assembly')
                  onChange({
                    ...spec,
                    parameters: { ...spec.parameters, selectedPart: part },
                  });
              }}
            />
          </Suspense>
        )}
        {spec.recipe === 'two-link-arm' && running && graphics === 'ready' && (
          <span className="explanation-axis" aria-hidden="true">
            +Y up · +X right · XY plane
          </span>
        )}
      </div>
      <p className="explanation-help">
        Drag to orbit · scroll to zoom. Focus the view: arrow keys orbit, + / −
        zoom, Home resets the view.
      </p>
      {spec.recipe === 'spatial-assembly' ? (
        <>
          <div className="explanation-actions">
            <button
              className="text-button"
              onClick={() =>
                onChange({
                  ...spec,
                  parameters: { ...spec.parameters, separation: 1 },
                })
              }
            >
              Explode
            </button>
            <button
              className="text-button"
              onClick={() =>
                onChange({
                  ...spec,
                  parameters: { ...spec.parameters, separation: 0 },
                })
              }
            >
              Reassemble
            </button>
          </div>
          <label className="explanation-separation">
            Separation · {Math.round(spec.parameters.separation * 100)}%
            <input
              aria-label="Assembly separation"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={spec.parameters.separation}
              onChange={(event) =>
                onChange({
                  ...spec,
                  parameters: {
                    ...spec.parameters,
                    separation: event.target.valueAsNumber,
                  },
                })
              }
            />
          </label>
          <div className="explanation-parts" aria-label="Assembly parts">
            {PART_IDS.map((part) => (
              <button
                key={part}
                aria-pressed={part === spec.parameters.selectedPart}
                onClick={() =>
                  onChange({
                    ...spec,
                    parameters: { ...spec.parameters, selectedPart: part },
                  })
                }
              >
                {PARTS[part].name}
              </button>
            ))}
          </div>
          <p className="explanation-part-description" aria-live="polite">
            {PARTS[spec.parameters.selectedPart].description}
          </p>
        </>
      ) : (
        <>
          <ArmControls inputs={armInputs} />
          <p className="explanation-measurement" aria-live="polite">
            Endpoint · {formatPoint(forwardEndpoint(spec.parameters))}
          </p>
          <p className="explanation-help">
            X = L₁ cos θ₁ + L₂ cos(θ₁ + θ₂)
            <br />Y = L₁ sin θ₁ + L₂ sin(θ₁ + θ₂)
          </p>
          {unfinishedInputs && (
            <output className="explanation-help">
              Finish or reset the edited values before capturing. The endpoint
              shows committed parameters.
            </output>
          )}
        </>
      )}
      <p className="explanation-caption">{spec.caption}</p>
      <button
        className="primary small"
        disabled={!running || graphics !== 'ready' || unfinishedInputs}
        onClick={captureResult}
      >
        Capture {spec.recipe === 'two-link-arm' ? 'endpoint' : 'assembly'}
      </button>
      <p className="explanation-help">
        {onRetainedCapture
          ? 'Capture sends parameters and camera to the app. Main recomputes the measurement before Practical can use it.'
          : 'Captures stay in this tool session. Closing the tool discards them; Reader and Canvas attachment is not available yet.'}
      </p>
      {capture && (
        <output className="explanation-capture">
          <strong>Captured · app-measured</strong>
          <span className="explanation-capture-description">
            {describeCapture(capture)}
          </span>
          <span>
            Session only · {new Date(capture.capturedAt).toLocaleTimeString()}
          </span>
        </output>
      )}
      <details className="explanation-provenance">
        <summary>Recipe and origin</summary>
        <p>
          Original Applied Research geometry · AI-assisted implementation ·
          bundled locally.
        </p>
        <p>
          {spec.recipe} · recipe v{spec.version} · {spec.assetVersion}
        </p>
        <p>Explanation {spec.id}</p>
        <p>
          {spec.origin
            ? `Project ${spec.origin.projectId} · source version ${spec.origin.sourceVersionId ?? 'none'} · question ${spec.origin.questionId ?? 'none'} · lesson ${spec.origin.lessonId ?? 'none'}`
            : 'Launched in Practical Work. No source or saved-question origin is attached.'}
        </p>
        {capture && (
          <pre aria-label="Captured scene record">
            {JSON.stringify(capture, null, 2)}
          </pre>
        )}
      </details>
    </section>
  );
}
export function ExplanationExperience(props: ExperienceProps): ReactElement {
  if (!isExplanationSpec(props.spec))
    return (
      <p role="alert">
        This explanation uses an unsupported recipe or invalid parameters.
        Continue with a text explanation or another practical tool.
      </p>
    );
  return <ValidExperience key={props.spec.id} {...props} />;
}
export function LocalExplanations({
  recipe,
}: {
  readonly recipe: RecipeId | null;
}): ReactElement | null {
  const [specs, setSpecs] = useState(() => ({
    'spatial-assembly': createExplanation('spatial-assembly'),
    'two-link-arm': createExplanation('two-link-arm'),
  }));
  return (
    <>
      {(['spatial-assembly', 'two-link-arm'] as const).map((id) => (
        <div key={id} hidden={recipe !== id}>
          <ExplanationExperience
            spec={specs[id]}
            active={recipe === id}
            onChange={(spec) =>
              setSpecs((previous) => ({ ...previous, [spec.recipe]: spec }))
            }
            onCapture={() => {}}
          />
        </div>
      ))}
    </>
  );
}
