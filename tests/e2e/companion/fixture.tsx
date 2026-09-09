import { useEffect, useRef, useState, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { CompanionState } from '../../../src/contracts/companion';
import type { PracticalGuidanceRequest } from '../../../src/contracts/practical-work';
import { Companion } from '../../../src/renderer/companion/Companion';
import { answeredGuidance } from '../../../src/renderer/companion/guidance-test-answer';
import { createCompanionRequester } from '../../../src/renderer/companion/requester';
import { ThemeButton } from '../../../src/renderer/FieldAtlas';
import '../../../src/renderer/styles.css';
import './fixture.css';

const request: PracticalGuidanceRequest = {
  trigger: 'explicit-action',
  target: {
    scope: 'applied-research',
    surface: 'practical-work',
    attemptId: 'synthetic-attempt',
    target: 'reflection',
    activity: {
      projectId: 'synthetic-project',
      title: 'Compare two rotations',
      objective: 'Explain why order matters',
      instructions: 'Reverse the order and compare.',
      origin: {
        path: {
          pathId: 'synthetic-path',
          pathRevision: 1,
          topicId: 'synthetic-topic',
          lessonId: 'synthetic-lesson',
        },
      },
    },
  },
};

function Fixture(): ReactElement {
  const draft = useRef(
    '  My prediction: order matters.\nI want to test this.  ',
  );
  const [state, setState] = useState<CompanionState | null>(null);
  const [surface, setSurface] = useState<HTMLElement | null>(null);
  const [reads, setReads] = useState(0);
  const [requests, setRequests] = useState(0);
  const [mode, setMode] = useState('answer');
  const [available, setAvailable] = useState(true);
  const [parked, setParked] = useState(false);
  const [longTitle, setLongTitle] = useState(false);
  const replyMode = useRef(mode);
  replyMode.current = mode;
  const [requester] = useState(() =>
    createCompanionRequester({
      ...request.target,
      onStateChange: setState,
      now: () => performance.now(),
      createRequestId: () => crypto.randomUUID(),
      requestGuidance: async (input, signal) => {
        setRequests((count) => count + 1);
        if (replyMode.current === 'pending') {
          await new Promise<void>((resolve) =>
            signal.addEventListener('abort', () => resolve(), { once: true }),
          );
          return { status: 'cancelled', message: 'Answer cancelled.' };
        }
        if (replyMode.current === 'offline')
          return {
            status: 'offline',
            message:
              'Guidance is offline. Your writing stays here; ask again when connected.',
          };
        if (replyMode.current === 'error')
          throw new Error('Synthetic transport failure');
        return answeredGuidance(
          `Which rotation changed the final direction? Compare that with your prediction.\n\nSelected human writing:\n${input.context.target === 'reflection' ? input.context.text : ''}`,
        );
      },
    }),
  );
  useEffect(() => {
    if (!available) return;
    return requester.registerResolver(async (selected) => {
      setReads((count) => count + 1);
      return {
        status: 'available',
        requestedTarget: selected.target,
        context: {
          target: 'reflection',
          authorKind: 'human',
          text: draft.current,
          version: { kind: 'unsaved-draft', lastAcknowledgedRevision: null },
        },
      };
    });
  }, [available, requester]);
  useEffect(() => () => requester.dispose(), [requester]);
  const current = state ?? requester.session.getState();
  // Stress only displayed scope; synthetic adapter identity is unchanged.
  const displayed = longTitle
    ? {
        ...current,
        activity: {
          ...current.activity,
          activity: {
            ...current.activity.activity,
            title: 'Rotation'.repeat(100),
          },
        },
      }
    : current;
  return (
    <main ref={setSurface} className="companion-fixture">
      <header>
        <p>Consumer verification · synthetic adapters</p>
        <ThemeButton />
      </header>
      <h1>Compare two rotations</h1>
      <p>
        Change the order. Keep your prediction, result and explanation distinct.
      </p>
      <label htmlFor="reflection">Your reflection</label>
      <textarea
        id="reflection"
        defaultValue={draft.current}
        onChange={(event) => {
          draft.current = event.target.value;
        }}
      />
      <Companion
        session={requester.session}
        state={displayed}
        selectedRequest={available ? request : null}
        pointerSurface={surface}
        parkPointer={parked}
      />
      <aside aria-label="Synthetic adapter controls">
        <label>
          Response{' '}
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value)}
          >
            <option value="answer">Answer</option>
            <option value="pending">Pending</option>
            <option value="offline">Offline</option>
            <option value="error">Error</option>
          </select>
        </label>
        <button type="button" onClick={() => setAvailable(!available)}>
          {available ? 'Remove resolver' : 'Mount resolver'}
        </button>
        <button type="button" onClick={() => setParked(!parked)}>
          Toggle guest parking
        </button>
        <button type="button" onClick={() => setLongTitle(!longTitle)}>
          Toggle long title
        </button>
        <output aria-label="Context reads">{reads}</output>
        <output aria-label="Guidance requests">{requests}</output>
      </aside>
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing fixture root');
createRoot(root).render(<Fixture />);
