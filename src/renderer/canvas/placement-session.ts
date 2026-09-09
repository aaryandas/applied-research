import type {
  CanvasView,
  LearningRecordsBridge,
  LearningWorkspace,
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

  stage({ nodeId, input, savedPosition }: PlacementChange): PlacementDraft {
    if (input.projectId !== this.projectId)
      throw new Error('This placement belongs to another project.');
    const key = `${input.view}:${nodeId}`;
    const previous = this.snapshot.get(key);
    const draft: PlacementDraft = {
      nodeId,
      input: { ...input },
      savedPosition: { ...(previous?.savedPosition ?? savedPosition) },
      phase: 'moving',
      error: null,
      generation: (previous?.generation ?? 0) + 1,
    };
    this.publish(key, draft);
    return draft;
  }

  move(change: PlacementChange): void {
    const draft = this.stage(change);
    const key = `${change.input.view}:${change.nodeId}`;
    this.enqueue(key, draft);
  }

  /** Retire only acknowledged overlays that the owning workspace has caught up with. */
  reconcile(placements: LearningWorkspace['placements']): void {
    const next = new Map(this.snapshot);
    for (const [key, draft] of next) {
      if (draft.phase !== 'saved') continue;
      const acknowledged = placements.some(
        (placement) =>
          placement.projectId === this.projectId &&
          placement.view === draft.input.view &&
          placement.recordId === draft.input.recordId &&
          placement.x === draft.input.x &&
          placement.y === draft.input.y,
      );
      if (acknowledged) next.delete(key);
    }
    if (next.size === this.snapshot.size) return;
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }

  blockedNavigationNotice(): string {
    if ([...this.snapshot.values()].some((draft) => draft.phase === 'moving'))
      return 'Finish moving the node before leaving Canvas.';
    if ([...this.snapshot.values()].some((draft) => draft.phase === 'saving'))
      return 'Waiting for positions to finish saving before leaving Canvas.';
    if ([...this.snapshot.values()].some((draft) => draft.phase === 'failed'))
      return 'Retry the unsaved positions or restore their previous positions before leaving Canvas.';
    return '';
  }

  retry(view: CanvasView, nodeId: string): boolean {
    const key = `${view}:${nodeId}`;
    const draft = this.snapshot.get(key);
    if (draft?.phase !== 'failed' || this.queues.has(key)) return false;
    this.enqueue(key, { ...draft, generation: draft.generation + 1 });
    return true;
  }

  /**
   * Drop a failed overlay that never had an acknowledged position (initial
   * placement after a successful create). Does not write and cannot cancel an
   * in-flight producer commit.
   */
  abandon(view: CanvasView, nodeId: string): boolean {
    const key = `${view}:${nodeId}`;
    const draft = this.snapshot.get(key);
    if (draft?.phase !== 'failed' || this.queues.has(key)) return false;
    const next = new Map(this.snapshot);
    next.delete(key);
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
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
