import type {
  CommitAcknowledgement,
  EntryRevisionReference,
  LearningRecordsBridge,
  LearningWorkspace,
  RevisionConflict,
  SaveHumanEntryInput,
  SourceHighlight,
} from '../../contracts/learning-records';

export interface ReaderDraft {
  kind: 'note' | 'question' | 'insight';
  input: SaveHumanEntryInput;
  supports: EntryRevisionReference[];
  highlight?: SourceHighlight;
}

export interface DraftSnapshot {
  draft: ReaderDraft | null;
  saving: boolean;
  error: string | null;
  conflict: RevisionConflict | null;
  conflictLoaded: boolean;
  acknowledgement: CommitAcknowledgement | null;
  notice: string | null;
}

/** One project-owned session survives navigation attempts; callers must await flush. */
export class DraftSession {
  private snapshot: DraftSnapshot = {
    draft: null,
    saving: false,
    error: null,
    conflict: null,
    conflictLoaded: false,
    acknowledgement: null,
    notice: null,
  };
  private readonly listeners = new Set<() => void>();
  private pending: Promise<boolean> | null = null;
  private refreshEpoch = 0;
  constructor(
    private readonly bridge: LearningRecordsBridge,
    readonly projectId: string,
    private readonly observer: {
      onWorkspace: (workspace: LearningWorkspace) => void;
      onCommitted?: (kind: ReaderDraft['kind']) => void;
    },
  ) {}

  getSnapshot = (): DraftSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(update: Partial<DraftSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...update };
    this.listeners.forEach((listener) => listener());
  }
  begin(draft: ReaderDraft): void {
    if (this.snapshot.draft || this.pending)
      throw new Error('Save or discard the current draft first.');
    if (draft.input.projectId !== this.projectId)
      throw new Error('This draft belongs to another project.');
    this.publish({
      draft: structuredClone({
        ...draft,
        input: {
          ...draft.input,
          entryId: draft.input.entryId ?? crypto.randomUUID(),
        },
      }),
      error: null,
      conflict: null,
      conflictLoaded: false,
    });
  }
  edit(update: Pick<SaveHumanEntryInput, 'title' | 'body'>): void {
    const draft = this.snapshot.draft;
    if (!draft || this.snapshot.saving) return;
    this.publish({ draft: { ...draft, input: { ...draft.input, ...update } } });
  }
  discard(): void {
    if (!this.pending)
      this.publish({
        draft: null,
        conflict: null,
        error: null,
        notice: 'Draft discarded.',
      });
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
    if (!draft.input.body.trim()) {
      this.publish({
        error: 'Write your own words before saving, or discard this draft.',
      });
      return Promise.resolve(false);
    }
    this.publish({ saving: true, error: null });
    this.pending = this.commit(draft).finally(() => {
      this.pending = null;
    });
    return this.pending;
  };
  private async commit(draft: ReaderDraft): Promise<boolean> {
    this.refreshEpoch++;
    try {
      const result = await this.write(draft);
      if (result.status === 'conflict') {
        this.publish({
          conflict: result.conflict,
          error:
            'A newer revision exists. Your draft is preserved. Review the saved version before choosing to retry.',
        });
        this.publish({ conflictLoaded: await this.refresh() });
        return false;
      }
      this.publish({
        draft: null,
        conflict: null,
        acknowledgement: result.acknowledgement,
        notice: `Saved revision ${result.acknowledgement.revision} · ${result.acknowledgement.revisionId ?? result.acknowledgement.recordId}`,
      });
      this.observer.onCommitted?.(draft.kind);
      await this.refresh();
      return true;
    } catch {
      this.publish({
        error:
          'Could not save your writing. Your draft is preserved. Try again.',
      });
      return false;
    } finally {
      this.publish({ saving: false });
    }
  }
  async reloadConflict(): Promise<void> {
    const loaded = await this.refresh();
    this.publish({
      conflictLoaded: loaded,
      ...(loaded ? { error: null } : {}),
    });
  }
  private async refresh(): Promise<boolean> {
    const epoch = ++this.refreshEpoch;
    try {
      const workspace = await this.bridge.getLearningWorkspace(this.projectId);
      if (epoch !== this.refreshEpoch) return false;
      if (workspace.project.id !== this.projectId)
        throw new Error('Wrong project');
      this.observer.onWorkspace(workspace);
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
      this.publish({
        error:
          'Could not refresh saved records. Your draft or acknowledged save is preserved. Reload saved records to retry.',
      });
      return false;
    }
  }
  private write(draft: ReaderDraft) {
    switch (draft.kind) {
      case 'note':
        return this.bridge.saveReadingNote(draft.input);
      case 'question':
        return this.bridge.saveQuestion(draft.input);
      case 'insight': {
        if (new Set(draft.supports.map((ref) => ref.entryId)).size < 2)
          throw new Error('Select two distinct saved notes or questions.');
        return this.bridge.saveInsight({
          ...draft.input,
          supports: draft.supports,
        });
      }
    }
  }
}
