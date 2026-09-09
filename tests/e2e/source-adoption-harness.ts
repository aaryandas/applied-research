import { WorkspaceStore } from '../../src/main/workspace-store';
import { SourceAdoption } from '../../src/main/source-adoption';
import {
  request,
  acquired,
  generatedLesson,
} from '../integration/source-adoption-fixtures';

/** Synthetic producer envelopes through production main operations and real
 * Electron SQLite. This harness adds no IPC or application test switch. */
export function saveTrustedExamples(databasePath: string): string {
  const store = new WorkspaceStore(databasePath);
  try {
    const project = store.create('Read acquired evidence');
    const adoption = new SourceAdoption(store);
    adoption.activateProject(project.id);
    const acquisition = adoption.beginAcquisition({
      projectId: project.id,
      request,
    });
    const original = acquisition.accept({
      outcome: 'success',
      requestId: request.requestId,
      source: acquired(),
    });
    const generation = adoption.beginGeneratedLesson({
      projectId: project.id,
      requestId: 'lesson-request-01',
    });
    const lesson = generation.accept(generatedLesson());
    if (original.status !== 'committed' || lesson.status !== 'committed')
      throw new Error('Synthetic adoption did not commit.');
    store.acceptBackendLearningPath({
      projectId: project.id,
      expectedRevision: 0,
      contribution: {
        kind: 'learning-path',
        title: 'Evidence and teaching text',
        steps: [
          {
            title: 'Read teaching text',
            objective: 'Understand evidence',
            activity: 'Apply the explanation',
            sourceRevisionId: lesson.record.currentVersionId,
            citations: [
              {
                sourceId: original.record.id,
                revisionId: original.record.currentVersionId,
                start: 0,
                end: 5,
                quote: 'hello',
              },
            ],
          },
        ],
      },
    });
    return project.id;
  } finally {
    store.close();
  }
}
