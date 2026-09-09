import type { WorkspaceStore } from './workspace-store';
import { PracticalFileSelection } from './practical-file-selection';
import { PracticalFileExport } from './practical-export';
import {
  isPracticalActivity,
  type PracticalCommitResult,
} from '../contracts/practical-work';
import type {
  ExportPracticalFileResult,
  ImportPracticalFileResult,
  ListPracticalAttemptsResult,
  LoadPracticalAttemptResult,
  LoadPracticalJourneyResult,
  PracticalFilePreviewResult,
  PracticalHumanPlanResult,
  PracticalProgressResult,
} from '../contracts/practical-records';

interface PracticalDesktopOptions {
  store: WorkspaceStore;
  isSelectedWorkspace: (projectId: string) => boolean;
  windowAlive: () => boolean;
  chooseOpenFile: (signal: AbortSignal) => Promise<string | null>;
  chooseSaveFile: (
    displayName: string,
    signal: AbortSignal,
  ) => Promise<string | null>;
}

/** Owns selected-workspace lifetime for every Practical named operation. */
export class PracticalDesktopOperations {
  private generation = 0;
  private readonly selection: PracticalFileSelection;
  private readonly fileExport: PracticalFileExport;

  constructor(private readonly options: PracticalDesktopOptions) {
    this.fileExport = new PracticalFileExport({
      records: options.store,
      chooseSavePath: options.chooseSaveFile,
      currentGeneration: () => this.generation,
      isCurrent: (value, generation) => this.isCurrent(value, generation),
    });
    this.selection = new PracticalFileSelection({
      records: options.store,
      chooseFile: options.chooseOpenFile,
      currentGeneration: () => this.generation,
      isCurrent: (value, generation) => this.isCurrent(value, generation),
      occupied: () => this.fileExport.occupied,
    });
  }

  replaceWorkspace(): void {
    this.generation += 1;
    this.cancelAll();
  }

  cancelAll(): void {
    this.selection.cancel();
    this.fileExport.cancel();
  }

  recordPracticalResult(value: unknown): PracticalCommitResult {
    return this.guard(value)
      ? this.options.store.recordPracticalResult(value)
      : { status: 'failed' };
  }

  loadPracticalAttempt(value: unknown): LoadPracticalAttemptResult {
    return this.guard(value)
      ? this.options.store.loadPracticalAttempt(value)
      : { status: 'failed' };
  }

  listPracticalAttempts(value: unknown): ListPracticalAttemptsResult {
    return this.guard(value)
      ? this.options.store.listPracticalAttempts(value)
      : { status: 'failed' };
  }

  previewPracticalFile(value: unknown): PracticalFilePreviewResult {
    return this.guard(value)
      ? this.options.store.previewPracticalFile(value)
      : { status: 'unavailable' };
  }

  loadPracticalJourney(value: unknown): LoadPracticalJourneyResult {
    return this.guard(value)
      ? this.options.store.loadPracticalJourney(value)
      : { status: 'failed' };
  }

  recordPracticalProgress(value: unknown): PracticalProgressResult {
    return this.guard(value)
      ? this.options.store.recordPracticalProgress(value)
      : { status: 'failed' };
  }

  recordPracticalWorkChoice(value: unknown): { status: 'saved' | 'failed' } {
    return this.guard(value)
      ? this.options.store.recordPracticalWorkChoice(value)
      : { status: 'failed' };
  }

  savePracticalHumanPlan(value: unknown): PracticalHumanPlanResult {
    return this.guard(value)
      ? this.options.store.savePracticalHumanPlan(value)
      : { status: 'failed' };
  }

  selectPracticalFile(value: unknown): Promise<ImportPracticalFileResult> {
    if (!this.guard(value) || this.fileExport.occupied)
      return Promise.resolve({ status: 'failed' });
    return this.selection.select(value);
  }

  cancelPracticalFileSelection(): void {
    this.selection.cancel();
  }

  exportPracticalFile(value: unknown): Promise<ExportPracticalFileResult> {
    if (!this.guard(value) || this.selection.occupied)
      return Promise.resolve({ status: 'failed' });
    return this.fileExport.export(value);
  }

  cancelPracticalExport(): void {
    this.fileExport.cancel();
  }

  private guard(value: unknown): boolean {
    return this.isCurrent(value, this.generation);
  }

  private isCurrent(value: unknown, captured: number): boolean {
    if (captured !== this.generation || !this.options.windowAlive())
      return false;
    try {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
      const activity = (value as { activity?: unknown }).activity;
      return (
        isPracticalActivity(activity) &&
        this.options.isSelectedWorkspace(activity.projectId)
      );
    } catch {
      return false;
    }
  }
}
