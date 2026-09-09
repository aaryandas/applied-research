import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEARNING_ONBOARDING_PUBLIC_MESSAGES } from '../contracts/learning-onboarding-api';
import { LearningOnboardingValidationError } from '../contracts/learning-onboarding-validation';
import { LearningOnboardingOperations } from './learning-onboarding';
import {
  bytes,
  courseSuccess,
  interviewPromptSuccess,
  quota,
  revisedCourseSuccess,
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

function setup(
  transport: {
    post: (raw: string, signal: AbortSignal) => Promise<Uint8Array>;
  } | null = null,
) {
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
      record: {
        background: 'I have written Python services.  ',
        author: 'human',
      },
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
    expect(
      path.current.topics[0]?.lessons.map((lesson) => lesson.title),
    ).toEqual(['Attention', 'Tokenizer practice', 'Capstone']);
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
      (
        await operations.getLearningOnboarding({ projectId: project.id })
      ).interview?.answers.find((item) => item.promptId === 'diagnostic-01')
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

  it('revises a sourced plan, then accept, exact resume, and skip already-ready lessons', async () => {
    const kinds: string[] = [];
    const { store, records, operations } = setup({
      post: async (raw) => {
        const request = JSON.parse(raw) as {
          requestId: string;
          operation: { kind: string };
        };
        kinds.push(request.operation.kind);
        if (request.operation.kind === 'revise-course') {
          return bytes(revisedCourseSuccess(request.requestId));
        }
        return bytes(courseSuccess(request.requestId));
      },
    });
    const { project, profile, interview } = await seededInterview(
      operations,
      store,
    );
    expect(profile.background).toBe('I have written Python services.  ');
    const proposed = await operations.proposeCourse({
      projectId: project.id,
      requestId: 'request-01',
      interviewRevision: interview.revision,
      consent: 'acquire-learning-evidence',
    });
    if (proposed.outcome !== 'success') throw new Error('propose');
    expect(proposed.value.title).toBe('Transformers from sources');
    const revised = await operations.reviseCourse({
      projectId: project.id,
      requestId: 'request-02',
      proposal: { id: proposed.value.id, revision: proposed.value.revision },
      interviewRevision: interview.revision,
      changes: { focus: 'More depth on attention.', depth: 'deep' },
      consent: 'acquire-learning-evidence',
    });
    expect(revised.outcome).toBe('success');
    if (revised.outcome !== 'success') throw new Error('revise');
    expect(revised.value.id).toBe(proposed.value.id);
    expect(revised.value.revision).toBe(proposed.value.revision + 1);
    expect(revised.value.title).toBe('Transformers with deeper attention work');
    const afterRevise = await operations.getLearningOnboarding({
      projectId: project.id,
    });
    expect(afterRevise.interview?.answers[3]?.answer).toContain('not sure yet');
    expect(afterRevise.interview?.focus).toBe('More depth on attention.');
    expect(afterRevise.proposal?.title).toBe(
      'Transformers with deeper attention work',
    );
    expect(store.getLearningWorkspace(project.id).paths).toEqual([]);
    const view = await operations.getLearnerProfileView();
    expect(view.profile?.background).toBe('I have written Python services.  ');
    expect(view.assessment?.author).toBe('ai');
    expect(view.assessment?.masteryEstablished).toBe(false);
    const accepted = await operations.acceptCourse({
      projectId: project.id,
      requestId: 'accept-01',
      proposal: { id: revised.value.id, revision: revised.value.revision },
    });
    if (accepted.outcome !== 'success') throw new Error('accept');
    const snapshot = await operations.getLearningOnboarding({
      projectId: project.id,
    });
    expect(snapshot.proposal).toBeNull();
    expect(snapshot.accepted?.firstLesson).toEqual(accepted.value.firstLesson);
    const path = accepted.value.workspace.paths[0]!;
    const first = path.current.topics[0]!.lessons[0]!;
    await operations.saveReadingResume({
      projectId: project.id,
      path: {
        pathId: path.id,
        pathRevision: path.currentRevision,
        topicId: path.current.topics[0]!.id,
        lessonId: first.id,
      },
      sourceRevisionId: first.sourceRevisionId,
      span: { start: 0, end: 9, quote: 'Attention' },
      lessonTitle: first.title,
      projectGoal: project.goal,
    });
    expect(await operations.getContinueLearning()).toMatchObject({
      projectId: project.id,
      lessonTitle: 'Attention',
      span: { start: 0, end: 9, quote: 'Attention' },
      path: {
        pathId: path.id,
        lessonId: first.id,
      },
    });
    const skipped = await operations.ensureLesson({
      projectId: project.id,
      requestId: 'request-03',
      target: {
        pathId: path.id,
        pathRevision: path.currentRevision,
        topicId: path.current.topics[0]!.id,
        lessonId: first.id,
      },
      consent: 'acquire-learning-evidence',
    });
    expect(skipped.outcome).toBe('success');
    if (skipped.outcome !== 'success') throw new Error('skip');
    expect(skipped.value.lesson.lessonId).toBe(first.id);
    expect(kinds).toEqual(['propose-course', 'revise-course']);
    expect(
      records.listMappings(project.id).map((row) => row.remoteStepId),
    ).toEqual(['step-001', 'step-002', 'step-003']);
    const otherAccept = await operations.acceptCourse({
      projectId: project.id,
      requestId: 'accept-02',
      proposal: { id: revised.value.id, revision: revised.value.revision },
    });
    expect(otherAccept.outcome).toBe('success');
    if (otherAccept.outcome !== 'success') throw new Error('identity');
    expect(otherAccept.value.firstLesson).toEqual(accepted.value.firstLesson);
    expect(store.getLearningWorkspace(project.id).paths).toHaveLength(1);
  });

  it('keeps exact pasted source bytes and ignores resume without an accepted course', async () => {
    const { store, operations } = setup();
    const { project, interview } = await seededInterview(operations, store);
    const pasted = '  excerpt from a paper  ';
    const saved = await operations.savePastedSource({
      projectId: project.id,
      expectedRevision: interview.revision,
      pastedSourceText: pasted,
    });
    expect(saved.status).toBe('saved');
    expect(await operations.getPastedSource({ projectId: project.id })).toBe(
      pasted,
    );
    await operations.saveReadingResume({
      projectId: project.id,
      path: {
        pathId: 'path-xxxx',
        pathRevision: 1,
        topicId: 'topic-xx',
        lessonId: 'lesson-x',
      },
      sourceRevisionId: null,
      span: null,
      lessonTitle: 'Attention',
      projectGoal: project.goal,
    });
    expect(await operations.getContinueLearning()).toBeNull();
    await operations.saveReadingResume(null);
    await operations.saveReadingResume({ projectId: project.id });
    await operations.saveReadingResume([]);
    expect(await operations.getContinueLearning()).toBeNull();
  });

  it('does not invent generation when signed out, offline, or a second request is already in flight', async () => {
    const { store, records } = setup();
    const { project, interview } = await seededInterview(
      new LearningOnboardingOperations({
        store,
        records,
        authenticated: () => true,
        transport: null,
      }),
      store,
    );
    const signedOut = new LearningOnboardingOperations({
      store,
      records,
      authenticated: () => false,
      transport: {
        post: async () => bytes(courseSuccess('request-01')),
      },
    });
    await expect(
      signedOut.proposeCourse({
        projectId: project.id,
        requestId: 'request-01',
        interviewRevision: interview.revision,
        consent: 'acquire-learning-evidence',
      }),
    ).resolves.toMatchObject({
      outcome: 'unavailable',
      retryable: true,
      message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.unauthenticated,
    });
    const offline = new LearningOnboardingOperations({
      store,
      records,
      authenticated: () => true,
      transport: null,
    });
    await expect(
      offline.proposeCourse({
        projectId: project.id,
        requestId: 'request-02',
        interviewRevision: interview.revision,
        consent: 'acquire-learning-evidence',
      }),
    ).resolves.toMatchObject({
      outcome: 'unavailable',
      retryable: true,
    });
    expect(store.getLearningWorkspace(project.id).paths).toEqual([]);
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const { store: busyStore, operations: busy } = setup({
      post: async (_raw, signal) => {
        started();
        return await new Promise<Uint8Array>((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      },
    });
    const second = await seededInterview(busy, busyStore);
    const pending = busy.proposeCourse({
      projectId: second.project.id,
      requestId: 'request-01',
      interviewRevision: second.interview.revision,
      consent: 'acquire-learning-evidence',
    });
    await ready;
    await expect(
      busy.proposeCourse({
        projectId: second.project.id,
        requestId: 'request-02',
        interviewRevision: second.interview.revision,
        consent: 'acquire-learning-evidence',
      }),
    ).resolves.toMatchObject({ outcome: 'unavailable', retryable: true });
    busy.revoke();
    await expect(pending).resolves.toMatchObject({ outcome: 'cancelled' });
  });

  it('rejects stale interview, stale proposal, and mismatched selected-lesson identity', async () => {
    const { store, operations } = setup({
      post: async (raw) => {
        const request = JSON.parse(raw) as { requestId: string };
        return bytes(courseSuccess(request.requestId));
      },
    });
    const { project, interview } = await seededInterview(operations, store);
    await expect(
      operations.proposeCourse({
        projectId: project.id,
        requestId: 'request-01',
        interviewRevision: interview.revision + 1,
        consent: 'acquire-learning-evidence',
      }),
    ).resolves.toMatchObject({ outcome: 'stale-revision', retryable: false });
    const proposed = await operations.proposeCourse({
      projectId: project.id,
      requestId: 'request-02',
      interviewRevision: interview.revision,
      consent: 'acquire-learning-evidence',
    });
    if (proposed.outcome !== 'success') throw new Error('propose');
    await expect(
      operations.reviseCourse({
        projectId: project.id,
        requestId: 'request-03',
        proposal: { id: '00000000-0000-4000-8000-000000000099', revision: 1 },
        interviewRevision: interview.revision,
        changes: { focus: 'Other focus text here.', depth: 'concise' },
        consent: 'acquire-learning-evidence',
      }),
    ).resolves.toMatchObject({ outcome: 'stale-revision' });
    const accepted = await operations.acceptCourse({
      projectId: project.id,
      requestId: 'accept-01',
      proposal: { id: proposed.value.id, revision: proposed.value.revision },
    });
    if (accepted.outcome !== 'success') throw new Error('accept');
    await expect(
      operations.ensureLesson({
        projectId: project.id,
        requestId: 'request-04',
        target: {
          pathId: accepted.value.firstLesson.pathId,
          pathRevision: accepted.value.firstLesson.pathRevision,
          topicId: accepted.value.firstLesson.topicId,
          lessonId: '00000000-0000-4000-8000-000000000077',
        },
        consent: 'acquire-learning-evidence',
      }),
    ).resolves.toMatchObject({ outcome: 'conflict', retryable: false });
    const orphan = store.create('Another topic for a missing course.');
    await expect(
      operations.ensureLesson({
        projectId: orphan.id,
        requestId: 'request-05',
        target: {
          pathId: accepted.value.firstLesson.pathId,
          pathRevision: 1,
          topicId: accepted.value.firstLesson.topicId,
          lessonId: accepted.value.firstLesson.lessonId,
        },
        consent: 'acquire-learning-evidence',
      }),
    ).resolves.toMatchObject({ outcome: 'stale-project', retryable: false });
  });

  it('maps explicit backend failures without inventing a generated course', async () => {
    const cases = [
      {
        body: {
          outcome: 'coverage-pending',
          requestId: 'request-01',
          scope: 'complete-syllabus-and-first-lesson',
          message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.coveragePending,
          retryable: false,
          gaps: [],
          sourceCoverage: null,
          quota: null,
        },
        outcome: 'coverage-pending',
        retryable: false,
      },
      {
        body: {
          outcome: 'conflict',
          requestId: 'request-01',
          message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.conflict,
          retryable: false,
        },
        outcome: 'conflict',
        retryable: false,
      },
      {
        body: {
          outcome: 'cancelled',
          requestId: 'request-01',
          message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.cancelled,
          retryable: false,
          accounting: 'released',
        },
        outcome: 'cancelled',
        retryable: false,
      },
      {
        body: {
          outcome: 'stale-revision',
          requestId: 'request-01',
          message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.staleRevision,
          retryable: false,
          expectedRevision: 1,
          currentRevision: 2,
        },
        outcome: 'stale-revision',
        retryable: false,
      },
      {
        body: {
          outcome: 'unauthenticated',
          requestId: 'request-01',
          message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.unauthenticated,
        },
        outcome: 'unavailable',
        retryable: true,
      },
      {
        body: {
          outcome: 'quota-exceeded',
          requestId: 'request-01',
          message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.quotaExceeded,
          retryable: false,
          quota,
        },
        outcome: 'save-failed',
        retryable: false,
      },
      {
        body: {
          outcome: 'unavailable',
          requestId: 'request-01',
          message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.unavailable,
          retryable: true,
          accounting: 'released',
        },
        outcome: 'unavailable',
        retryable: true,
      },
      {
        body: {
          outcome: 'unavailable',
          requestId: 'request-01',
          message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.unavailable,
          retryable: false,
          accounting: 'charged',
        },
        outcome: 'unavailable',
        retryable: false,
      },
    ] as const;
    for (const item of cases) {
      const { store, operations } = setup({
        post: async () => bytes(item.body),
      });
      const { project, interview } = await seededInterview(operations, store);
      const result = await operations.proposeCourse({
        projectId: project.id,
        requestId: 'request-01',
        interviewRevision: interview.revision,
        consent: 'acquire-learning-evidence',
      });
      expect(result).toMatchObject({
        outcome: item.outcome,
        retryable: item.retryable,
      });
      expect(store.getLearningWorkspace(project.id).paths).toEqual([]);
      expect(
        (await operations.getLearningOnboarding({ projectId: project.id }))
          .proposal,
      ).toBeNull();
    }
  });

  it('keeps the previous preview when a concurrent replacement wins', async () => {
    let projectId = '';
    const { store, records, operations } = setup({
      post: async (raw) => {
        const request = JSON.parse(raw) as {
          requestId: string;
          operation: { kind: string };
        };
        if (request.operation.kind === 'revise-course') {
          const current = records.getProposal(projectId);
          if (current) {
            records.replaceProposal(
              projectId,
              { ...current, revision: current.revision + 1 },
              {
                proposalId: current.proposalId,
                revision: current.revision,
              },
            );
          }
          return bytes(revisedCourseSuccess(request.requestId));
        }
        return bytes(courseSuccess(request.requestId));
      },
    });
    const { project, interview } = await seededInterview(operations, store);
    projectId = project.id;
    const proposed = await operations.proposeCourse({
      projectId: project.id,
      requestId: 'request-01',
      interviewRevision: interview.revision,
      consent: 'acquire-learning-evidence',
    });
    if (proposed.outcome !== 'success') throw new Error('propose');
    const revised = await operations.reviseCourse({
      projectId: project.id,
      requestId: 'request-02',
      proposal: { id: proposed.value.id, revision: proposed.value.revision },
      interviewRevision: interview.revision,
      changes: { focus: 'More depth on attention.', depth: 'deep' },
      consent: 'acquire-learning-evidence',
    });
    expect(revised.outcome).toBe('success');
    if (revised.outcome !== 'success') throw new Error('revise');
    expect(revised.value.title).toBe('Transformers from sources');
    expect(
      (await operations.getLearningOnboarding({ projectId: project.id }))
        .proposal?.title,
    ).toBe('Transformers from sources');
  });

  it('appends an AI interview prompt without treating it as a human answer', async () => {
    const { store, operations } = setup({
      post: async (raw) => {
        const request = JSON.parse(raw) as { requestId: string };
        return bytes(interviewPromptSuccess(request.requestId));
      },
    });
    const { project, interview } = await seededInterview(operations, store);
    const prompted = await operations.requestInterviewPrompt({
      projectId: project.id,
      requestId: 'prompt-01',
      interviewRevision: interview.revision,
      consent: 'acquire-learning-evidence',
    });
    expect(prompted.outcome).toBe('success');
    if (prompted.outcome !== 'success') throw new Error('prompt');
    expect(prompted.value.prompts[0]?.id).toBe('followup-01');
    expect(prompted.value.answers[3]?.answer).toContain('not sure yet');
    const view = await operations.getLearnerProfileView();
    expect(view.assessment?.summary).toContain('uncertainty');
    expect(view.profile?.author).toBe('human');
  });

  it('does not generate a later lesson when the backend is unavailable', async () => {
    const { store, operations } = setup({
      post: async (raw) => {
        const request = JSON.parse(raw) as {
          requestId: string;
          operation: { kind: string };
        };
        if (request.operation.kind === 'generate-selected-lesson') {
          return bytes({
            outcome: 'unavailable',
            requestId: request.requestId,
            message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.unavailable,
            retryable: true,
            accounting: 'none',
          });
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
    expect(generated).toMatchObject({
      outcome: 'unavailable',
      retryable: true,
    });
    const later = store.getLearningWorkspace(project.id).paths[0]!;
    expect(later.id).toBe(path.id);
    expect(later.current.topics[0]!.lessons[0]!.sourceState).toBe('ready');
    expect(later.current.topics[0]!.lessons[1]!.sourceState).toBe('pending');
    expect(later.current.topics[0]!.lessons[1]!.id).toBe(practice.id);
  });

  it('maps a signed-out transport error without attaching a late course', async () => {
    const { store, operations } = setup({
      post: async () => {
        throw new TypeError('Sign in to use remote learning.');
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
      message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.unauthenticated,
    });
    expect(
      (await operations.getLearningOnboarding({ projectId: project.id }))
        .interview?.answers[3]?.answer,
    ).toContain('not sure yet');
  });

  it('refuses pasted sources, stale profile bindings, and accept without a matching preview', async () => {
    const { store, operations } = setup({
      post: async (raw) => {
        const request = JSON.parse(raw) as { requestId: string };
        return bytes(courseSuccess(request.requestId));
      },
    });
    await expect(
      operations.savePastedSource({
        projectId: store.create('Needs an interview first.').id,
        expectedRevision: 0,
        pastedSourceText: '  excerpt  ',
      }),
    ).rejects.toBeInstanceOf(LearningOnboardingValidationError);
    const { project, profile, interview } = await seededInterview(
      operations,
      store,
    );
    const pastedConflict = await operations.savePastedSource({
      projectId: project.id,
      expectedRevision: interview.revision + 1,
      pastedSourceText: '  excerpt  ',
    });
    expect(pastedConflict.status).toBe('conflict');
    expect(
      await operations.getPastedSource({ projectId: project.id }),
    ).toBeNull();
    const interviewConflict = await operations.saveLearningInterview({
      projectId: project.id,
      expectedRevision: 0,
      draft: {
        goal: interview.goal,
        focus: interview.focus,
        depth: interview.depth,
        profileRevision: profile.revision,
        sourceRevisionIds: [],
        seedDrafts: [],
        answers: interview.answers,
      },
    });
    expect(interviewConflict.status).toBe('conflict');
    const advanced = await operations.saveLearnerProfile({
      expectedRevision: profile.revision,
      draft: {
        background: profile.background,
        learningGoals: profile.learningGoals,
        priorKnowledge: profile.priorKnowledge,
      },
    });
    expect(advanced.status).toBe('saved');
    await expect(
      operations.proposeCourse({
        projectId: project.id,
        requestId: 'request-01',
        interviewRevision: interview.revision,
        consent: 'acquire-learning-evidence',
      }),
    ).resolves.toMatchObject({ outcome: 'stale-revision', retryable: false });
    await expect(
      operations.acceptCourse({
        projectId: project.id,
        requestId: 'accept-01',
        proposal: {
          id: '11111111-1111-4111-8111-111111111111',
          revision: 1,
        },
      }),
    ).resolves.toMatchObject({ outcome: 'stale-revision', retryable: false });
    expect(store.getLearningWorkspace(project.id).paths).toEqual([]);
  });

  it('sends exact seed URLs and unresolved locators, then refuses an empty-provenance accept', async () => {
    const bodies: unknown[] = [];
    const { store, records, operations } = setup({
      post: async (raw) => {
        bodies.push(JSON.parse(raw));
        const request = JSON.parse(raw) as { requestId: string };
        return bytes(courseSuccess(request.requestId));
      },
    });
    const { project, profile, interview } = await seededInterview(
      operations,
      store,
    );
    const withSeeds = await operations.saveLearningInterview({
      projectId: project.id,
      expectedRevision: interview.revision,
      draft: {
        goal: interview.goal,
        focus: interview.focus,
        depth: interview.depth,
        profileRevision: profile.revision,
        sourceRevisionIds: ['edition-1'],
        seedDrafts: [
          {
            trust: 'untrusted-human-context',
            kind: 'unacquired-url',
            url: 'https://example.org/paper',
          },
        ],
        answers: interview.answers,
      },
    });
    expect(withSeeds.status).toBe('saved');
    if (withSeeds.status !== 'saved') throw new Error('seeds');
    const proposed = await operations.proposeCourse({
      projectId: project.id,
      requestId: 'request-01',
      interviewRevision: withSeeds.record.revision,
      consent: 'acquire-learning-evidence',
    });
    expect(proposed.outcome).toBe('success');
    const sent = bodies[0] as {
      operation: {
        human: {
          unacquiredSeedUrls: { url: string }[];
          seedRevisionLocators: { sourceId: string; revisionId: string }[];
          profile: { background: string };
        };
      };
    };
    expect(sent.operation.human.unacquiredSeedUrls).toEqual([
      {
        trust: 'untrusted-human-context',
        kind: 'unacquired-url',
        url: 'https://example.org/paper',
      },
    ]);
    expect(sent.operation.human.seedRevisionLocators).toEqual([
      { sourceId: 'edition-1', revisionId: 'edition-1' },
    ]);
    expect(sent.operation.human.profile.background).toBe(
      'I have written Python services.  ',
    );
    const stored = records.getProposal(project.id);
    expect(stored).toBeTruthy();
    if (!stored) throw new Error('stored');
    records.replaceProposal(project.id, {
      ...stored,
      envelope: { ...stored.envelope, provenance: [] },
    });
    await expect(
      operations.acceptCourse({
        projectId: project.id,
        requestId: 'accept-01',
        proposal: { id: stored.proposalId, revision: stored.revision },
      }),
    ).resolves.toMatchObject({
      outcome: 'save-failed',
      retryable: false,
    });
    expect(store.getLearningWorkspace(project.id).paths).toEqual([]);
    expect(records.getAcceptance(project.id)).toBeNull();
  });

  it('does not invent a later lesson when mappings disappear before commit', async () => {
    let projectId = '';
    const { store, operations } = setup({
      post: async (raw) => {
        const request = JSON.parse(raw) as {
          requestId: string;
          operation: { kind: string };
        };
        if (request.operation.kind === 'generate-selected-lesson') {
          const internals = store as unknown as { database: Database.Database };
          internals.database
            .prepare('delete from accepted_step_mappings where project_id = ?')
            .run(projectId);
          return bytes(selectedLessonSuccess(request.requestId));
        }
        return bytes(courseSuccess(request.requestId));
      },
    });
    const { project, interview } = await seededInterview(operations, store);
    projectId = project.id;
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
    expect(generated).toMatchObject({
      outcome: 'save-failed',
      retryable: true,
    });
    expect(
      store.getLearningWorkspace(project.id).paths[0]!.current.topics[0]!
        .lessons[1]!.sourceState,
    ).toBe('pending');
  });

  it('cancels only the matching in-flight request and ignores a later selected-lesson identity mismatch', async () => {
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const { store, operations } = setup({
      post: async (raw, signal) => {
        const request = JSON.parse(raw) as {
          requestId: string;
          operation: { kind: string };
        };
        if (request.operation.kind === 'propose-course') {
          started();
          return await new Promise<Uint8Array>((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          });
        }
        return bytes(selectedLessonSuccess(request.requestId));
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
      projectId: store.create('A different draft project.').id,
      requestId: 'request-01',
    });
    await operations.cancelLearningOnboarding({
      projectId: project.id,
      requestId: 'request-99',
    });
    await operations.cancelLearningOnboarding({
      projectId: project.id,
      requestId: 'request-01',
    });
    await expect(pending).resolves.toMatchObject({ outcome: 'cancelled' });
    await expect(
      operations.requestInterviewPrompt({
        projectId: project.id,
        requestId: 'prompt-01',
        interviewRevision: interview.revision + 1,
        consent: 'acquire-learning-evidence',
      }),
    ).resolves.toMatchObject({ outcome: 'stale-revision' });
  });

  it('ignores a late successful envelope after cancel even when the transport still returns bytes', async () => {
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    let unblock!: () => void;
    const gate = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const { store, operations } = setup({
      post: async (raw) => {
        started();
        await gate;
        const request = JSON.parse(raw) as { requestId: string };
        return bytes(courseSuccess(request.requestId));
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
    unblock();
    await expect(pending).resolves.toMatchObject({
      outcome: 'cancelled',
      retryable: false,
    });
    expect(
      (await operations.getLearningOnboarding({ projectId: project.id }))
        .proposal,
    ).toBeNull();
  });

  it('keeps a later resume span only after acceptance and ignores a mismatched ensure target', async () => {
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
    await expect(
      operations.ensureLesson({
        projectId: project.id,
        requestId: 'request-02',
        target: {
          pathId: path.id,
          pathRevision: path.currentRevision,
          topicId: '00000000-0000-4000-8000-000000000066',
          lessonId: practice.id,
        },
        consent: 'acquire-learning-evidence',
      }),
    ).resolves.toMatchObject({ outcome: 'conflict', retryable: false });
    const generated = await operations.ensureLesson({
      projectId: project.id,
      requestId: 'request-03',
      target: {
        pathId: path.id,
        pathRevision: path.currentRevision,
        topicId: path.current.topics[0]!.id,
        lessonId: practice.id,
      },
      consent: 'acquire-learning-evidence',
    });
    expect(generated.outcome).toBe('success');
    await operations.saveReadingResume({
      projectId: project.id,
      path: {
        pathId: path.id,
        pathRevision: path.currentRevision + 1,
        topicId: path.current.topics[0]!.id,
        lessonId: practice.id,
      },
      sourceRevisionId: 12,
      span: { start: 0, end: 9 },
      lessonTitle: 'Tokenizer practice',
      projectGoal: project.goal,
    });
    expect(await operations.getContinueLearning()).toMatchObject({
      projectId: project.id,
      lessonTitle: 'Tokenizer practice',
      span: null,
      sourceRevisionId: null,
      path: { lessonId: practice.id, pathRevision: path.currentRevision + 1 },
    });
  });

  it('resolves accepted source locators and refuses later work after the preview disappears', async () => {
    const { store, records, operations } = setup({
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
    expect(await operations.getLearnerProfile()).toBeNull();
    const { project, profile, interview } = await seededInterview(
      operations,
      store,
    );
    expect(await operations.getLearnerProfile()).toEqual(profile);
    const withLocator = await operations.saveLearningInterview({
      projectId: project.id,
      expectedRevision: interview.revision,
      draft: {
        goal: interview.goal,
        focus: interview.focus,
        depth: interview.depth,
        profileRevision: profile.revision,
        sourceRevisionIds: ['edition-1'],
        seedDrafts: [],
        answers: interview.answers,
      },
    });
    if (withLocator.status !== 'saved') throw new Error('locator');
    const proposed = await operations.proposeCourse({
      projectId: project.id,
      requestId: 'request-01',
      interviewRevision: withLocator.record.revision,
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
    const internals = store as unknown as { database: Database.Database };
    internals.database
      .prepare('delete from learning_proposals where project_id = ?')
      .run(project.id);
    expect(records.getProposal(project.id)).toBeNull();
    const capstone = path.current.topics[0]!.lessons[2]!;
    await expect(
      operations.ensureLesson({
        projectId: project.id,
        requestId: 'request-03',
        target: {
          pathId: path.id,
          pathRevision: path.currentRevision,
          topicId: path.current.topics[0]!.id,
          lessonId: capstone.id,
        },
        consent: 'acquire-learning-evidence',
      }),
    ).resolves.toMatchObject({ outcome: 'stale-revision', retryable: false });
    expect(
      store.getLearningWorkspace(project.id).paths[0]!.current.topics[0]!
        .lessons[2]!.sourceState,
    ).toBe('pending');
  });

  it('maps interview-prompt and revise failures without replacing the retained preview', async () => {
    let projectId = '';
    const { store, records, operations } = setup({
      post: async (raw) => {
        const request = JSON.parse(raw) as {
          requestId: string;
          operation: { kind: string };
        };
        if (request.operation.kind === 'interview-prompt') {
          const current = records.getInterview(projectId);
          if (current && request.requestId === 'prompt-01') {
            records.saveInterview(
              current.revision,
              {
                projectId: current.projectId,
                goal: current.goal,
                focus: current.focus,
                depth: current.depth,
                profileRevision: current.profileRevision,
                sourceRevisionIds: current.sourceRevisionIds,
                seedDrafts: current.seedDrafts,
                answers: current.answers,
                prompts: current.prompts,
              },
              records.getPastedSource(projectId),
            );
            return bytes(interviewPromptSuccess(request.requestId));
          }
          if (request.requestId === 'prompt-02') {
            return bytes({
              outcome: 'unavailable',
              requestId: request.requestId,
              message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.unavailable,
              retryable: true,
              accounting: 'released',
            });
          }
          return bytes({
            ...interviewPromptSuccess(request.requestId),
            assessment: null,
          });
        }
        if (request.operation.kind === 'revise-course') {
          return bytes({
            outcome: 'unavailable',
            requestId: request.requestId,
            message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.unavailable,
            retryable: true,
            accounting: 'none',
          });
        }
        return bytes(courseSuccess(request.requestId));
      },
    });
    const { project, profile, interview } = await seededInterview(
      operations,
      store,
    );
    projectId = project.id;
    await expect(
      operations.requestInterviewPrompt({
        projectId: project.id,
        requestId: 'prompt-01',
        interviewRevision: interview.revision,
        consent: 'acquire-learning-evidence',
      }),
    ).resolves.toMatchObject({ outcome: 'stale-revision' });
    await expect(
      operations.requestInterviewPrompt({
        projectId: project.id,
        requestId: 'prompt-02',
        interviewRevision: interview.revision + 1,
        consent: 'acquire-learning-evidence',
      }),
    ).resolves.toMatchObject({ outcome: 'unavailable', retryable: true });
    const prompted = await operations.requestInterviewPrompt({
      projectId: project.id,
      requestId: 'prompt-03',
      interviewRevision: interview.revision + 1,
      consent: 'acquire-learning-evidence',
    });
    expect(prompted.outcome).toBe('success');
    expect((await operations.getLearnerProfileView()).assessment).toBeNull();
    const proposed = await operations.proposeCourse({
      projectId: project.id,
      requestId: 'request-01',
      interviewRevision: interview.revision + 2,
      consent: 'acquire-learning-evidence',
    });
    if (proposed.outcome !== 'success') throw new Error('propose');
    const advanced = await operations.saveLearnerProfile({
      expectedRevision: profile.revision,
      draft: {
        background: profile.background,
        learningGoals: profile.learningGoals,
        priorKnowledge: profile.priorKnowledge,
      },
    });
    expect(advanced.status).toBe('saved');
    await expect(
      operations.reviseCourse({
        projectId: project.id,
        requestId: 'request-02',
        proposal: { id: proposed.value.id, revision: proposed.value.revision },
        interviewRevision: interview.revision + 2,
        changes: { focus: 'More depth on attention.', depth: 'deep' },
        consent: 'acquire-learning-evidence',
      }),
    ).resolves.toMatchObject({ outcome: 'stale-revision' });
    const rebound = await operations.saveLearningInterview({
      projectId: project.id,
      expectedRevision: interview.revision + 2,
      draft: {
        goal: interview.goal,
        focus: interview.focus,
        depth: interview.depth,
        profileRevision: 2,
        sourceRevisionIds: [],
        seedDrafts: [],
        answers: interview.answers,
      },
    });
    if (rebound.status !== 'saved') throw new Error('rebind');
    const revised = await operations.reviseCourse({
      projectId: project.id,
      requestId: 'request-03',
      proposal: { id: proposed.value.id, revision: proposed.value.revision },
      interviewRevision: rebound.record.revision,
      changes: { focus: 'More depth on attention.', depth: 'deep' },
      consent: 'acquire-learning-evidence',
    });
    expect(revised).toMatchObject({
      outcome: 'unavailable',
      retryable: true,
    });
    expect(
      (await operations.getLearningOnboarding({ projectId: project.id }))
        .proposal?.title,
    ).toBe('Transformers from sources');
    await operations.saveReadingResume({
      projectId: project.id,
      path: {
        pathId: 'path-xxxx',
        topicId: 'topic-xx',
        lessonId: 'lesson-x',
      },
      lessonTitle: 'Attention',
      projectGoal: project.goal,
    });
    expect(await operations.getContinueLearning()).toBeNull();
  });
});
