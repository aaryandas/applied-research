import { useEffect, useState, type ReactElement } from 'react';
import type {
  LoadPracticalAttemptResult,
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
> {
  bridge: PracticalWorkspaceBridge;
}

/** Shell must flush before replacing scope, as with the existing PracticalWork mount. */
export function PracticalWorkspace(
  props: Readonly<PracticalWorkspaceProps>,
): ReactElement {
  return (
    <LoadPracticalWorkspace
      key={JSON.stringify([activityKey(props.activity), props.attemptId])}
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
  result: LoadPracticalAttemptResult,
  activity: PracticalActivity,
): LoadPracticalAttemptResult {
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
  const [loaded, setLoaded] = useState<LoadPracticalAttemptResult | null>(null);
  const [retry, setRetry] = useState(0);
  const [activity] = useState(() =>
    props.activity ? structuredClone(props.activity) : null,
  );
  const [bridge] = useState(() => props.bridge);
  useEffect(
    () => () => {
      // Native main also revokes on window/project disposal; this covers unexpected UI disposal.
      void bridge.cancelPracticalFileSelection().catch(() => {});
    },
    [bridge],
  );
  useEffect(() => {
    if (!activity) return;
    let mounted = true;
    void bridge.loadPracticalAttempt({ activity }).then(
      (result) => {
        if (mounted) setLoaded(loadedForActivity(result, activity));
      },
      () => {
        if (mounted) setLoaded({ status: 'failed' });
      },
    );
    return () => {
      mounted = false;
    };
  }, [activity, bridge, retry]);

  if (!activity || loaded === null)
    return (
      <PracticalWork
        {...props}
        activity={activity}
        activityStatus={activity ? 'loading' : 'ready'}
        expectedRevision={0}
        returnedEvidence={[]}
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
  const attemptId = attempt?.attemptId ?? props.attemptId;
  return (
    <PracticalWork
      {...props}
      activity={activity}
      attemptId={attemptId}
      expectedRevision={attempt?.currentRevision ?? 0}
      {...(attempt ? { initialDraft: attempt.draft } : {})}
      returnedEvidence={attempt?.returnedEvidence ?? []}
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
    />
  );
}
