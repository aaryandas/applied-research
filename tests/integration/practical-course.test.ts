import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { adaptAcceptedCourseBrief } from '../../src/contracts/practical-brief';
import { syntheticAcceptedCourseBrief } from '../../src/contracts/practical-brief.fixture';
import { WorkspaceStore } from '../../src/main/workspace-store';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0).reverse()) {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('keeps lesson activity prose out of the practice-brief adapter and opens a durable journey without claiming a generated capstone', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ar50-course-'));
  directories.push(directory);
  const store = new WorkspaceStore(join(directory, 'workspace.sqlite'));
  try {
    const project = store.create('Compare one observed change');
    const topicId = randomUUID();
    const lessonId = randomUUID();
    const activityProse =
      '1. Produce the output\n2. Record the file\n3. Write a capstone report.';
    const saved = store.savePathRevision({
      projectId: project.id,
      expectedRevision: 0,
      title: 'Compare',
      topics: [
        {
          id: topicId,
          title: 'Experiment',
          lessons: [
            {
              id: lessonId,
              title: 'Change one input',
              objective: 'Explain the difference',
              activity: activityProse,
              source: { state: 'pending' },
            },
          ],
        },
      ],
    });
    if (saved.status !== 'committed') throw new Error('Path was not saved');
    const activity = {
      projectId: project.id,
      title: 'Change one input',
      objective: 'Explain the difference',
      instructions: activityProse,
      origin: {
        path: { pathId: saved.record.id, pathRevision: 1, topicId, lessonId },
      },
    };
    expect(adaptAcceptedCourseBrief(activityProse)).toBeNull();
    expect(
      adaptAcceptedCourseBrief({
        activity,
        brief: activityProse,
        capstone: true,
      }),
    ).toBeNull();
    const attemptId = randomUUID();
    const opened = store.loadPracticalJourney({ activity, attemptId });
    expect(opened).toMatchObject({
      status: 'loaded',
      attempt: null,
      journey: {
        brief: null,
        humanPlan: null,
        milestones: [],
        workChoice: null,
      },
    });
    const retained = store.retainAcceptedBrief(
      syntheticAcceptedCourseBrief(activity),
    );
    expect(retained.status).toBe('retained');
    expect(
      store.recordPracticalResult({
        activity,
        attemptId,
        expectedRevision: 0,
        draft: {
          prediction: 'The output will change.',
          attempt: 'Changed one input.',
          reportedResult: { kind: 'user-reported-text', text: '12' },
          selectedEvidence: null,
          reflection: { authorKind: 'human', text: 'Still my words.' },
        },
      }),
    ).toMatchObject({ status: 'committed' });
    const journey = store.loadPracticalJourney({ activity, attemptId });
    expect(journey.status).toBe('loaded');
    if (journey.status !== 'loaded') throw new Error('Journey was not loaded');
    expect(journey.journey.brief?.brief.masteryEstablished).toBe(false);
    expect(journey.journey.brief?.brief.observableCheckpoints).toEqual([
      'Produce the output',
    ]);
    expect(journey.attempt?.draft.reflection).toEqual({
      authorKind: 'human',
      text: 'Still my words.',
    });
  } finally {
    store.close();
  }
});
