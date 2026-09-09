import { WorkspaceStore } from '../../src/main/workspace-store';
import { syntheticAcceptedCourseBrief } from '../../src/contracts/practical-brief.fixture';
import type { PracticalActivity } from '../../src/contracts/practical-work';

/** Synthetic CoursePracticeActivityBinding through production retainAcceptedBrief
 * and Electron SQLite. This harness adds no IPC or application test switch. */
export function retainSyntheticBrief(
  databasePath: string,
  activity: PracticalActivity,
): { status: 'retained'; briefId: string; briefRevision: number } {
  const store = new WorkspaceStore(databasePath);
  try {
    const retained = store.retainAcceptedBrief(
      syntheticAcceptedCourseBrief(activity),
    );
    if (retained.status !== 'retained')
      throw new Error('Synthetic brief could not be retained');
    return retained;
  } finally {
    store.close();
  }
}
