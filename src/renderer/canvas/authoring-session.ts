import type {
  CommitAcknowledgement,
  EntryRevisionReference,
  LearningOrigin,
  LearningWorkspace,
  RevisionConflict,
  SaveHumanEntryInput,
} from '../../contracts/learning-records';
import {
  distinctSupportIds,
  sameOrigin,
  sameSupports,
  type HumanWritingKind,
} from './authoring';
import type { CanvasRecordsWriter } from './types';

export interface CanvasPlacement {
  x: number;
  y: number;
}

export interface CanvasAuthoringDraft {
  kind: HumanWritingKind;
  mode: 'compose' | 'relink';
  input: SaveHumanEntryInput & { entryId: string };
  supports: EntryRevisionReference[];
  placement: CanvasPlacement | null;
  touched: boolean;
  original: {
    title: string;
    body: string;
    origin: LearningOrigin | null;
    supports: EntryRevisionReference[];
  };
}

export interface PendingCanvasPlacement extends CanvasPlacement {
  recordId: string;
  kind: HumanWritingKind;
}

export interface AuthoringSnapshot {
  draft: CanvasAuthoringDraft | null;
  saving: boolean;
  error: string | null;
  conflict: RevisionConflict | null;
  conflictLoaded: boolean;
  acknowledgement: CommitAcknowledgement | null;
  notice: string | null;
  pendingPlacement: PendingCanvasPlacement | null;
}

interface AuthoringSessionOptions {
  projectId: string;
  records?: CanvasRecordsWriter | null;
  onWorkspace?: ((workspace: LearningWorkspace) => void) | null;
}

const EMPTY_BODY = 'Write your own words before saving, or discard this draft.';
const SAVE_FAILED =
  'Could not save your writing. Your draft is preserved. Try again.';
const REFRESH_FAILED =
  'Could not refresh saved records. Your acknowledged save is preserved. Reload saved records to retry.';
const CONFLICT =
  'A newer revision exists. Your draft is preserved. Review the saved version before choosing to retry.';

function cloneOrigin(origin: LearningOrigin | null): LearningOrigin | null {
  return origin ? structuredClone(origin) : null;
}

function cloneSupports(
  supports: readonly EntryRevisionReference[],
): EntryRevisionReference[] {
  return supports.map((item) => ({
    entryId: item.entryId,
    revision: item.revision,
  }));
}

function cloneDraft(draft: CanvasAuthoringDraft): CanvasAuthoringDraft {
  return {
    ...draft,
    input: { ...draft.input, origin: cloneOrigin(draft.input.origin) },
    supports: cloneSupports(draft.supports),
    placement: draft.placement ? { ...draft.placement } : null,
    original: {
      ...draft.original,
      origin: cloneOrigin(draft.original.origin),
      supports: cloneSupports(draft.original.supports),
    },
  };
}

function isDirty(draft: CanvasAuthoringDraft): boolean {
  return (
    draft.touched ||
    draft.input.title !== draft.original.title ||
    draft.input.body !== draft.original.body ||
    !sameOrigin(draft.input.origin, draft.original.origin) ||
    !sameSupports(draft.supports, draft.original.supports)
  );
}

/** One project-owned writing session. Compose flush with PlacementSession. */
export class AuthoringSession {
  private snapshot: AuthoringSnapshot = {
    draft: null,
    saving: false,
    error: null,
    conflict: null,
    conflictLoaded: false,
    acknowledgement: null,
    notice: null,
    pendingPlacement: null,
  };
  private readonly listeners = new Set<() => void>();
  private pending: Promise<boolean> | null = null;
  private refreshEpoch = 0;
  private records: CanvasRecordsWriter | null;
  private onWorkspace: ((workspace: LearningWorkspace) => void) | null;
  private readonly projectId: string;

  constructor({
    projectId,
    records = null,
    onWorkspace = null,
  }: AuthoringSessionOptions) {
    this.projectId = projectId;
    this.records = records;
    this.onWorkspace = onWorkspace;
  }

  setRecords(records: CanvasRecordsWriter | null): void {
    this.records = records;
  }

  setWorkspaceHandler(
    onWorkspace: ((workspace: LearningWorkspace) => void) | null,
  ): void {
    this.onWorkspace = onWorkspace;
  }

  getSnapshot = (): AuthoringSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private publish(update: Partial<AuthoringSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...update };
    this.listeners.forEach((listener) => listener());
  }

  begin(draft: {
    kind: HumanWritingKind;
    mode?: 'compose' | 'relink';
    input: SaveHumanEntryInput;
    supports?: readonly EntryRevisionReference[];
    placement?: CanvasPlacement | null;
    touched?: boolean;
    baseline?: {
      title?: string;
      body?: string;
      origin?: LearningOrigin | null;
      supports?: readonly EntryRevisionReference[];
    };
  }): string {
    if (this.snapshot.draft || this.pending)
      throw new Error('Save or discard the current draft first.');
    if (draft.input.projectId !== this.projectId)
      throw new Error('This draft belongs to another project.');
    const supports = cloneSupports(draft.supports ?? []);
    if (draft.kind === 'insight' && distinctSupportIds(supports) < 2)
      throw new Error('Select two distinct saved notes or questions.');
    const entryId = draft.input.entryId ?? crypto.randomUUID();
    const origin = cloneOrigin(draft.input.origin);
    const next: CanvasAuthoringDraft = {
      kind: draft.kind,
      mode: draft.mode ?? 'compose',
      input: {
        projectId: draft.input.projectId,
        entryId,
        expectedRevision: draft.input.expectedRevision,
        title: draft.input.title,
        body: draft.input.body,
        origin,
      },
      supports,
      placement: draft.placement ? { ...draft.placement } : null,
      touched: draft.touched ?? false,
      original: {
        title: draft.baseline?.title ?? draft.input.title,
        body: draft.baseline?.body ?? draft.input.body,
        origin: cloneOrigin(
          draft.baseline?.origin !== undefined ? draft.baseline.origin : origin,
        ),
        supports: cloneSupports(draft.baseline?.supports ?? supports),
      },
    };
    this.publish({
      draft: next,
      error: null,
      conflict: null,
      conflictLoaded: false,
      notice: null,
    });
    return entryId;
  }

  edit(update: Pick<SaveHumanEntryInput, 'title' | 'body'>): void {
    const draft = this.snapshot.draft;
    if (!draft || this.snapshot.saving) return;
    this.publish({
      draft: {
        ...draft,
        touched: true,
        input: { ...draft.input, title: update.title, body: update.body },
      },
      error: null,
    });
  }

  setSupports(supports: readonly EntryRevisionReference[]): void {
    const draft = this.snapshot.draft;
    if (!draft || this.snapshot.saving || draft.kind !== 'insight') return;
    const next = cloneSupports(supports);
    if (distinctSupportIds(next) < 2) {
      this.publish({
        error:
          'An insight needs at least two distinct saved human notes or questions.',
      });
      return;
    }
    this.publish({
      draft: { ...draft, touched: true, supports: next },
      error: null,
    });
  }

  discard(): boolean {
    if (this.pending) return false;
    this.publish({
      draft: null,
      conflict: null,
      error: null,
      notice: 'Draft discarded.',
    });
    return true;
  }

  takePendingPlacement(): PendingCanvasPlacement | null {
    const pending = this.snapshot.pendingPlacement;
    if (!pending) return null;
    this.publish({ pendingPlacement: null });
    return { ...pending };
  }

  blockedNavigationNotice(): string {
    if (this.snapshot.saving)
      return 'Waiting for your writing to finish saving before leaving Canvas.';
    if (this.snapshot.conflict)
      return 'Resolve the saved-revision conflict or discard your draft before leaving Canvas.';
    if (this.snapshot.draft && this.snapshot.error)
      return 'Retry or discard your unsaved writing before leaving Canvas.';
    if (this.snapshot.draft && isDirty(this.snapshot.draft))
      return 'Save or discard your Canvas writing before leaving Canvas.';
    return '';
  }

  retryWithCurrentRevision(): Promise<boolean> {
    const { draft, conflict } = this.snapshot;
    if (!draft || !conflict) return this.flush();
    if (!this.snapshot.conflictLoaded) return Promise.resolve(false);
    this.publish({
      draft: {
        ...draft,
        input: { ...draft.input, expectedRevision: conflict.currentRevision },
      },
      conflict: null,
    });
    return this.flush();
  }

  flush = (): Promise<boolean> => {
    if (this.pending) return this.pending;
    const { draft, conflict } = this.snapshot;
    if (!draft) return Promise.resolve(true);
    if (conflict) return Promise.resolve(false);
    if (!isDirty(draft)) {
      this.publish({ draft: null, error: null, notice: null });
      return Promise.resolve(true);
    }
    if (!draft.input.body.trim()) {
      this.publish({ error: EMPTY_BODY });
      return Promise.resolve(false);
    }
    if (!this.records) {
      this.publish({
        error: 'Canvas writing is not connected. Your draft is preserved.',
      });
      return Promise.resolve(false);
    }
    this.publish({ saving: true, error: null });
    this.pending = this.commit(draft, this.records).finally(() => {
      this.pending = null;
    });
    return this.pending;
  };

  async reloadConflict(): Promise<void> {
    const records = this.records;
    if (!records) return;
    const loaded = await this.refresh(records);
    this.publish({
      conflictLoaded: loaded,
      ...(loaded ? { error: null } : {}),
    });
  }

  private async commit(
    draft: CanvasAuthoringDraft,
    records: CanvasRecordsWriter,
  ): Promise<boolean> {
    this.refreshEpoch++;
    try {
      const result = await this.write(draft, records);
      if (result.status === 'conflict') {
        this.publish({
          conflict: result.conflict,
          error: CONFLICT,
        });
        this.publish({ conflictLoaded: await this.refresh(records) });
        return false;
      }
      const created = draft.input.expectedRevision === 0;
      this.publish({
        draft: null,
        conflict: null,
        acknowledgement: result.acknowledgement,
        notice: `Saved revision ${result.acknowledgement.revision} · ${result.acknowledgement.revisionId ?? result.acknowledgement.recordId}`,
        pendingPlacement:
          created && draft.placement
            ? {
                recordId: result.record.id,
                kind: draft.kind,
                x: draft.placement.x,
                y: draft.placement.y,
              }
            : null,
      });
      await this.refresh(records);
      return true;
    } catch {
      this.publish({ error: SAVE_FAILED });
      return false;
    } finally {
      this.publish({ saving: false });
    }
  }

  private async refresh(records: CanvasRecordsWriter): Promise<boolean> {
    const epoch = ++this.refreshEpoch;
    try {
      const workspace = await records.getLearningWorkspace(this.projectId);
      if (epoch !== this.refreshEpoch) return false;
      if (workspace.project.id !== this.projectId)
        throw new Error('Wrong project');
      this.onWorkspace?.(workspace);
      const conflict = this.snapshot.conflict;
      if (conflict) {
        const entry = workspace.entries.find(
          (item) => item.id === conflict.recordId,
        );
        if (!entry || entry.currentRevision < conflict.currentRevision)
          throw new Error('Conflicting revision unavailable');
        this.publish({
          conflict: { ...conflict, currentRevision: entry.currentRevision },
        });
      }
      return true;
    } catch {
      if (epoch !== this.refreshEpoch) return false;
      this.publish({ error: REFRESH_FAILED });
      return false;
    }
  }

  private write(draft: CanvasAuthoringDraft, records: CanvasRecordsWriter) {
    const input = { ...draft.input };
    switch (draft.kind) {
      case 'note':
        return records.saveReadingNote(input);
      case 'question':
        return records.saveQuestion(input);
      case 'insight': {
        if (distinctSupportIds(draft.supports) < 2)
          throw new Error('Select two distinct saved notes or questions.');
        return records.saveInsight({ ...input, supports: draft.supports });
      }
    }
  }

  /** Test helper: inspect a cloned draft without exposing mutation. */
  inspectDraft(): CanvasAuthoringDraft | null {
    return this.snapshot.draft ? cloneDraft(this.snapshot.draft) : null;
  }
}
