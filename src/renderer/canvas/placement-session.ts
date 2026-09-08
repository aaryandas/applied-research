import type {
  CanvasView,
  LearningRecordsBridge,
  MoveLearningRecordInput,
} from '../../contracts/learning-records';
import type { CanvasMovementError } from './types';

type Position = Pick<MoveLearningRecordInput, 'x' | 'y'>;

export interface PlacementDraft {
  nodeId: string;
  input: MoveLearningRecordInput;
  savedPosition: Position;
  phase: 'moving' | 'saving' | 'failed' | 'saved';
  error: CanvasMovementError | null;
  generation: number;
}

interface PlacementChange {
  nodeId: string;
  input: MoveLearningRecordInput;
  savedPosition: Position;
}

interface PlacementSessionOptions {
  projectId: string;
  onMove: LearningRecordsBridge['moveLearningRecord'];
}

/** Project-owned placements survive view changes. A failed write requires a decision. */
export class PlacementSession {
  private snapshot: ReadonlyMap<string, PlacementDraft> = new Map();
  private readonly listeners = new Set<() => void>();
  private readonly queues = new Map<string, Promise<void>>();
  private onMove: LearningRecordsBridge['moveLearningRecord'];
  private readonly projectId: string;

  constructor({ projectId, onMove }: PlacementSessionOptions) {
    this.projectId = projectId;
    this.onMove = onMove;
  }

  setWriter(onMove: LearningRecordsBridge['moveLearningRecord']): void {
    this.onMove = onMove;
  }

  getSnapshot = (): ReadonlyMap<string, PlacementDraft> => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private publish(key: string, draft: PlacementDraft): void {
    this.snapshot = new Map(this.snapshot).set(key, draft);
    this.listeners.forEach((listener) => listener());
  }

  get(view: CanvasView, nodeId: string): PlacementDraft | undefined {
    return this.snapshot.get(`${view}:${nodeId}`);
  }

  stage({ nodeId, input, savedPosition }: PlacementChange): void {
    if (input.projectId !== this.projectId)
      throw new Error('This placement belongs to another project.');
    const key = `${input.view}:${nodeId}`;
    const previous = this.snapshot.get(key);
    this.publish(key, {
      nodeId,
      input: { ...input },
      savedPosition: { ...(previous?.savedPosition ?? savedPosition) },
      phase: 'moving',
      error: null,
      generation: (previous?.generation ?? 0) + 1,
    });
  }

  move(change: PlacementChange): void {
    this.stage(change);
    const key = `${change.input.view}:${change.nodeId}`;
    const draft = this.snapshot.get(key)!;
    this.enqueue(key, draft);
  }

  retry(view: CanvasView, nodeId: string): boolean {
    const key = `${view}:${nodeId}`;
    const draft = this.snapshot.get(key);
    if (draft?.phase !== 'failed' || this.queues.has(key)) return false;
    this.enqueue(key, { ...draft, generation: draft.generation + 1 });
    return true;
  }

  /** Refuse discard while a write/gesture is active; it cannot cancel a producer commit. */
  discard(view: CanvasView, nodeId: string): Position | null {
    const key = `${view}:${nodeId}`;
    const draft = this.snapshot.get(key);
    if (draft?.phase !== 'failed' || this.queues.has(key)) return null;
    const position = { ...draft.savedPosition };
    this.publish(key, {
      ...draft,
      input: { ...draft.input, ...position },
      phase: 'saved',
      error: null,
      generation: draft.generation + 1,
    });
    return position;
  }

  /** Drain writes, including moves queued during this wait. Never silently retry failures. */
  flush = async (): Promise<boolean> => {
    while (this.queues.size > 0) await Promise.all(this.queues.values());
    return [...this.snapshot.values()].every(
      (draft) => draft.phase === 'saved',
    );
  };

  private enqueue(key: string, draft: PlacementDraft): void {
    this.publish(key, { ...draft, phase: 'saving', error: null });
    const previous = this.queues.get(key) ?? Promise.resolve();
    const onMove = this.onMove;
    const pending = previous
      .then(async () => {
        try {
          await onMove({ ...draft.input });
          const current = this.snapshot.get(key)!;
          this.publish(key, {
            ...current,
            savedPosition: { x: draft.input.x, y: draft.input.y },
            ...(current.generation === draft.generation
              ? { phase: 'saved', error: null }
              : {}),
          });
        } catch {
          const current = this.snapshot.get(key)!;
          if (current.generation === draft.generation) {
            this.publish(key, {
              ...current,
              phase: 'failed',
              error: {
                code: 'placement-save-failed',
                input: { ...draft.input },
              },
            });
          }
        }
      })
      .finally(() => {
        if (this.queues.get(key) === pending) this.queues.delete(key);
      });
    this.queues.set(key, pending);
  }
}
