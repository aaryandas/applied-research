import { useState, type ReactElement } from 'react';
import type {
  LearningRecordsBridge,
  SourceRecord,
} from '../../contracts/learning-records';

export function SourceImport({
  bridge,
  projectId,
  source,
  onImported,
  onCancel,
}: Readonly<{
  bridge: LearningRecordsBridge;
  projectId: string;
  source?: SourceRecord | undefined;
  onImported: (source: SourceRecord) => void;
  onCancel: () => void;
}>): ReactElement {
  const [attempt] = useState(() => ({
    sourceId: source?.id ?? crypto.randomUUID(),
    acquiredAt: new Date().toISOString(),
  }));
  const [title, setTitle] = useState(source?.currentVersion.title ?? '');
  const [text, setText] = useState(source?.currentVersion.canonicalText ?? '');
  const [locator, setLocator] = useState(
    source?.currentVersion.provenance.locator ?? '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expectedRevision, setExpectedRevision] = useState(
    source?.currentRevision ?? 0,
  );
  const [conflictRevision, setConflictRevision] = useState<number | null>(null);
  const [latestSource, setLatestSource] = useState<SourceRecord | null>(null);
  async function save(): Promise<void> {
    if (saving || conflictRevision !== null) return;
    if (locator) {
      try {
        const url = new URL(locator);
        if (url.protocol !== 'https:' || url.username || url.password)
          throw new Error('unsafe');
      } catch {
        setError(
          'Use an HTTPS source locator without embedded credentials, or leave it empty.',
        );
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const result = await bridge.importTextSource({
        projectId,
        sourceId: attempt.sourceId,
        expectedRevision,
        title,
        text,
        acquiredAt: attempt.acquiredAt,
        ...(locator ? { locator } : {}),
      });
      if (result.status === 'conflict') {
        setConflictRevision(result.conflict.currentRevision);
        setError(
          'A newer source version exists. Your pasted text is preserved. Load the latest version before choosing to retry.',
        );
      } else onImported(result.record);
    } catch {
      setError(
        'Could not import this source. Your text is preserved. Try again.',
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h2>{source ? 'Update source' : 'Add a source'}</h2>
      <label className="ui-field">
        <span className="ui-field__label">Source title</span>
        <input
          className="ui-input"
          required
          value={title}
          readOnly={saving}
          aria-busy={saving}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label className="ui-field">
        <span className="ui-field__label">Exact source text</span>
        <textarea
          className="ui-textarea"
          required
          value={text}
          readOnly={saving}
          aria-busy={saving}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <label className="ui-field">
        <span className="ui-field__label">Source locator (optional)</span>
        <input
          className="ui-input"
          type="url"
          value={locator}
          readOnly={saving}
          aria-busy={saving}
          onChange={(event) => setLocator(event.target.value)}
        />
      </label>
      {error && (
        <p className="ui-alert ui-alert--error" role="alert">
          {error}
        </p>
      )}
      {conflictRevision !== null && (
        <button
          className="ui-button"
          type="button"
          onClick={async () => {
            try {
              const latest = await bridge.getLearningWorkspace(projectId);
              const current = latest.sources.find(
                (item) => item.id === attempt.sourceId,
              );
              if (
                latest.project.id !== projectId ||
                !current ||
                conflictRevision === null ||
                current.currentRevision < conflictRevision
              )
                throw new Error('missing');
              setLatestSource(current);
              setError(
                'Review the saved source below. Your pasted text is unchanged.',
              );
            } catch {
              setError(
                'Could not load the latest source. Your text is preserved. Try again.',
              );
            }
          }}
        >
          Load latest revision for retry
        </button>
      )}
      {latestSource && (
        <section aria-label="Latest saved source">
          <h2>{latestSource.currentVersion.title}</h2>
          <p className="reader-prose">
            {latestSource.currentVersion.canonicalText}
          </p>
          <button
            className="ui-button"
            type="button"
            onClick={() => {
              setExpectedRevision(latestSource.currentRevision);
              setConflictRevision(null);
              setLatestSource(null);
              setError(
                'Your draft is ready to retry as a new source version. Older notes keep their original versions.',
              );
            }}
          >
            Use revision {latestSource.currentRevision} for my retry
          </button>
        </section>
      )}
      <div className="ui-action-row">
        <button
          className="ui-button ui-button--primary"
          type="submit"
          disabled={conflictRevision !== null}
          aria-disabled={saving}
        >
          {saving ? 'Importing…' : 'Import source'}
        </button>
        <button
          className="ui-button ui-button--text"
          type="button"
          disabled={saving}
          onClick={onCancel}
        >
          Discard import
        </button>
      </div>
    </form>
  );
}
