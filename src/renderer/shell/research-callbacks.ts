import type {
  LearningWorkspace,
  LearningOrigin,
  LearningRecordsBridge,
} from '../../contracts/learning-records';
import type { SourceDesktopBridge } from '../../contracts/source-desktop';
import type {
  ResearchCallbacks,
  ResearchOperation,
  ResearchReaderTarget,
} from '../research/research-contract';

interface ResearchCallbackOptions {
  projectId: string;
  bridge: Omit<SourceDesktopBridge, 'generateSourcedLearning'> &
    Pick<LearningRecordsBridge, 'getLearningWorkspace'>;
  isCurrent(): boolean;
  flush(): Promise<boolean>;
  openSaved(workspace: LearningWorkspace, target: ResearchReaderTarget): void;
}
export function createResearchCallbacks(
  options: ResearchCallbackOptions,
): ResearchCallbacks {
  let opening = false;
  const current = (projectId: string): boolean =>
    projectId === options.projectId && options.isCurrent();
  async function run<T>(
    requestId: string,
    operation: ResearchOperation,
    action: () => Promise<T>,
  ): Promise<T | { outcome: 'stale-project'; requestId: string }> {
    const stale = { outcome: 'stale-project' as const, requestId };
    if (operation.signal.aborted || !current(operation.context.projectId))
      return stale;
    const cancel = (): void => {
      void options.bridge
        .cancelSourceOperation({ projectId: options.projectId, requestId })
        .catch(() => {});
    };
    operation.signal.addEventListener('abort', cancel, { once: true });
    try {
      if (!(await options.flush()))
        throw new Error('Save current work before researching.');
      if (operation.signal.aborted || !current(operation.context.projectId))
        return stale;
      const result = await action();
      return operation.signal.aborted || !current(operation.context.projectId)
        ? stale
        : result;
    } finally {
      operation.signal.removeEventListener('abort', cancel);
    }
  }
  return {
    onDiscover: (request, operation) =>
      run(request.requestId, operation, () =>
        options.bridge.discoverSources({
          projectId: options.projectId,
          request,
        }),
      ),
    onAcquireAndSave: (request, operation) =>
      run(request.requestId, operation, () =>
        options.bridge.acquireAndSaveSource({
          projectId: options.projectId,
          request,
        }),
      ),
    async onOpenReader(target) {
      if (!current(target.projectId)) return 'stale-project';
      if (opening) return 'blocked';
      opening = true;
      try {
        if (!(await options.flush())) return 'blocked';
        if (!current(target.projectId)) return 'stale-project';
        const workspace = await options.bridge.getLearningWorkspace(
          options.projectId,
        );
        if (
          !current(target.projectId) ||
          workspace.project.id !== target.projectId
        )
          return 'stale-project';
        if (
          !workspace.sources.some(
            (source) =>
              source.id === target.sourceId &&
              source.versions.some(
                (version) => version.revisionId === target.revisionId,
              ),
          )
        )
          return 'missing-source';
        options.openSaved(workspace, target);
        return 'opened';
      } catch {
        return 'blocked';
      } finally {
        opening = false;
      }
    },
    async onOpenOriginal(target) {
      if (
        !current(target.projectId) ||
        !(await options.flush()) ||
        !current(target.projectId)
      )
        return 'unavailable';
      return options.bridge.openSourceOriginal(target);
    },
  };
}

export class WorkspaceOperationLifetime {
  private practicalStop: (() => void) | null = null;
  private origin: LearningOrigin | null = null;
  registerPracticalStop(stop: (() => void) | null): void {
    this.practicalStop = stop;
  }
  stopPractical(): void {
    this.practicalStop?.();
  }
  queueOrigin(origin: LearningOrigin): void {
    this.origin = origin;
  }
  takeOrigin(workspace: LearningWorkspace): LearningOrigin | null {
    const origin = this.origin;
    if (
      !origin ||
      (origin.sourceRevisionId &&
        !workspace.sources.some((source) =>
          source.versions.some(
            (version) => version.revisionId === origin.sourceRevisionId,
          ),
        ))
    )
      return null;
    this.origin = null;
    return origin;
  }

  private projectId: string | null = null;
  activate(projectId: string): void {
    this.projectId = projectId;
  }
  revoke(): void {
    this.origin = null;
    this.projectId = null;
  }
  isCurrent(projectId: string): boolean {
    return this.projectId === projectId;
  }
}
