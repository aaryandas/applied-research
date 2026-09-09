import type {
  CanvasView,
  EntryRevisionReference,
  LearningOrigin,
  LearningRecordsBridge,
  LearningWorkspace,
} from '../../contracts/learning-records';

export interface CanvasShellControls {
  view: CanvasView;
  onViewChange: (view: CanvasView) => void;
  fitMap: () => void;
}

/** Named writers Canvas may use. Movement stays on onMove. */
export type CanvasRecordsWriter = Pick<
  LearningRecordsBridge,
  'saveReadingNote' | 'saveQuestion' | 'saveInsight' | 'getLearningWorkspace'
>;

export interface WorkspaceCanvasProps {
  workspace: LearningWorkspace;
  view: CanvasView;
  onViewChange: (view: CanvasView) => void;
  onOpenOrigin: (origin: LearningOrigin) => void;
  onEditEntry: (entry: EntryRevisionReference) => void;
  onMove: LearningRecordsBridge['moveLearningRecord'];
  /** Shell awaits true before navigation/project replacement; false keeps Canvas mounted. */
  registerFlush: (flush: (() => Promise<boolean>) | null) => void;
  /** Shell owns the rail and single top bar; null restores its reading layout. */
  onShellControls?: (controls: CanvasShellControls | null) => void;
  status?: 'ready' | 'loading' | 'error';
  onRetry?: () => void;
  /**
   * Optional writing adapter. Live authoring controls stay hidden until both
   * this and onWorkspace are supplied. Root wires the shared bridge.
   */
  records?: CanvasRecordsWriter;
  /** Shared workspace callback. Do not keep a renderer-only success node. */
  onWorkspace?: (workspace: LearningWorkspace) => void;
}

/** A local placement failure, not a new producer/IPC error contract. */
export interface CanvasMovementError {
  code: 'placement-save-failed';
  input: Parameters<LearningRecordsBridge['moveLearningRecord']>[0];
}
