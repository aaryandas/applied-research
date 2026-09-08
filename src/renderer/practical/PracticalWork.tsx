import {
  useEffect,
  useId,
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
  RecordPracticalResultInput,
  RegisterPracticalFlush,
  ReturnedPracticalEvidence,
  SelectedPracticalFile,
} from '../../contracts/practical-work';
import {
  createPracticalSaveSession,
  type PracticalSaveState,
} from './save-session';
import './practical.css';

export interface PracticalTool {
  label: string;
  embedded?: { open: () => Promise<void>; content: ReactNode };
  openExternal?: () => Promise<void>;
}

export interface PracticalWorkProps {
  activity: PracticalActivity | null;
  attemptId: string;
  initialDraft?: PracticalDraft;
  /** Revision of initialDraft; zero for a new empty attempt. */
  expectedRevision: number;
  returnedEvidence: readonly ReturnedPracticalEvidence[];
  tool?: PracticalTool;
  selectFile?: () => Promise<SelectedPracticalFile | null>;
  recordPracticalResult?: (
    input: RecordPracticalResultInput,
  ) => Promise<PracticalCommitResult>;
  registerFlush: RegisterPracticalFlush;
  onReturnToLearning: (activity: PracticalActivity) => void | Promise<void>;
  onRequestGuidance?: (request: PracticalGuidanceRequest) => void;
}

const EMPTY_DRAFT: PracticalDraft = {
  prediction: '',
  attempt: '',
  reportedResult: { kind: 'user-reported-text', text: '' },
  selectedEvidence: null,
  reflection: { authorKind: 'human', text: '' },
};
const SAVE_LABELS: Record<PracticalSaveState['status'], string> = {
  draft: 'Draft',
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
export function PracticalWork(props: PracticalWorkProps): ReactElement {
  if (!props.activity)
    return (
      <section className="practical-work" aria-label="Practical work">
        <h1>Practical work</h1>
        <p>
          Choose a lesson with an activity to begin. Its instructions and
          learning context will appear here.
        </p>
      </section>
    );
  return (
    <ActivityWork key={props.attemptId} {...props} activity={props.activity} />
  );
}

function ActivityWork(
  props: PracticalWorkProps & { activity: PracticalActivity },
): ReactElement {
  const id = useId();
  const [state, setState] = useState<PracticalSaveState>({
    draft: props.initialDraft ?? EMPTY_DRAFT,
    status: 'draft',
  });
  const [session] = useState(() =>
    createPracticalSaveSession({
      input: {
        activity: props.activity,
        attemptId: props.attemptId,
        expectedRevision: props.expectedRevision,
        draft: props.initialDraft ?? EMPTY_DRAFT,
      },
      ...(props.recordPracticalResult
        ? { commit: props.recordPracticalResult }
        : {}),
      onChange: setState,
    }),
  );
  const [files, setFiles] = useState<SelectedPracticalFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [embeddedOpen, setEmbeddedOpen] = useState(false);
  const pendingAction = useRef<Promise<void> | null>(null);
  useEffect(
    () =>
      props.registerFlush(async () => {
        await pendingAction.current;
        return session.flush();
      }),
    [props.registerFlush, session],
  );
  const update = (patch: Partial<PracticalDraft>): void =>
    session.update(patch);
  const evidence = [
    ...props.returnedEvidence,
    ...files.filter(
      (file) =>
        !props.returnedEvidence.some(
          (item) =>
            item.kind === 'user-selected-file' &&
            item.selectionId === file.selectionId,
        ),
    ),
  ];
  const selected = state.draft.selectedEvidence;
  const selectionAvailable =
    !selected ||
    evidence.some((item) =>
      item.kind === 'app-measured'
        ? selected.kind === item.kind && selected.captureId === item.captureId
        : selected.kind === item.kind &&
          selected.selectionId === item.selectionId,
    );

  function act(action: () => Promise<void>): Promise<void> {
    if (pendingAction.current) return pendingAction.current;
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
    return operation;
  }
  function guide(
    target: PracticalGuidanceRequest['target']['target'],
  ): ReactNode {
    if (!props.onRequestGuidance) return null;
    return (
      <button
        type="button"
        className="practical-guidance"
        onClick={() =>
          props.onRequestGuidance?.({
            trigger: 'explicit-action',
            target: {
              scope: 'applied-research',
              surface: 'practical-work',
              attemptId: props.attemptId,
              activity: props.activity,
              target,
            },
          })
        }
      >
        Ask about{' '}
        {target === 'activity-instructions'
          ? 'this activity'
          : target === 'tool-controls'
            ? 'this tool'
            : target === 'selected-result'
              ? 'this result'
              : 'my reflection'}
      </button>
    );
  }

  return (
    <section className="practical-work" aria-labelledby={`${id}-title`}>
      <header>
        <h1 id={`${id}-title`}>{props.activity.title}</h1>
        <p className="practical-objective">{props.activity.objective}</p>
      </header>
      <section
        data-practical-target="activity-instructions"
        aria-labelledby={`${id}-instructions`}
      >
        <h2 id={`${id}-instructions`}>The activity</h2>
        <p className="practical-instructions">{props.activity.instructions}</p>
        {guide('activity-instructions')}
      </section>
      <div className="practical-preparation">
        <label>
          Expected outcome
          <textarea
            value={state.draft.prediction}
            maxLength={12000}
            onChange={(event) => update({ prediction: event.target.value })}
          />
        </label>
        <label>
          What I’m trying
          <textarea
            value={state.draft.attempt}
            maxLength={12000}
            onChange={(event) => update({ attempt: event.target.value })}
          />
        </label>
      </div>
      <section
        data-practical-target="tool-controls"
        aria-labelledby={`${id}-tools`}
      >
        <h2 id={`${id}-tools`}>{props.tool?.label ?? 'Your tools'}</h2>
        <div className="practical-actions">
          {props.tool?.embedded && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act(async () => {
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
              type="button"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await props.tool?.openExternal?.();
                })
              }
            >
              Open externally
            </button>
          )}
          {guide('tool-controls')}
        </div>
        {!props.tool?.embedded && (
          <p className="practical-muted">
            No embedded tool is available for this activity. Work in your own
            tools and bring back a selected result.
          </p>
        )}
        {embeddedOpen && props.tool?.embedded?.content}
      </section>
      <section aria-labelledby={`${id}-result`}>
        <h2 id={`${id}-result`}>Observed result</h2>
        <label>
          What happened{' '}
          <span className="practical-provenance">User-reported</span>
          <textarea
            value={state.draft.reportedResult.text}
            maxLength={12000}
            onChange={(event) =>
              update({
                reportedResult: {
                  kind: 'user-reported-text',
                  text: event.target.value,
                },
              })
            }
          />
        </label>
        <fieldset data-practical-target="selected-result">
          <legend>Selected evidence</legend>
          <label className="practical-choice">
            <input
              type="radio"
              name={`${id}-evidence`}
              checked={selected === null}
              onChange={() => update({ selectedEvidence: null })}
            />
            No attached evidence
          </label>
          {evidence.map((item) => {
            const key =
              item.kind === 'app-measured' ? item.captureId : item.selectionId;
            const checked =
              item.kind === 'app-measured'
                ? selected?.kind === item.kind && selected.captureId === key
                : selected?.kind === item.kind && selected.selectionId === key;
            return (
              <label className="practical-choice" key={`${item.kind}-${key}`}>
                <input
                  type="radio"
                  name={`${id}-evidence`}
                  checked={checked}
                  onChange={() =>
                    update({
                      selectedEvidence:
                        item.kind === 'app-measured'
                          ? { kind: item.kind, captureId: key }
                          : { kind: item.kind, selectionId: key },
                    })
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
        {!selectionAvailable && (
          <p role="alert">
            The selected evidence is no longer available. Choose another result
            or remove the attachment.
          </p>
        )}
        <div className="practical-actions">
          {props.selectFile && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const file = await props.selectFile?.();
                  if (file) {
                    setFiles((previous) => [
                      ...previous.filter(
                        (item) => item.selectionId !== file.selectionId,
                      ),
                      file,
                    ]);
                    update({
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
          {selected && guide('selected-result')}
        </div>
        {!props.selectFile && (
          <p className="practical-muted">
            File import is unavailable. You can describe the result above.
          </p>
        )}
      </section>
      <section
        data-practical-target="reflection"
        aria-labelledby={`${id}-reflection`}
      >
        <h2 id={`${id}-reflection`}>My reflection</h2>
        <p className="practical-muted">
          How does the result compare with your prediction? What would you
          investigate next?
        </p>
        <label>
          Your interpretation{' '}
          <span className="practical-provenance">Human-authored</span>
          <textarea
            value={state.draft.reflection.text}
            maxLength={12000}
            onChange={(event) =>
              update({
                reflection: { authorKind: 'human', text: event.target.value },
              })
            }
          />
        </label>
        {guide('reflection')}
      </section>
      <footer>
        <p className="practical-muted">
          A working result is evidence of what happened. Understanding takes
          explanation and further checks.
        </p>
        <p role="status">{SAVE_LABELS[state.status]}</p>
        {!props.recordPracticalResult && (
          <p className="practical-muted">
            Saving is unavailable. This draft lasts while this activity stays
            open.
          </p>
        )}
        {message && <p role="alert">{message}</p>}
        <div className="practical-actions">
          <button
            type="button"
            disabled={
              !props.recordPracticalResult ||
              busy ||
              state.status === 'saving' ||
              !selectionAvailable
            }
            onClick={() => void session.flush()}
          >
            {state.status === 'failed' || state.status === 'cancelled'
              ? 'Retry save'
              : 'Save work'}
          </button>
          <button
            type="button"
            disabled={busy || !selectionAvailable}
            onClick={() =>
              void act(async () => {
                const result = await session.flush();
                if (result.status === 'ready')
                  await props.onReturnToLearning(props.activity);
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
