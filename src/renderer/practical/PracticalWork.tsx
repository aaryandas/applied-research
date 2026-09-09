import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import type {
  PracticalActivity,
  PracticalCommitResult,
  PracticalDraft,
  PracticalGuidanceRequest,
  PracticalTarget,
  RecordPracticalResultInput,
  RegisterPracticalFlush,
  ReturnedPracticalEvidence,
  SelectedPracticalFile,
} from '../../contracts/practical-work';
import type {
  PracticalAttemptJourney,
  PracticalAttemptRevision,
  PracticalAttemptSummary,
  PracticalFilePreviewResult,
  PracticalHumanPlan,
  PracticalMilestoneStatus,
  PracticalProgressSource,
} from '../../contracts/practical-records';
import {
  createPracticalSaveSession,
  type PracticalSaveState,
} from './save-session';
import {
  ActivityGuidanceControls,
  type PracticalActivityGuidance,
} from './ActivityGuidanceControls';
import { PracticalField } from './PracticalField';
import { ActivityChooser } from './ActivityChooser';
import { AttemptHistory } from './AttemptHistory';
import { ProjectBriefPanel } from './ProjectBriefPanel';
import { MilestoneList } from './MilestoneList';
import { EvidencePreview } from './EvidencePreview';
import { HumanPlanDraft } from './HumanPlanForm';
import { EMPTY_HUMAN_PLAN } from './human-plan';
import { projectPracticeCheckpoints } from '../../contracts/practical-brief';
import {
  createPracticalContextResolver,
  type PracticalContextRegistration,
} from './context-resolver';
import { exceedsPracticalFieldLimit } from './draft-limits';
import {
  evidenceReference,
  matchesReference,
  mergeEvidence,
  selectionIsAvailable,
  type PracticalEvidenceStatus,
} from './evidence';
import './practical.css';

export interface PracticalTool {
  label: string;
  embedded?: { open: () => Promise<void>; content: ReactNode };
  openExternal?: () => Promise<void>;
}

export interface PracticalWorkProps {
  activity: PracticalActivity | null;
  activityStatus?: 'loading' | 'ready' | 'unavailable';
  attemptId: string;
  initialDraft?: PracticalDraft;
  /** Revision of initialDraft; zero for a new empty attempt. */
  expectedRevision: number;
  /** Include all previously selected/imported metadata for this attempt. */
  returnedEvidence: readonly ReturnedPracticalEvidence[];
  evidenceStatus?: PracticalEvidenceStatus;
  tool?: PracticalTool;
  activityGuidance?: PracticalActivityGuidance;
  /** Stable mounted registration from the AR-25 requester; reads only on explicit resolution. */
  companionContext?: PracticalContextRegistration;
  selectFile?: () => Promise<SelectedPracticalFile | null>;
  recordPracticalResult?: (
    input: RecordPracticalResultInput,
  ) => Promise<PracticalCommitResult>;
  registerFlush: RegisterPracticalFlush;
  onReturnToLearning: (activity: PracticalActivity) => void | Promise<void>;
  onRequestGuidance?: (request: PracticalGuidanceRequest) => void;
  availableActivities?: readonly PracticalActivity[];
  onSelectActivity?: (activity: PracticalActivity) => void;
  journey?: PracticalAttemptJourney;
  attempts?: readonly PracticalAttemptSummary[];
  previewFile?: (selectionId: string) => Promise<PracticalFilePreviewResult>;
  exportFile?: (selectionId: string) => Promise<void>;
  onRecordProgress?: (input: {
    checkpointId: string;
    expectedRevision: number;
    status: PracticalMilestoneStatus;
    note: string;
    evidenceSelectionId: string | null;
  }) => Promise<void>;
  onSaveHumanPlan?: (plan: PracticalHumanPlan) => Promise<void>;
  onResumeAttempt?: (attemptId: string) => void;
  onStartNewAttempt?: () => void;
  attemptRevisions?: readonly PracticalAttemptRevision[];
}

const EMPTY_DRAFT: PracticalDraft = {
  prediction: '',
  attempt: '',
  reportedResult: { kind: 'user-reported-text', text: '' },
  selectedEvidence: null,
  reflection: { authorKind: 'human', text: '' },
};
const GUIDANCE_LABELS: Record<PracticalTarget['target'], string> = {
  'activity-instructions': 'Ask about this activity',
  'tool-controls': 'Ask about this tool',
  'selected-result': 'Ask about this result',
  reflection: 'Ask about my reflection',
};
const SAVE_LABELS: Record<PracticalSaveState['status'], string> = {
  draft: 'Draft',
  'too-long':
    'Your full draft is retained. Shorten the marked fields before saving.',
  saving: 'Saving…',
  saved: 'Saved',
  failed: 'Could not save. Your draft is here; try again.',
  cancelled: 'Save cancelled. Your draft is here; try again.',
  conflict:
    'A newer version was saved. Keep this draft and reopen the latest version before retrying.',
  unavailable:
    'Saving is unavailable. Keep this activity open to retain your draft.',
};

/** Mount per attempt. Shell must flush before changing any activity/attempt identity. */
export function PracticalWork(
  props: Readonly<PracticalWorkProps>,
): ReactElement {
  if (props.activityStatus === 'loading')
    return (
      <section
        className="practical-work"
        aria-label="Practical work"
        aria-busy="true"
      >
        <h1 className="practical-heading">Practical work</h1>
        <output className="practical-copy practical-status">
          Loading activity…
        </output>
      </section>
    );
  if (!props.activity || props.activityStatus === 'unavailable')
    return props.onSelectActivity ? (
      <ActivityChooser
        activities={props.availableActivities ?? []}
        onSelect={props.onSelectActivity}
      />
    ) : (
      <section className="practical-work" aria-label="Practical work">
        <h1 className="practical-heading">Practical work</h1>
        <p className="practical-copy">
          {props.activityStatus === 'unavailable'
            ? 'This activity could not be loaded. Reopen the lesson to try again.'
            : 'Choose a lesson with an activity to begin. Its instructions and learning context will appear here.'}
        </p>
      </section>
    );
  const { projectId, origin } = props.activity;
  const scopeKey = JSON.stringify([
    projectId,
    origin.path.pathId,
    origin.path.pathRevision,
    origin.path.topicId,
    origin.path.lessonId,
    origin.sourceRevisionId,
    origin.highlightId,
    props.attemptId,
  ]);
  return <ActivityWork key={scopeKey} {...props} activity={props.activity} />;
}

function milestoneProgressSource(
  journey: PracticalAttemptJourney | undefined,
): PracticalProgressSource | null {
  const brief = journey?.brief;
  if (brief)
    return {
      kind: 'accepted-brief',
      briefRevision: brief.briefRevision,
    };
  if (journey && journey.humanPlanRevision > 0)
    return {
      kind: 'human-plan',
      planRevision: journey.humanPlanRevision,
    };
  return null;
}

function ActivityWork(
  props: Readonly<PracticalWorkProps & { activity: PracticalActivity }>,
): ReactElement {
  const id = useId();
  const [activity] = useState(() => structuredClone(props.activity));
  const [state, setState] = useState<PracticalSaveState>(() => ({
    draft: structuredClone(props.initialDraft ?? EMPTY_DRAFT),
    status: 'draft',
  }));
  const [session] = useState(() =>
    createPracticalSaveSession({
      input: {
        activity,
        attemptId: props.attemptId,
        expectedRevision: props.expectedRevision,
        draft: structuredClone(props.initialDraft ?? EMPTY_DRAFT),
      },
      ...(props.recordPracticalResult
        ? { commit: props.recordPracticalResult }
        : {}),
      onChange: setState,
      evidence: {
        status: props.evidenceStatus ?? 'ready',
        items: props.returnedEvidence,
      },
    }),
  );
  const [files, setFiles] = useState<SelectedPracticalFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [embeddedOpen, setEmbeddedOpen] = useState(false);
  const pendingAction = useRef<Promise<void> | null>(null);
  const {
    registerFlush,
    evidenceStatus = 'ready',
    returnedEvidence,
    activityGuidance,
  } = props;
  const stopGuidance = activityGuidance?.stop;
  const { companionContext, attemptId } = props;
  useLayoutEffect(() => {
    if (!companionContext) return;
    const resolver = createPracticalContextResolver({
      ...companionContext,
      identity: { activity, attemptId },
      getSnapshot: session.getContextSnapshot,
    });
    const unregister = companionContext.registerResolver(
      resolver.resolveTarget,
    );
    return () => {
      resolver.dispose();
      unregister();
    };
  }, [activity, attemptId, session, companionContext]);
  useEffect(
    () => () => {
      void stopGuidance?.().catch(() => {});
    },
    [stopGuidance],
  );
  const evidence = mergeEvidence(returnedEvidence, files);
  useEffect(() => {
    session.setEvidence({
      status: evidenceStatus,
      items: mergeEvidence(returnedEvidence, files),
    });
  }, [session, evidenceStatus, returnedEvidence, files]);
  useEffect(
    () =>
      registerFlush(async () => {
        try {
          await stopGuidance?.();
        } catch {
          setMessage(
            'Guidance could not stop. Keep this activity open and try again.',
          );
          return { status: 'blocked', reason: 'failed' };
        }
        await pendingAction.current;
        return session.flush();
      }),
    [registerFlush, session, stopGuidance],
  );
  const selected = state.draft.selectedEvidence;
  const selectionAvailable = selectionIsAvailable(selected, {
    status: evidenceStatus,
    items: evidence,
  });
  const missingSelection = evidenceStatus === 'ready' && !selectionAvailable;
  const overLimit = exceedsPracticalFieldLimit(state.draft);
  const conflict = state.status === 'conflict';
  const canPersist = selectionAvailable && !overLimit && !conflict;
  const saveStatus =
    !props.recordPracticalResult && state.status !== 'conflict'
      ? 'Saving is unavailable. This draft lasts while this activity stays open.'
      : SAVE_LABELS[state.status];

  function runAction(action: () => Promise<void>): void {
    if (pendingAction.current) return;
    setBusy(true);
    setMessage('');
    const operation = action()
      .catch(() => {
        setMessage(
          'That action could not finish. Your draft is here; try again.',
        );
      })
      .finally(() => {
        pendingAction.current = null;
        setBusy(false);
      });
    pendingAction.current = operation;
  }
  function guidanceRequest(
    target: PracticalTarget['target'],
  ): PracticalGuidanceRequest {
    return {
      trigger: 'explicit-action',
      target: {
        scope: 'applied-research',
        surface: 'practical-work',
        attemptId: props.attemptId,
        activity: structuredClone(activity),
        target,
      },
    };
  }

  function guide(
    target: PracticalGuidanceRequest['target']['target'],
  ): ReactNode {
    if (!props.onRequestGuidance) return null;
    return (
      <button
        type="button"
        className="practical-button practical-guidance"
        onClick={() => props.onRequestGuidance?.(guidanceRequest(target))}
      >
        {GUIDANCE_LABELS[target]}
      </button>
    );
  }

  const selectedFiles = evidence.filter(
    (item): item is SelectedPracticalFile => item.kind === 'user-selected-file',
  );
  const brief = props.journey?.brief ?? null;
  const milestoneSource = milestoneProgressSource(props.journey);
  const checkpoints = brief
    ? projectPracticeCheckpoints(brief.brief)
    : (props.journey?.humanPlan?.milestones ?? []);

  function leaveAttempt(next: () => void): void {
    runAction(async () => {
      await stopGuidance?.();
      const result = await session.flush();
      if (result.status === 'ready') next();
    });
  }

  return (
    <section className="practical-work" aria-labelledby={`${id}-title`}>
      <header>
        <h1 className="practical-heading" id={`${id}-title`}>
          {activity.title}
        </h1>
      </header>
      <ProjectBriefPanel activity={activity} brief={brief} />
      {props.onResumeAttempt && props.onStartNewAttempt && (
        <AttemptHistory
          attempts={props.attempts ?? []}
          currentAttemptId={props.attemptId}
          revisions={(props.attemptRevisions ?? []).map((revision) => ({
            revision: revision.revision,
            recordedAt: revision.recordedAt,
          }))}
          onResume={(attemptId) =>
            leaveAttempt(() => props.onResumeAttempt?.(attemptId))
          }
          onStartNew={() => leaveAttempt(() => props.onStartNewAttempt?.())}
        />
      )}
      {milestoneSource && checkpoints.length > 0 ? (
        <MilestoneList
          checkpoints={checkpoints}
          source={milestoneSource}
          progress={props.journey?.milestones ?? []}
          evidence={selectedFiles}
          disabled={busy || conflict}
          onChange={(input) => {
            if (!props.onRecordProgress) return;
            void props
              .onRecordProgress(input)
              .catch(() =>
                setMessage(
                  'Checkpoint progress could not be saved. Your draft is here; try again.',
                ),
              );
          }}
        />
      ) : null}
      {!brief ? (
        <HumanPlanDraft
          key={props.journey?.humanPlanRevision ?? 0}
          initial={props.journey?.humanPlan ?? EMPTY_HUMAN_PLAN}
          disabled={busy || conflict}
          onSave={(plan) => {
            if (!props.onSaveHumanPlan) return;
            runAction(async () => {
              await props.onSaveHumanPlan?.(plan);
            });
          }}
        />
      ) : null}
      {props.previewFile && props.exportFile ? (
        <EvidencePreview
          files={selectedFiles}
          previewFile={props.previewFile}
          exportFile={props.exportFile}
          disabled={busy}
        />
      ) : null}
      <section
        className="practical-section"
        data-practical-target="activity-instructions"
        aria-labelledby={`${id}-instructions`}
      >
        <h2 className="practical-subheading" id={`${id}-instructions`}>
          The activity
        </h2>
        <p className="practical-copy practical-instructions">
          {activity.instructions}
        </p>
        {guide('activity-instructions')}
        <ActivityGuidanceControls
          status={activityGuidance?.status ?? 'unavailable'}
          busy={busy}
          onStart={() =>
            runAction(async () => {
              await activityGuidance?.start(
                guidanceRequest('activity-instructions'),
              );
            })
          }
          onStop={() => {
            if (!stopGuidance) return;
            void stopGuidance().catch(() =>
              setMessage(
                'Guidance could not stop. Keep this activity open and try again.',
              ),
            );
          }}
        />
      </section>
      <div className="practical-preparation">
        <PracticalField
          label="Expected outcome"
          value={state.draft.prediction}
          onChange={(prediction) => session.update({ prediction })}
        />
        <PracticalField
          label="What I’m trying"
          value={state.draft.attempt}
          onChange={(attempt) => session.update({ attempt })}
        />
      </div>
      <section
        className="practical-section"
        data-practical-target="tool-controls"
        aria-labelledby={`${id}-tools`}
      >
        <h2 className="practical-subheading" id={`${id}-tools`}>
          {props.tool?.label ?? 'Your tools'}
        </h2>
        <div className="practical-actions">
          {props.tool?.embedded && (
            <button
              className="practical-button"
              type="button"
              disabled={busy}
              onClick={() =>
                runAction(async () => {
                  await props.tool?.embedded?.open();
                  setEmbeddedOpen(true);
                })
              }
            >
              Open tool here
            </button>
          )}
          {props.tool?.openExternal && (
            <button
              className="practical-button"
              type="button"
              disabled={busy}
              onClick={() => {
                if (pendingAction.current) return;
                setBusy(true);
                setMessage('');
                void (async () => {
                  try {
                    await stopGuidance?.();
                    await props.tool?.openExternal?.();
                  } catch {
                    setMessage(
                      'That action could not finish. Your draft is here; try again.',
                    );
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              Open externally
            </button>
          )}
          {guide('tool-controls')}
        </div>
        {!props.tool?.embedded && (
          <p className="practical-copy practical-muted">
            No embedded tool is available for this activity. Work in your own
            tools and bring back a selected result.
          </p>
        )}
        {embeddedOpen && (
          <div className="practical-embedded">
            {props.tool?.embedded?.content}
          </div>
        )}
      </section>
      <section className="practical-section" aria-labelledby={`${id}-result`}>
        <h2 className="practical-subheading" id={`${id}-result`}>
          Observed result
        </h2>
        <PracticalField
          label="What happened"
          attribution="User-reported"
          value={state.draft.reportedResult.text}
          onChange={(text) =>
            session.update({
              reportedResult: { kind: 'user-reported-text', text },
            })
          }
        />
        {evidenceStatus === 'loading' && (
          <output className="practical-copy practical-status">
            Loading returned evidence…
          </output>
        )}
        {evidenceStatus === 'unavailable' && (
          <p className="practical-copy" role="alert">
            Returned evidence could not be loaded. Keep this draft open and
            reload the activity’s evidence before saving.
          </p>
        )}
        <fieldset
          className="practical-evidence"
          disabled={evidenceStatus !== 'ready'}
          aria-busy={evidenceStatus === 'loading'}
          data-practical-target="selected-result"
        >
          <legend>Selected evidence</legend>
          <label className="practical-choice">
            <input
              className="practical-radio"
              type="radio"
              name={`${id}-evidence`}
              checked={selected === null}
              onChange={() => session.update({ selectedEvidence: null })}
            />
            <span>No attached evidence</span>
          </label>
          {evidence.map((item) => {
            const reference = evidenceReference(item);
            const key =
              reference.kind === 'app-measured'
                ? reference.captureId
                : reference.selectionId;
            const checked = matchesReference(selected, item);
            return (
              <label className="practical-choice" key={`${item.kind}-${key}`}>
                <input
                  className="practical-radio"
                  type="radio"
                  name={`${id}-evidence`}
                  checked={checked}
                  onChange={() =>
                    session.update({ selectedEvidence: reference })
                  }
                />
                <span>
                  {item.kind === 'app-measured'
                    ? item.summary
                    : item.displayName}
                  <small>
                    {item.kind === 'app-measured'
                      ? 'App-measured · selected capture'
                      : 'User-selected file · contents not measured'}
                  </small>
                </span>
              </label>
            );
          })}
        </fieldset>
        {missingSelection && (
          <p className="practical-copy" role="alert">
            The selected evidence is no longer available. Choose another result
            or remove the attachment.
          </p>
        )}
        <div className="practical-actions">
          {props.selectFile && (
            <button
              className="practical-button"
              type="button"
              disabled={busy}
              onClick={() =>
                runAction(async () => {
                  const file = await props.selectFile?.();
                  if (file) {
                    session.addEvidence(file);
                    setFiles((previous) => [
                      ...previous.filter(
                        (item) =>
                          !matchesReference(evidenceReference(file), item),
                      ),
                      file,
                    ]);
                    session.update({
                      selectedEvidence: {
                        kind: 'user-selected-file',
                        selectionId: file.selectionId,
                      },
                    });
                  }
                })
              }
            >
              Select a result file
            </button>
          )}
          {(selected || state.draft.reportedResult.text.trim().length > 0) &&
            guide('selected-result')}
        </div>
        {!props.selectFile && (
          <p className="practical-copy practical-muted">
            File import is unavailable. You can describe the result above.
          </p>
        )}
      </section>
      <section
        className="practical-section"
        data-practical-target="reflection"
        aria-labelledby={`${id}-reflection`}
      >
        <h2 className="practical-subheading" id={`${id}-reflection`}>
          My reflection
        </h2>
        <p className="practical-copy practical-muted">
          How does the result compare with your prediction? What would you
          investigate next?
        </p>
        <PracticalField
          label="Your interpretation"
          attribution="Human-authored"
          value={state.draft.reflection.text}
          onChange={(text) =>
            session.update({ reflection: { authorKind: 'human', text } })
          }
        />
        {guide('reflection')}
      </section>
      <footer className="practical-footer">
        <p className="practical-copy practical-muted">
          A working result is evidence of what happened. Understanding takes
          explanation and further checks.
        </p>
        <output
          className="practical-copy practical-status"
          aria-label="Save status"
        >
          {saveStatus}
        </output>
        {message && (
          <p className="practical-copy" role="alert">
            {message}
          </p>
        )}
        <div className="practical-actions">
          <button
            className="practical-button"
            type="button"
            disabled={
              !props.recordPracticalResult ||
              busy ||
              state.status === 'saving' ||
              !canPersist
            }
            onClick={() => void session.flush()}
          >
            {state.status === 'failed' || state.status === 'cancelled'
              ? 'Retry save'
              : 'Save work'}
          </button>
          <button
            className="practical-button"
            type="button"
            disabled={busy || !canPersist}
            onClick={() =>
              runAction(async () => {
                await stopGuidance?.();
                const result = await session.flush();
                if (result.status === 'ready')
                  await props.onReturnToLearning(structuredClone(activity));
              })
            }
          >
            Return to learning
          </button>
        </div>
      </footer>
    </section>
  );
}
