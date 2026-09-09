import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEARNING_ONBOARDING_PUBLIC_MESSAGES } from '../contracts/learning-onboarding-api';
import { LearningOnboardingOperations } from './learning-onboarding';
import {
  bytes,
  courseSuccess,
  selectedLessonSuccess,
} from './learning-onboarding.fixtures';
import { LearningOnboardingRecords } from './learning-onboarding-records';
import { applyLearningOnboardingTables } from './learning-onboarding-schema';
import type { WorkspaceDatabase } from './workspace-schema';
import { WorkspaceStore } from './workspace-store';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function setup(transport: { post: (raw: string, signal: AbortSignal) => Promise<Uint8Array> } | null = null) {
  const directory = mkdtempSync(join(tmpdir(), 'ar47-onboarding-'));
  const store = new WorkspaceStore(join(directory, 'workspace.sqlite'));
  const internals = store as unknown as {
    database: Database.Database;
    orm: WorkspaceDatabase;
  };
  applyLearningOnboardingTables(internals.database);
  const records = new LearningOnboardingRecords(internals.orm);
  cleanups.push(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const operations = new LearningOnboardingOperations({
    store,
    records,
    authenticated: () => true,
    transport,
  });
  return { store, records, operations };
}

async function seededInterview(
  operations: LearningOnboardingOperations,
  store: WorkspaceStore,
  goal = 'Learn transformers from original sources.',
) {
  const project = store.create(goal);
  const profile = await operations.saveLearnerProfile({
    expectedRevision: 0,
    draft: {
      background: 'I have written Python services.  ',
      learningGoals: 'Implement attention, then LoRA.',
      priorKnowledge: 'I can train a small classifier.',
    },
  });
  expect(profile.status).toBe('saved');
  if (profile.status !== 'saved') throw new Error('profile');
  const interview = await operations.saveLearningInterview({
    projectId: project.id,
    expectedRevision: 0,
    draft: {
      goal,
      focus: goal,
      depth: 'balanced',
      profileRevision: profile.record.revision,
      sourceRevisionIds: [],
      seedDrafts: [],
      answers: [
        {
          promptId: 'background-01',
          answer: 'I have written Python services.  ',
        },
        {
          promptId: 'intended-use-01',
          answer: 'Implement attention, then LoRA.',
        },
        {
          promptId: 'prior-know-01',
          answer: 'I can train a small classifier.',
        },
        {
          promptId: 'diagnostic-01',
          answer: 'I am not sure yet how I would apply this.',
        },
      ],
    },
  });
  expect(interview.status).toBe('saved');
  if (interview.status !== 'saved') throw new Error('interview');
  return { project, profile: profile.record, interview: interview.record };
}

describe('learning onboarding operations', () => {
  it('keeps exact human profile bytes and rejects a stale revision', async () => {
    const { operations } = setup();
    const first = await operations.saveLearnerProfile({
      expectedRevision: 0,
      draft: {
        background: 'I have written Python services.  ',
        learningGoals: 'Implement attention, then LoRA.',
        priorKnowledge: 'I can train a small classifier.',
      },
    });
    expect(first).toMatchObject({
      status: 'saved',
      record: { background: 'I have written Python services.  ', author: 'human' },
    });
    const conflict = await operations.saveLearnerProfile({
      expectedRevision: 0,
      draft: {
        background: 'changed',
        learningGoals: 'changed goals here',
        priorKnowledge: 'changed prior knowledge',
      },
    });
    expect(conflict).toEqual({
      status: 'conflict',
      expectedRevision: 0,
      currentRevision: 1,
    });
  });

  it('proposes a retained preview without saving a path, then accept writes the first lesson', async () => {
    const { store, operations } = setup({
      post: async (raw) => {
        const request = JSON.parse(raw) as { requestId: string };
        return bytes(courseSuccess(request.requestId));
      },
    });
    const generate = vi.spyOn(store, 'acceptSourcedLearning');
    const { project, interview } = await seededInterview(operations, store);
    const proposed = await operations.proposeCourse({
      projectId: project.id,
      requestId: 'request-01',
      interviewRevision: interview.revision,
      consent: 'acquire-learning-evidence',
    });
    expect(proposed.outcome).toBe('success');
    expect(store.getLearningWorkspace(project.id).paths).toEqual([]);
    expect(await operations.getContinueLearning()).toBeNull();
    if (proposed.outcome !== 'success') throw new Error('propose');
    expect(proposed.value.topics[0]?.lessons).toHaveLength(3);
    const accepted = await operations.acceptCourse({
      projectId: project.id,
      requestId: 'accept-01',
      proposal: { id: proposed.value.id, revision: proposed.value.revision },
    });
    expect(accepted.outcome).toBe('success');
    if (accepted.outcome !== 'success') throw new Error('accept');
    const workspace = accepted.value.workspace;
    expect(workspace.paths).toHaveLength(1);
    const path = workspace.paths[0]!;
    expect(path.current.topics[0]?.lessons.map((lesson) => lesson.title)).toEqual(
      ['Attention', 'Tokenizer practice', 'Capstone'],
    );
    const first = path.current.topics[0]!.lessons[0]!;
    expect(first.sourceState).toBe('ready');
    expect(first.sourceRevisionId).toBeTruthy();
    const version = workspace.sources
      .flatMap((source) => source.versions)
      .find((item) => item.revisionId === first.sourceRevisionId);
    expect(version?.canonicalText).toContain('Attention mixes values');
    expect(await operations.getContinueLearning()).toMatchObject({
      projectId: project.id,
      lessonTitle: 'Attention',
      path: accepted.value.firstLesson,
    });
    const duplicate = await operations.acceptCourse({
      projectId: project.id,
      requestId: 'accept-01',
      proposal: { id: proposed.value.id, revision: proposed.value.revision },
    });
    expect(duplicate.outcome).toBe('success');
    if (duplicate.outcome !== 'success') throw new Error('duplicate');
    expect(duplicate.value.workspace.paths).toHaveLength(1);
    expect(duplicate.value.firstLesson).toEqual(accepted.value.firstLesson);
    expect(generate).not.toHaveBeenCalled();
  });

  it('keeps the previous preview when a revision replacement is invalid', async () => {
    let calls = 0;
    const { store, operations } = setup({
      post: async (raw) => {
        const request = JSON.parse(raw) as { requestId: string };
        calls += 1;
        if (calls === 1) return bytes(courseSuccess(request.requestId));
        return bytes({ not: 'a course' });
      },
    });
    const { project, interview } = await seededInterview(operations, store);
    const proposed = await operations.proposeCourse({
      projectId: project.id,
      requestId: 'request-01',
      interviewRevision: interview.revision,
      consent: 'acquire-learning-evidence',
    });
    expect(proposed.outcome).toBe('success');
    if (proposed.outcome !== 'success') throw new Error('propose');
    const revised = await operations.reviseCourse({
      projectId: project.id,
      requestId: 'request-02',
      proposal: { id: proposed.value.id, revision: proposed.value.revision },
      interviewRevision: interview.revision,
      changes: { focus: 'More depth on attention.', depth: 'deep' },
      consent: 'acquire-learning-evidence',
    });
    expect(revised.outcome).toBe('unavailable');
    const snapshot = await operations.getLearningOnboarding({
      projectId: project.id,
    });
    expect(snapshot.proposal).toEqual(proposed.value);
  });

  it('cancels an in-flight propose and ignores a late envelope', async () => {
    let release: ((value: Uint8Array) => void) | undefined;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const { store, operations } = setup({
      post: async (_raw, signal) => {
        started();
        return await new Promise<Uint8Array>((resolve, reject) => {
          release = resolve;
          signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      },
    });
    const { project, interview } = await seededInterview(operations, store);
    const pending = operations.proposeCourse({
      projectId: project.id,
      requestId: 'request-01',
      interviewRevision: interview.revision,
      consent: 'acquire-learning-evidence',
    });
    await ready;
    await operations.cancelLearningOnboarding({
      projectId: project.id,
      requestId: 'request-01',
    });
    release?.(bytes(courseSuccess('request-01')));
    await expect(pending).resolves.toMatchObject({
      outcome: 'cancelled',
      retryable: false,
    });
    expect(
      (await operations.getLearningOnboarding({ projectId: project.id }))
        .proposal,
    ).toBeNull();
    expect(
      (await operations.getLearningOnboarding({ projectId: project.id }))
        .interview?.answers.find((item) => item.promptId === 'diagnostic-01')
        ?.answer,
    ).toContain('not sure yet');
  });

  it('maps explicit backend unavailable without inventing success', async () => {
    const { store, operations } = setup({
      post: async (raw) => {
        const request = JSON.parse(raw) as { requestId: string };
        return bytes({
          outcome: 'unavailable',
          requestId: request.requestId,
          message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.unavailable,
          retryable: true,
          accounting: 'none',
        });
      },
    });
    const { project, interview } = await seededInterview(operations, store);
    await expect(
      operations.proposeCourse({
        projectId: project.id,
        requestId: 'request-01',
        interviewRevision: interview.revision,
        consent: 'acquire-learning-evidence',
      }),
    ).resolves.toMatchObject({
      outcome: 'unavailable',
      retryable: true,
    });
    expect(store.getLearningWorkspace(project.id).paths).toEqual([]);
  });

  it('generates a later selected lesson without replacing the accepted path identity', async () => {
    const { store, operations } = setup({
      post: async (raw) => {
        const request = JSON.parse(raw) as {
          requestId: string;
          operation: { kind: string };
        };
        if (request.operation.kind === 'generate-selected-lesson') {
          return bytes(selectedLessonSuccess(request.requestId));
        }
        return bytes(courseSuccess(request.requestId));
      },
    });
    const { project, interview } = await seededInterview(operations, store);
    const proposed = await operations.proposeCourse({
      projectId: project.id,
      requestId: 'request-01',
      interviewRevision: interview.revision,
      consent: 'acquire-learning-evidence',
    });
    if (proposed.outcome !== 'success') throw new Error('propose');
    const accepted = await operations.acceptCourse({
      projectId: project.id,
      requestId: 'accept-01',
      proposal: { id: proposed.value.id, revision: proposed.value.revision },
    });
    if (accepted.outcome !== 'success') throw new Error('accept');
    const path = accepted.value.workspace.paths[0]!;
    const practice = path.current.topics[0]!.lessons[1]!;
    expect(practice.sourceState).toBe('pending');
    const generated = await operations.ensureLesson({
      projectId: project.id,
      requestId: 'request-02',
      target: {
        pathId: path.id,
        pathRevision: path.currentRevision,
        topicId: path.current.topics[0]!.id,
        lessonId: practice.id,
      },
      consent: 'acquire-learning-evidence',
    });
    expect(generated.outcome).toBe('success');
    if (generated.outcome !== 'success') throw new Error('ensure');
    expect(generated.value.lesson.lessonId).toBe(practice.id);
    expect(generated.value.lesson.pathId).toBe(path.id);
    const next = generated.value.workspace.paths[0]!;
    expect(next.id).toBe(path.id);
    expect(next.current.topics[0]!.lessons[0]!.id).toBe(
      path.current.topics[0]!.lessons[0]!.id,
    );
    expect(next.current.topics[0]!.lessons[1]!.sourceState).toBe('ready');
    expect(next.current.topics[0]!.lessons[1]!.sourceRevisionId).toBeTruthy();
  });
});
