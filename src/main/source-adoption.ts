import {
  parseAcquireCanonicalSourceRequest,
  parseAcquireCanonicalSourceResponse,
} from '../backend/sourcing/contract-validation';
import type { CommitResult, SourceRecord } from '../contracts/learning-records';
import type { AcquireCanonicalSourceResponse } from '../contracts/sourcing';
import { decodeRecord, decodeUuid } from './workspace-decoder';
import type { WorkspaceStore } from './workspace-store';

type SavedSource = Extract<CommitResult<SourceRecord>, { status: 'committed' }>;
export type SourceAdoptionResult =
  | SavedSource
  | { status: 'cancelled' }
  | {
      status: 'not-acquired';
      response: Exclude<AcquireCanonicalSourceResponse, { outcome: 'success' }>;
    };

export interface PendingSourceAcquisition {
  signal: AbortSignal;
  cancel(): void;
  accept(response: unknown): SourceAdoptionResult;
}

/** Main-only lifetime for a user-selected acquisition. The authenticated caller
 * owns discovery/selection and transport. No renderer payload can carry `accept`.
 * Activate on project changes and cancel on sign-out/window close. */
export class SourceAdoption {
  private projectId: string | null = null;
  private readonly pending = new Set<AbortController>();

  constructor(private readonly store: WorkspaceStore) {}

  activateProject(projectId: unknown): void {
    const next = decodeUuid(projectId, 'project id');
    this.store.getLearningWorkspace(next);
    if (next !== this.projectId) this.cancel();
    this.projectId = next;
  }

  cancel(): void {
    for (const controller of this.pending) controller.abort();
    this.pending.clear();
  }

  beginAcquisition(value: unknown): PendingSourceAcquisition {
    const input = decodeRecord(value, 'selected acquisition');
    const projectId = decodeUuid(input.projectId, 'project id');
    const request = parseAcquireCanonicalSourceRequest(input.request);
    return this.begin(projectId, (value_) => {
      const response = parseAcquireCanonicalSourceResponse(value_, request);
      if (response.outcome !== 'success')
        return { status: 'not-acquired', response };
      return this.store.acceptAcquiredSource({ projectId, request, response });
    });
  }

  beginGeneratedLesson(value: unknown): PendingSourceAcquisition {
    const input = decodeRecord(value, 'selected lesson generation');
    const projectId = decodeUuid(input.projectId, 'project id');
    if (
      typeof input.requestId !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{7,99}$/.test(input.requestId)
    )
      throw new Error('Invalid generation request id.');
    const requestId = input.requestId;
    return this.begin(projectId, (value_) => {
      const lesson = decodeRecord(value_, 'generated lesson');
      if (
        lesson.requestId !== requestId ||
        (lesson.projectId !== undefined && lesson.projectId !== projectId)
      )
        throw new Error('Generated lesson does not match its active request.');
      return this.store.acceptGeneratedLesson({ ...lesson, projectId });
    });
  }

  private begin(
    projectId: string,
    accept: (value: unknown) => SourceAdoptionResult,
  ): PendingSourceAcquisition {
    if (projectId !== this.projectId)
      throw new Error('The selected learning space is stale.');
    const controller = new AbortController();
    this.pending.add(controller);
    return {
      signal: controller.signal,
      cancel: () => {
        controller.abort();
        this.pending.delete(controller);
      },
      accept: (value_) => {
        if (controller.signal.aborted || !this.pending.delete(controller))
          return { status: 'cancelled' };
        return accept(value_);
      },
    };
  }
}
