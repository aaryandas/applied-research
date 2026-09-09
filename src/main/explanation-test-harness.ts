import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceStore } from './workspace-store';
import { ExplanationRecords } from './explanation-records';

export interface ExplanationHarness {
  directory: string;
  path: string;
  projectId: string;
  sourceId: string;
  revisionId: string;
  highlightId: string;
  quote: string;
  text: string;
  records: ExplanationRecords;
  /** Close the original store without deleting files so a production reopen can follow. */
  release(): void;
  close(): void;
}

export function openExplanationHarness(
  text = 'Attention is a weighted combination of values.',
): ExplanationHarness {
  const directory = mkdtempSync(join(tmpdir(), 'ar51-explanations-'));
  const path = join(directory, 'workspace.sqlite');
  const store = new WorkspaceStore(path);
  try {
    const project = store.create('Understand attention');
    const imported = store.importTextSource({
      projectId: project.id,
      expectedRevision: 0,
      title: 'Attention notes',
      text,
      acquiredAt: '2026-09-09T08:00:00.000Z',
    });
    if (imported.status !== 'committed') {
      throw new Error('Fixture source failed.');
    }
    const quote = text.slice(0, Math.min(19, text.length));
    const highlight = store.saveHighlight({
      projectId: project.id,
      expectedRevision: 0,
      sourceId: imported.record.id,
      revisionId: imported.record.currentVersionId,
      start: 0,
      end: quote.length,
      quote,
    });
    if (highlight.status !== 'committed') {
      throw new Error('Fixture highlight failed.');
    }
    let released = false;
    const release = (): void => {
      if (released) return;
      store.close();
      released = true;
    };
    return {
      directory,
      path,
      projectId: project.id,
      sourceId: imported.record.id,
      revisionId: imported.record.currentVersionId,
      highlightId: highlight.record.id,
      quote,
      text,
      records: store.explanations,
      release,
      close() {
        release();
        rmSync(directory, { recursive: true, force: true });
      },
    };
  } catch (error_) {
    store.close();
    rmSync(directory, { recursive: true, force: true });
    throw error_;
  }
}
