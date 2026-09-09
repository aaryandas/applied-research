import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { courseSuccess } from './learning-onboarding.fixtures';
import { LearningOnboardingRecords } from './learning-onboarding-records';
import { applyLearningOnboardingTables } from './learning-onboarding-schema';
import type { WorkspaceDatabase } from './workspace-schema';
import { WorkspaceStore } from './workspace-store';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'ar47-records-'));
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
  return { store, records, database: internals.database };
}

describe('learning onboarding records', () => {
  it('applies additive tables once without dropping an existing human profile', () => {
    const { records, database } = setup();
    const saved = records.saveProfile(0, {
      background: 'I have written Python services.  ',
      learningGoals: 'Implement attention, then LoRA.',
      priorKnowledge: 'I can train a small classifier.',
    });
    expect(saved.status).toBe('saved');
    applyLearningOnboardingTables(database);
    expect(records.getProfileView().profile?.background).toBe(
      'I have written Python services.  ',
    );
    expect(
      records.saveProfile(0, {
        background: 'changed',
        learningGoals: 'changed goals here',
        priorKnowledge: 'changed prior knowledge',
      }),
    ).toMatchObject({
      status: 'conflict',
      currentRevision: 1,
    });
  });

  it('does not treat incomplete AI columns as an assessment', () => {
    const { records } = setup();
    expect(records.getProfileView()).toEqual({
      profile: null,
      assessment: null,
    });
    records.saveProfile(0, {
      background: 'I have written Python services.  ',
      learningGoals: 'Implement attention, then LoRA.',
      priorKnowledge: 'I can train a small classifier.',
    });
    expect(records.getProfileView().assessment).toBeNull();
    records.saveAssessment({
      author: 'ai',
      summary: 'Diagnostic showed attention vocabulary.',
      observedGaps: [],
      masteryEstablished: false,
    });
    const view = records.getProfileView();
    expect(view.assessment).toEqual({
      author: 'ai',
      summary: 'Diagnostic showed attention vocabulary.',
      observedGaps: [],
      masteryEstablished: false,
    });
  });

  it('keeps interview bytes, pasted source, and proposal identity under transactions', () => {
    const { store, records } = setup();
    const project = store.create('Learn transformers from original sources.');
    const profile = records.saveProfile(0, {
      background: 'I have written Python services.  ',
      learningGoals: 'Implement attention, then LoRA.',
      priorKnowledge: 'I can train a small classifier.',
    });
    if (profile.status !== 'saved') throw new Error('profile');
    const draft = {
      projectId: project.id,
      goal: project.goal,
      focus: project.goal,
      depth: 'balanced' as const,
      profileRevision: profile.record.revision,
      sourceRevisionIds: [],
      seedDrafts: [],
      answers: [
        {
          promptId: 'diagnostic-01',
          answer: 'I am not sure yet how I would apply this.',
        },
      ],
      prompts: [],
    };
    const first = records.saveInterview(0, draft, null);
    expect(first.status).toBe('saved');
    expect(records.saveInterview(0, draft, '  excerpt  ')).toMatchObject({
      status: 'conflict',
      currentRevision: 1,
    });
    if (first.status !== 'saved') throw new Error('interview');
    const pasted = records.saveInterview(
      first.record.revision,
      draft,
      '  excerpt from a paper  ',
    );
    expect(pasted.status).toBe('saved');
    expect(records.getPastedSource(project.id)).toBe(
      '  excerpt from a paper  ',
    );
    const envelope = courseSuccess('request-01');
    const stored = {
      proposalId: '11111111-1111-4111-8111-111111111111',
      revision: 1,
      interviewRevision: 2,
      envelope,
      projection: {
        id: '11111111-1111-4111-8111-111111111111',
        revision: 1,
        projectId: project.id,
        interviewRevision: 2,
        title: envelope.syllabus.title,
        topics: envelope.syllabus.topics,
        capstone: envelope.syllabus.capstone,
        firstLesson: {
          stepId: envelope.firstLesson.stepId,
          title: envelope.firstLesson.source.title,
          text: 'preview',
        },
        sources: envelope.bibliography,
        gaps: envelope.gaps,
        sourceCoverage: envelope.sourceCoverage,
        personalization: envelope.personalization,
        acceptance: 'ready' as const,
      },
    };
    expect(records.replaceProposal(project.id, stored)).toBe(true);
    expect(
      records.replaceProposal(
        project.id,
        {
          ...stored,
          revision: 2,
          projection: { ...stored.projection, title: 'Next' },
        },
        { proposalId: stored.proposalId, revision: 99 },
      ),
    ).toBe(false);
    expect(records.getProposal(project.id)?.projection.title).toBe(
      envelope.syllabus.title,
    );
    expect(
      records.replaceProposal(
        project.id,
        {
          ...stored,
          revision: 2,
          projection: { ...stored.projection, revision: 2 },
        },
        { proposalId: stored.proposalId, revision: 1 },
      ),
    ).toBe(true);
    records.replaceMappings([]);
    expect(records.listMappings(project.id)).toEqual([]);
    records.replaceMappings([
      {
        projectId: project.id,
        pathId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        acceptedProposalId: stored.proposalId,
        acceptedProposalRevision: 2,
        remoteStepId: 'step-001',
        localTopicId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        localLessonId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        practiceDigest: null,
        sourceIds: ['openalex_W1'],
        practice: null,
      },
    ]);
    records.replaceMappings([]);
    expect(records.listMappings(project.id)).toHaveLength(1);
    records.insertAcceptance({
      projectId: project.id,
      proposal: { id: stored.proposalId, revision: 2 },
      pathId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      pathRevision: 1,
      firstLesson: {
        pathId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        pathRevision: 1,
        topicId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        lessonId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      },
      requestId: 'accept-01',
    });
    expect(records.snapshot(project.id).proposal).toBeNull();
    expect(records.getAcceptanceByRequest('accept-01')?.projectId).toBe(
      project.id,
    );
    expect(records.getResume()).toBeNull();
    records.saveResume({
      projectId: project.id,
      path: {
        pathId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        pathRevision: 1,
        topicId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        lessonId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      },
      sourceRevisionId: null,
      span: null,
      lessonTitle: 'Attention',
      projectGoal: project.goal,
    });
    expect(records.getResume()?.span).toBeNull();
    records.saveResume({
      projectId: project.id,
      path: {
        pathId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        pathRevision: 1,
        topicId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        lessonId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      },
      sourceRevisionId: 'revision-01',
      span: { start: 0, end: 9, quote: 'Attention' },
      lessonTitle: 'Attention',
      projectGoal: project.goal,
    });
    expect(records.getResume()?.span).toEqual({
      start: 0,
      end: 9,
      quote: 'Attention',
    });
  });
});
