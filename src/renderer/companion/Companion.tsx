import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from 'react';
import type {
  CompanionContext,
  CompanionSession,
  CompanionState,
} from '../../contracts/companion';
import type {
  CompanionGuidanceReply,
  CompanionSelectedTarget,
} from '../../contracts/companion-guidance';
import type {
  PracticalGuidanceRequest,
  PracticalTarget,
} from '../../contracts/practical-work';
import { Icon } from '../FieldAtlas';
import type { CompanionGuidanceController } from './guidance-adapter';
import { attachPointerFollower } from './pointer-follower';
import {
  createCompanionSelectionPointer,
  type CompanionPointingSelectionState,
  type CompanionSelectionRevealer,
} from './reveal-registry';
import {
  createCompanionTargetPointer,
  type CompanionPointingState,
  type CompanionTargetPointer,
  type CompanionTargetRevealer,
} from './target-pointer';
import './companion.css';

const TARGET_LABELS: Record<PracticalTarget['target'], string> = {
  'activity-instructions': 'Activity instructions',
  'tool-controls': 'Tool controls',
  'selected-result': 'Selected result',
  reflection: 'Your reflection',
};

function contextAttribution(context: CompanionContext): string {
  if (context.target === 'reflection')
    return ` · ${context.version.kind === 'saved' ? 'Saved human reflection' : 'Unsaved human reflection'}`;
  if (
    context.target === 'selected-result' &&
    context.result.kind === 'user-reported-text'
  )
    return ` · ${context.result.version.kind === 'saved' ? 'Saved' : 'Unsaved'} human-reported result`;
  if (
    context.target === 'selected-result' &&
    context.result.kind === 'trusted-selected-evidence'
  )
    return context.result.reference.kind === 'app-measured'
      ? ' · App-measured result'
      : ' · Imported result';
  return '';
}

function workspaceLabel(target: CompanionSelectedTarget): string {
  if (target.surface === 'practical-work') return TARGET_LABELS[target.target];
  switch (target.target.kind) {
    case 'selected-source-highlight':
      return 'Selected source passage';
    case 'saved-question':
      return 'Saved question';
    case 'selected-graph-record':
      return 'Selected canvas record';
  }
}

function provenanceLabel(reply: CompanionGuidanceReply): string {
  if (reply.outcome !== 'success') return '';
  return ` · ${reply.provenance.provider} · ${reply.provenance.model}`;
}

export interface CompanionProps {
  session?: CompanionSession;
  state?: CompanionState;
  /** Supply only a target whose producer can currently resolve the selected context. */
  selectedRequest: PracticalGuidanceRequest | null;
  unavailableMessage?: string;
  /** App-owned pointer surface only. Exclude the native guest rectangle. */
  pointerSurface: HTMLElement | null;
  /** Host parks the mark whenever its native guest obscures the pointer surface. */
  parkPointer?: boolean;
  /** App-owned semantic reveal/geometry adapter; absent means pointing unavailable. */
  targetRevealer?: CompanionTargetRevealer;
  /** AR53 serializable guidance host for Reader/Canvas and authenticated Practical asks. */
  guidanceHost?: CompanionGuidanceController;
  workspaceSelection?: CompanionSelectedTarget | null;
  selectionRevealer?: CompanionSelectionRevealer;
}

export function Companion({
  session,
  state,
  selectedRequest,
  unavailableMessage = 'Select an available activity target to ask about.',
  pointerSurface,
  parkPointer = false,
  targetRevealer,
  guidanceHost,
  workspaceSelection = null,
  selectionRevealer,
}: CompanionProps): ReactElement {
  const subscribeHost = useCallback(
    (listener: () => void) =>
      guidanceHost ? guidanceHost.subscribe(listener) : () => undefined,
    [guidanceHost],
  );
  const getHostState = useCallback(
    () => guidanceHost?.getState() ?? null,
    [guidanceHost],
  );
  const hostState = useSyncExternalStore(
    subscribeHost,
    getHostState,
    getHostState,
  );
  const [open, setOpen] = useState(false);
  const [pointing, setPointing] = useState<CompanionPointingState>({
    status: 'idle',
  });
  const [workspacePointing, setWorkspacePointing] =
    useState<CompanionPointingSelectionState>({ status: 'idle' });
  const targetPointer = useRef<CompanionTargetPointer | null>(null);
  const workspacePointer = useRef<ReturnType<
    typeof createCompanionSelectionPointer
  > | null>(null);
  const pointingPhase = useRef<CompanionPointingState['status']>('idle');
  const command = useRef<HTMLButtonElement>(null);
  const ask = useRef<HTMLButtonElement>(null);
  const decoration = useRef<HTMLDivElement>(null);
  const focusAsk = useRef(false);
  const panelId = useId();
  const observation = state?.observation ?? {
    status: 'inactive',
    reason: null,
  };
  const active =
    observation.status !== 'inactive' || hostState?.activity === 'active';
  const busy =
    state?.pending != null ||
    state?.draining === true ||
    hostState?.pending != null ||
    hostState?.draining === true;
  const selectedLabel = selectedRequest
    ? TARGET_LABELS[selectedRequest.target.target]
    : workspaceSelection
      ? workspaceLabel(workspaceSelection)
      : null;

  useEffect(() => {
    const element = decoration.current;
    if (!element || !pointerSurface || parkPointer) return;
    return attachPointerFollower({
      surface: pointerSurface,
      decoration: element,
      viewport: window,
    });
  }, [pointerSurface, parkPointer]);

  useEffect(() => {
    if (open && focusAsk.current) {
      (ask.current?.disabled ? command.current : ask.current)?.focus();
      focusAsk.current = false;
    }
  }, [open]);

  useEffect(() => {
    function shortcut(event: KeyboardEvent): void {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'j' &&
        !event.repeat
      ) {
        event.preventDefault();
        focusAsk.current = true;
        setOpen(true);
        if (open)
          (ask.current?.disabled ? command.current : ask.current)?.focus();
      }
    }
    pointerSurface?.addEventListener('keydown', shortcut);
    return () => pointerSurface?.removeEventListener('keydown', shortcut);
  }, [pointerSurface, open]);

  useEffect(() => {
    if (!targetRevealer || !session) return;
    const pointer = createCompanionTargetPointer({
      identity: session.getState().activity,
      revealer: targetRevealer,
      viewport: () => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }),
      onStateChange: (next) => {
        pointingPhase.current = next.status;
        setPointing(next);
      },
    });
    targetPointer.current = pointer;
    const clear = (): void => pointer.stop();
    window.addEventListener('resize', clear);
    // The producer waits for its own instant reveal scroll to settle before measuring.
    const clearOnScroll = (): void => {
      if (pointingPhase.current !== 'revealing') pointer.stop();
    };
    window.addEventListener('scroll', clearOnScroll, true);
    window.addEventListener('blur', clear);
    return () => {
      pointer.dispose();
      targetPointer.current = null;
      window.removeEventListener('resize', clear);
      window.removeEventListener('scroll', clearOnScroll, true);
      window.removeEventListener('blur', clear);
    };
  }, [session, targetRevealer]);

  useEffect(() => {
    if (!selectionRevealer) return;
    const pointer = createCompanionSelectionPointer({
      revealer: selectionRevealer,
      viewport: () => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }),
      onStateChange: setWorkspacePointing,
    });
    workspacePointer.current = pointer;
    const clear = (): void => pointer.stop();
    window.addEventListener('resize', clear);
    window.addEventListener('blur', clear);
    return () => {
      pointer.dispose();
      workspacePointer.current = null;
      window.removeEventListener('resize', clear);
      window.removeEventListener('blur', clear);
    };
  }, [selectionRevealer]);

  useEffect(() => () => targetPointer.current?.stop(), [selectedRequest]);
  useEffect(() => () => workspacePointer.current?.stop(), [workspaceSelection]);

  function stopGuidance(): void {
    targetPointer.current?.stop();
    workspacePointer.current?.stop();
    session?.stop('user-stop');
    guidanceHost?.stop();
    command.current?.focus();
  }

  // Stop is replay-safe in React StrictMode; the shell disposes its owned session.
  useEffect(() => () => session?.stop('unmount'), [session]);

  const outcome = state?.outcome ?? null;
  const hostReply = hostState?.reply ?? null;
  const outline =
    pointing.status === 'pointing'
      ? pointing.bounds
      : workspacePointing.status === 'pointing'
        ? workspacePointing.bounds
        : null;
  const showPracticalReveal = Boolean(selectedRequest && targetRevealer);
  const showWorkspaceReveal = Boolean(workspaceSelection && selectionRevealer);
  const canAskPractical = Boolean(selectedRequest && session);
  const canAskWorkspace = Boolean(workspaceSelection && guidanceHost);
  return (
    <section className="activity-companion" aria-label="Activity companion">
      <div
        ref={decoration}
        className="activity-companion-pointer"
        aria-hidden="true"
        style={{
          pointerEvents: 'none',
          visibility: outline ? 'hidden' : undefined,
        }}
      >
        <Icon name="companion" />
      </div>
      {outline && (
        <div
          className="activity-companion-target"
          aria-hidden="true"
          style={{
            left: outline.x,
            top: outline.y,
            width: outline.width,
            height: outline.height,
            pointerEvents: 'none',
          }}
        >
          <Icon name="companion" />
        </div>
      )}
      <div className="activity-companion-toolbar">
        <button
          type="button"
          ref={command}
          className="activity-companion-command"
          aria-expanded={open}
          aria-controls={panelId}
          aria-keyshortcuts="Meta+J Control+J"
          onClick={() => setOpen(!open)}
        >
          <Icon name="companion" /> Companion
        </button>
        {(pointing.status === 'pointing' ||
          pointing.status === 'revealing' ||
          workspacePointing.status === 'pointing' ||
          workspacePointing.status === 'revealing') && (
          <button
            type="button"
            onClick={() => {
              targetPointer.current?.stop();
              workspacePointer.current?.stop();
            }}
          >
            Hide target
          </button>
        )}
        {active && (
          <button
            type="button"
            className="activity-companion-stop"
            onClick={stopGuidance}
          >
            Stop guidance
          </button>
        )}
        {(state?.pending != null || hostState?.pending != null) && !active && (
          <button type="button" onClick={stopGuidance}>
            Cancel answer
          </button>
        )}
      </div>
      <p className="activity-companion-scope" role="status">
        {observation.status === 'inactive' && hostState?.activity !== 'active'
          ? 'Guidance is off.'
          : observation.status !== 'inactive'
            ? `${observation.status === 'starting' ? 'Starting' : 'Guiding'}: ${state?.activity.activity.title ?? ''} · ${TARGET_LABELS[observation.target.target]}${observation.toolSessionId ? ' · App tool controls on navigation; no page reads.' : ' · No tool observation.'}`
            : `Guiding: ${workspaceSelection ? workspaceLabel(workspaceSelection) : 'selected material'}`}
      </p>
      {open && (
        <div
          id={panelId}
          className="activity-companion-panel"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              targetPointer.current?.stop();
              workspacePointer.current?.stop();
              event.stopPropagation();
              setOpen(false);
              command.current?.focus();
            }
          }}
        >
          <p className="activity-companion-selection">
            {selectedLabel ?? unavailableMessage}
          </p>
          <div className="activity-companion-actions">
            <button
              type="button"
              disabled={
                (!showPracticalReveal && !showWorkspaceReveal) ||
                pointing.status === 'revealing' ||
                workspacePointing.status === 'revealing'
              }
              onClick={() => {
                if (selectedRequest)
                  void targetPointer.current?.point(selectedRequest.target);
                else if (workspaceSelection)
                  void workspacePointer.current?.point(workspaceSelection);
              }}
            >
              Show selected target
            </button>

            <button
              type="button"
              ref={ask}
              disabled={(!canAskPractical && !canAskWorkspace) || busy}
              onClick={() => {
                if (selectedRequest && session)
                  void session.askOnce(selectedRequest);
                else if (workspaceSelection && guidanceHost) {
                  guidanceHost.setSelection(workspaceSelection);
                  guidanceHost.setUtterance({
                    kind: 'app-authored-intent',
                    intent: 'ask-about-selection',
                  });
                  void guidanceHost.askOnce('ask-once');
                }
              }}
            >
              Ask about selected target
            </button>
            {workspaceSelection?.surface !== 'practical-work' &&
              workspaceSelection?.target.kind ===
                'selected-source-highlight' && (
                <button
                  type="button"
                  disabled={!canAskWorkspace || busy}
                  onClick={() => {
                    if (!guidanceHost || !workspaceSelection) return;
                    guidanceHost.setSelection(workspaceSelection);
                    guidanceHost.setUtterance({
                      kind: 'app-authored-intent',
                      intent: 'explain-this-passage',
                    });
                    void guidanceHost.askOnce('ask-once');
                  }}
                >
                  Explain this passage
                </button>
              )}
            <button
              type="button"
              disabled={
                (!canAskPractical && !canAskWorkspace) || busy || active
              }
              onClick={() => {
                if (selectedRequest && session)
                  void session.startActivity(selectedRequest);
                else if (workspaceSelection && guidanceHost) {
                  guidanceHost.setSelection(workspaceSelection);
                  void guidanceHost.startActivity();
                }
              }}
            >
              Guide this activity
            </button>
          </div>
          <p className="activity-companion-pointing-status" role="status">
            {pointing.status === 'pointing'
              ? `Showing ${TARGET_LABELS[pointing.target.target]}.`
              : workspacePointing.status === 'pointing'
                ? `Showing ${workspaceLabel(workspacePointing.target)}.`
                : pointing.status === 'revealing' ||
                    workspacePointing.status === 'revealing'
                  ? 'Revealing selected app target…'
                  : 'message' in pointing
                    ? pointing.message
                    : 'message' in workspacePointing
                      ? workspacePointing.message
                      : !targetRevealer && !selectionRevealer
                        ? 'Target reveal is unavailable.'
                        : ''}
          </p>
          <div
            className="activity-companion-response"
            aria-live="polite"
            aria-busy={busy}
          >
            {busy && (
              <p>
                {state?.draining || hostState?.draining
                  ? 'Stopping the previous request…'
                  : state?.pending === 'resolving'
                    ? 'Reading the selected context…'
                    : 'Asking for guidance…'}
              </p>
            )}
            {outcome?.status === 'answered' && (
              <>
                <p className="activity-companion-attribution">
                  AI guidance · {TARGET_LABELS[outcome.requestedTarget.target]}
                  {contextAttribution(outcome.context)}
                </p>
                <p className="activity-companion-answer">{outcome.text}</p>
              </>
            )}
            {outcome &&
              outcome.status !== 'answered' &&
              outcome.status !== 'ignored' && <p>{outcome.message}</p>}
            {hostReply?.outcome === 'success' && !outcome && (
              <>
                <p className="activity-companion-attribution">
                  AI guidance
                  {workspaceSelection
                    ? ` · ${workspaceLabel(workspaceSelection)}`
                    : ''}
                  {provenanceLabel(hostReply)}
                </p>
                <p className="activity-companion-answer">{hostReply.text}</p>
              </>
            )}
            {hostReply && hostReply.outcome !== 'success' && !outcome && (
              <p>{hostReply.message}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
