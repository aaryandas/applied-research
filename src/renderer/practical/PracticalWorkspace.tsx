import { useEffect, useRef, useState, type ReactElement } from 'react';
import type {
  LoadPracticalJourneyResult,
  PracticalAttemptJourney,
  PracticalAttemptSelection,
  PracticalWorkspaceBridge,
} from '../../contracts/practical-records';
import {
  isRecordPracticalResultInput,
  type PracticalActivity,
} from '../../contracts/practical-work';
import { PracticalWork, type PracticalWorkProps } from './PracticalWork';

export interface PracticalWorkspaceProps extends Omit<
  PracticalWorkProps,
  | 'expectedRevision'
  | 'initialDraft'
  | 'returnedEvidence'
  | 'evidenceStatus'
  | 'selectFile'
  | 'recordPracticalResult'
  | 'journey'
  | 'attempts'
  | 'previewFile'
  | 'exportFile'
  | 'onRecordProgress'
  | 'onSaveHumanPlan'
  | 'attemptRevisions'
> {
  bridge: PracticalWorkspaceBridge;
  attemptSelection?: PracticalAttemptSelection;
  onJourney?: (journey: PracticalAttemptJourney, attemptId: string) => void;
}

/** Shell must flush before replacing scope, as with the existing PracticalWork mount. */
export function PracticalWorkspace(
  props: Readonly<PracticalWorkspaceProps>,
): ReactElement {
  return (
    <LoadPracticalWorkspace
      key={JSON.stringify([
        activityKey(props.activity),
        props.attemptId,
        props.attemptSelection ?? 'latest',
      ])}
      {...props}
    />
  );
}

function activityKey(activity: PracticalActivity | null): string {
  if (!activity) return '';
  const { path, sourceRevisionId, highlightId } = activity.origin;
  return JSON.stringify([
    activity.projectId,
    path.pathId,
    path.pathRevision,
    path.topicId,
    path.lessonId,
    sourceRevisionId,
    highlightId,
    activity.title,
    activity.instructions,
    activity.objective,
  ]);
}

function loadedForActivity(
  result: LoadPracticalJourneyResult,
  activity: PracticalActivity,
): LoadPracticalJourneyResult {
  if (result.status !== 'loaded' || result.attempt === null) return result;
  const attempt = result.attempt;
  if (
    !isRecordPracticalResultInput({
      activity: attempt.activity,
      attemptId: attempt.attemptId,
      expectedRevision: attempt.currentRevision,
      draft: attempt.draft,
    }) ||
    activityKey(attempt.activity) !== activityKey(activity)
  )
    return { status: 'failed' };
  return result;
}

function LoadPracticalWorkspace(
  props: Readonly<PracticalWorkspaceProps>,
): ReactElement {
  const [loaded, setLoaded] = useState<LoadPracticalJourneyResult | null>(null);
  const [retry, setRetry] = useState(0);
  const [activity] = useState(() =>
    props.activity ? structuredClone(props.activity) : null,
  );
  const [bridge] = useState(() => props.bridge);
  const [attemptSelection] = useState(() => props.attemptSelection ?? 'latest');
  const [seedAttemptId] = useState(() => props.attemptId);
  const onJourneyRef = useRef(props.onJourney);
  useEffect(() => {
    onJourneyRef.current = props.onJourney;
  });
  useEffect(
    () => () => {
      void bridge.cancelPracticalFileSelection().catch(() => {});
      void bridge.cancelPracticalExport().catch(() => {});
    },
    [bridge],
  );
  useEffect(() => {
    if (!activity) return;
    let mounted = true;
    const input =
      attemptSelection === 'exact'
        ? { activity, attemptId: seedAttemptId }
        : { activity };
    void bridge.loadPracticalJourney(input).then(
      (result) => {
        if (!mounted) return;
        const next = loadedForActivity(result, activity);
        setLoaded(next);
        if (next.status === 'loaded')
          onJourneyRef.current?.(
            next.journey,
            next.attempt?.attemptId ?? seedAttemptId,
          );
      },
      () => {
        if (mounted) setLoaded({ status: 'failed' });
      },
    );
    return () => {
      mounted = false;
    };
  }, [activity, attemptSelection, bridge, retry, seedAttemptId]);

  if (!activity || loaded === null)
    return (
      <PracticalWork
        activity={activity}
        attemptId={seedAttemptId}
        activityStatus={activity ? 'loading' : 'ready'}
        expectedRevision={0}
        returnedEvidence={[]}
        registerFlush={props.registerFlush}
        onReturnToLearning={props.onReturnToLearning}
        availableActivities={props.availableActivities}
        onSelectActivity={props.onSelectActivity}
      />
    );
  if (loaded.status === 'failed')
    return (
      <section className="practical-work" aria-label="Practical work">
        <h1 className="practical-heading">Practical work</h1>
        <p className="practical-copy" role="alert">
          This attempt could not be loaded. Your saved work has not been
          changed.
        </p>
        <button
          className="practical-button"
          type="button"
          onClick={() => {
            setLoaded(null);
            setRetry((value) => value + 1);
          }}
        >
          Retry loading
        </button>
      </section>
    );
  const attempt = loaded.attempt;
  const attemptId = attempt?.attemptId ?? seedAttemptId;
  const journey = loaded.journey;

  async function refreshJourney(): Promise<void> {
    if (!activity) return;
    const result = await bridge.loadPracticalJourney({ activity, attemptId });
    if (result.status !== 'loaded') return;
    setLoaded((current) =>
      current?.status === 'loaded'
        ? { ...result, attempt: current.attempt }
        : result,
    );
    onJourneyRef.current?.(
      result.journey,
      result.attempt?.attemptId ?? attemptId,
    );
  }

  return (
    <PracticalWork
      activity={activity}
      attemptId={attemptId}
      expectedRevision={attempt?.currentRevision ?? 0}
      {...(attempt ? { initialDraft: attempt.draft } : {})}
      returnedEvidence={attempt?.returnedEvidence ?? []}
      registerFlush={props.registerFlush}
      onReturnToLearning={props.onReturnToLearning}
      availableActivities={props.availableActivities}
      onSelectActivity={props.onSelectActivity}
      onResumeAttempt={props.onResumeAttempt}
      onStartNewAttempt={props.onStartNewAttempt}
      tool={props.tool}
      activityGuidance={props.activityGuidance}
      companionContext={props.companionContext}
      onRequestGuidance={props.onRequestGuidance}
      journey={journey}
      attempts={loaded.attempts}
      attemptRevisions={attempt?.revisions ?? []}
      recordPracticalResult={(input) => bridge.recordPracticalResult(input)}
      selectFile={async () => {
        const result = await bridge.selectPracticalFile({
          activity,
          attemptId,
        });
        if (result.status === 'failed')
          throw new Error('The file could not be returned.');
        return result.status === 'imported' ? result.file : null;
      }}
      previewFile={(selectionId) =>
        bridge.previewPracticalFile({ activity, attemptId, selectionId })
      }
      exportFile={async (selectionId) => {
        const result = await bridge.exportPracticalFile({
          activity,
          attemptId,
          selectionId,
        });
        if (result.status === 'failed')
          throw new Error('The exact file could not be exported.');
      }}
      onRecordProgress={async (input) => {
        const source = journey.brief
          ? {
              kind: 'accepted-brief' as const,
              briefRevision: journey.brief.briefRevision,
            }
          : {
              kind: 'human-plan' as const,
              planRevision: journey.humanPlanRevision,
            };
        const result = await bridge.recordPracticalProgress({
          activity,
          attemptId,
          expectedRevision: input.expectedRevision,
          checkpointId: input.checkpointId,
          source,
          status: input.status,
          note: input.note,
          evidence: input.evidenceSelectionId
            ? {
                kind: 'user-selected-file',
                selectionId: input.evidenceSelectionId,
              }
            : null,
        });
        if (result.status !== 'committed')
          throw new Error('Checkpoint progress could not be saved.');
        await refreshJourney();
      }}
      onSaveHumanPlan={async (plan) => {
        const result = await bridge.savePracticalHumanPlan({
          activity,
          attemptId,
          expectedRevision: journey.humanPlanRevision,
          plan,
        });
        if (result.status !== 'saved')
          throw new Error('The human plan could not be saved.');
        await refreshJourney();
      }}
    />
  );
}
