import { useEffect, useId, useRef, useState, type ReactElement } from 'react';
import type {
  CompanionContext,
  CompanionSession,
  CompanionState,
} from '../../contracts/companion';
import type {
  PracticalGuidanceRequest,
  PracticalTarget,
} from '../../contracts/practical-work';
import { Icon } from '../FieldAtlas';
import { attachPointerFollower } from './pointer-follower';
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

export interface CompanionProps {
  session: CompanionSession;
  state: CompanionState;
  /** Supply only a target whose producer can currently resolve the selected context. */
  selectedRequest: PracticalGuidanceRequest | null;
  unavailableMessage?: string;
  /** App-owned pointer surface only. Exclude the native guest rectangle. */
  pointerSurface: HTMLElement | null;
  /** Host parks the mark whenever its native guest obscures the pointer surface. */
  parkPointer?: boolean;
  /** App-owned semantic reveal/geometry adapter; absent means pointing unavailable. */
  targetRevealer?: CompanionTargetRevealer;
}

export function Companion({
  session,
  state,
  selectedRequest,
  unavailableMessage = 'Select an available activity target to ask about.',
  pointerSurface,
  parkPointer = false,
  targetRevealer,
}: CompanionProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [pointing, setPointing] = useState<CompanionPointingState>({
    status: 'idle',
  });
  const targetPointer = useRef<CompanionTargetPointer | null>(null);
  const pointingPhase = useRef<CompanionPointingState['status']>('idle');
  const command = useRef<HTMLButtonElement>(null);
  const ask = useRef<HTMLButtonElement>(null);
  const decoration = useRef<HTMLDivElement>(null);
  const focusAsk = useRef(false);
  const panelId = useId();
  const active = state.observation.status !== 'inactive';
  const busy = state.pending !== null || state.draining === true;
  const selectedLabel = selectedRequest
    ? TARGET_LABELS[selectedRequest.target.target]
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
    if (!targetRevealer) return;
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

  useEffect(() => () => targetPointer.current?.stop(), [selectedRequest]);

  function stopGuidance(): void {
    targetPointer.current?.stop();
    session.stop('user-stop');
    command.current?.focus();
  }

  // Stop is replay-safe in React StrictMode; the shell disposes its owned session.
  useEffect(() => () => session.stop('unmount'), [session]);

  const outcome = state.outcome;
  return (
    <section className="activity-companion" aria-label="Activity companion">
      <div
        ref={decoration}
        className="activity-companion-pointer"
        aria-hidden="true"
        style={{
          pointerEvents: 'none',
          visibility: pointing.status === 'pointing' ? 'hidden' : undefined,
        }}
      >
        <Icon name="companion" />
      </div>
      {pointing.status === 'pointing' && (
        <div
          className="activity-companion-target"
          aria-hidden="true"
          style={{
            left: pointing.bounds.x,
            top: pointing.bounds.y,
            width: pointing.bounds.width,
            height: pointing.bounds.height,
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
          pointing.status === 'revealing') && (
          <button type="button" onClick={() => targetPointer.current?.stop()}>
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
        {state.pending !== null && !active && (
          <button type="button" onClick={stopGuidance}>
            Cancel answer
          </button>
        )}
      </div>
      <p className="activity-companion-scope" role="status">
        {state.observation.status === 'inactive'
          ? 'Guidance is off.'
          : `${state.observation.status === 'starting' ? 'Starting' : 'Guiding'}: ${state.activity.activity.title} · ${TARGET_LABELS[state.observation.target.target]}${state.observation.toolSessionId ? ' · App tool controls on navigation; no page reads.' : ' · No tool observation.'}`}
      </p>
      {open && (
        <div
          id={panelId}
          className="activity-companion-panel"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              targetPointer.current?.stop();
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
                !selectedRequest ||
                !targetRevealer ||
                pointing.status === 'revealing'
              }
              onClick={() => {
                if (selectedRequest)
                  void targetPointer.current?.point(selectedRequest.target);
              }}
            >
              Show selected target
            </button>

            <button
              type="button"
              ref={ask}
              disabled={!selectedRequest || busy}
              onClick={() => {
                if (selectedRequest) void session.askOnce(selectedRequest);
              }}
            >
              Ask about selected target
            </button>
            <button
              type="button"
              disabled={!selectedRequest || busy || active}
              onClick={() => {
                if (selectedRequest)
                  void session.startActivity(selectedRequest);
              }}
            >
              Guide this activity
            </button>
          </div>
          <p className="activity-companion-pointing-status" role="status">
            {pointing.status === 'pointing'
              ? `Showing ${TARGET_LABELS[pointing.target.target]}.`
              : pointing.status === 'revealing'
                ? 'Revealing selected app target…'
                : 'message' in pointing
                  ? pointing.message
                  : !targetRevealer
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
                {state.draining
                  ? 'Stopping the previous request…'
                  : state.pending === 'resolving'
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
          </div>
        </div>
      )}
    </section>
  );
}
