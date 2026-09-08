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
}

/** A local placement failure, not a new producer/IPC error contract. */
export interface CanvasMovementError {
  code: 'placement-save-failed';
  input: Parameters<LearningRecordsBridge['moveLearningRecord']>[0];
}
