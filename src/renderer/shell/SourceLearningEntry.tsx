import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { SourceDesktopBridge } from '../../contracts/source-desktop';
import type {
  LearningRecordsBridge,
  LearningWorkspace,
} from '../../contracts/learning-records';

interface SourceLearningEntryProps {
  projectId: string;
  bridge: Pick<
    SourceDesktopBridge,
    'generateSourcedLearning' | 'cancelSourceOperation'
  > &
    Pick<LearningRecordsBridge, 'getLearningWorkspace'>;
  flush(): Promise<boolean>;
  onSaved(workspace: LearningWorkspace, pathId: string): void;
}
/** The explicit action authorizes bounded evidence acquisition for this project's goal. */
export function SourceLearningEntry(
  props: Readonly<SourceLearningEntryProps>,
): ReactElement {
  const lifetime = useRef<{ active: boolean; requestId: string | null }>({
    active: true,
    requestId: null,
  });
  const [bridge] = useState(() => props.bridge);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const current = lifetime.current;
    current.active = true;
    return () => {
      current.active = false;
      if (current.requestId)
        void bridge.cancelSourceOperation({
          projectId: props.projectId,
          requestId: current.requestId,
        });
    };
  }, [lifetime, bridge, props.projectId]);
  async function generate(): Promise<void> {
    if (lifetime.current.requestId) return;
    const requestId = crypto.randomUUID();
    lifetime.current.requestId = requestId;
    setPending(true);
    setMessage('');
    try {
      if (!(await props.flush()) || !lifetime.current.active) return;
      const result = await bridge.generateSourcedLearning({
        projectId: props.projectId,
        requestId,
        consent: 'acquire-learning-evidence',
      });
      if (!lifetime.current.active || lifetime.current.requestId !== requestId)
        return;
      if (result.requestId !== requestId) {
        setMessage('The response no longer matches this request. Try again.');
        return;
      }
      if (result.outcome !== 'saved') {
        setMessage(
          result.outcome === 'coverage-pending'
            ? 'There is not enough supported evidence for a learning path yet.'
            : 'The sourced learning path is unavailable. Your saved work is unchanged.',
        );
        return;
      }
      const workspace = await bridge.getLearningWorkspace(props.projectId);
      if (lifetime.current.active && workspace.project.id === props.projectId)
        props.onSaved(workspace, result.pathId);
    } catch {
      if (lifetime.current.active)
        setMessage(
          'The learning path could not be saved. Your work is still here.',
        );
    } finally {
      if (lifetime.current.active && lifetime.current.requestId === requestId) {
        lifetime.current.requestId = null;
        setPending(false);
      }
    }
  }
  function cancel(): void {
    const requestId = lifetime.current.requestId;
    lifetime.current.requestId = null;
    if (requestId)
      void bridge.cancelSourceOperation({
        projectId: props.projectId,
        requestId,
      });
    setPending(false);
    setMessage('Generation cancelled. Already saved work is retained.');
  }
  return (
    <section aria-label="Sourced learning path">
      <p>
        Acquire permitted evidence for this goal and build a supported first
        lesson.
      </p>
      <button disabled={pending} onClick={() => void generate()}>
        Build path using acquired evidence
      </button>
      {pending && <button onClick={cancel}>Cancel path generation</button>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
