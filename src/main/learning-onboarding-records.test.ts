import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { courseSuccess } from './learning-onboarding.fixtures';
import {
  LEGACY_REVIEWED_BASE_DIGEST,
  LearningOnboardingRecords,
} from './learning-onboarding-records';
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
    expect(
      records.getAdjustmentByProposedRequest('missing-request'),
    ).toBeNull();
    expect(
      records.getAdjustmentAcceptanceByRequest('missing-request'),
    ).toBeNull();
  });

  it('keeps accepted overlay A when proposing B and rolls back a failed accept transaction', () => {
    const { records, store } = setup();
    const project = store.create('Learn transformers from original sources.');
    const first = sampleRevision(project.id, 1, 'request-a');
    records.insertAdjustmentRevision(project.id, first);
    records.insertAdjustmentAcceptance({
      requestId: 'accept-a',
      projectId: project.id,
      adjustmentId: first.adjustmentId,
      adjustmentRevision: 1,
      reviewedBaseDigest: first.reviewedBaseDigest,
      resultingPathRevision: 1,
      acceptedAt: '2026-09-09T12:00:00.000Z',
    });
    const second = sampleRevision(project.id, 2, 'request-b');
    records.insertAdjustmentRevision(project.id, second);
    const snap = records.snapshot(project.id);
    expect(snap.acceptedAdjustment).toEqual({
      id: first.adjustmentId,
      revision: 1,
    });
    expect(snap.adjustment?.revision).toBe(2);
    expect(records.listAdjustmentRevisions(project.id)).toHaveLength(2);
    expect(() =>
      records.transaction((transaction) => {
        records.insertAdjustmentAcceptance(
          {
            requestId: 'accept-b',
            projectId: project.id,
            adjustmentId: second.adjustmentId,
            adjustmentRevision: 2,
            reviewedBaseDigest: second.reviewedBaseDigest,
            resultingPathRevision: 2,
            acceptedAt: '2026-09-09T12:01:00.000Z',
          },
          transaction,
        );
        throw new Error('stop after receipt write');
      }),
    ).toThrow('stop after receipt write');
    expect(
      records.getLatestAcceptedAdjustment(project.id)?.receipt.requestId,
    ).toBe('accept-a');
    expect(records.getPendingAdjustment(project.id)?.revision).toBe(2);
  });

  it('migrates stores without an adjustment table and preserves one legacy row', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ar47-migrate-'));
    const store = new WorkspaceStore(join(directory, 'workspace.sqlite'));
    const internals = store as unknown as {
      database: Database.Database;
      orm: WorkspaceDatabase;
    };
    cleanups.push(() => {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    });
    const project = store.create('Learn transformers from original sources.');
    internals.database.exec(
      readFileSync(
        join(import.meta.dirname, '../../drizzle/0005_learning_onboarding.sql'),
        'utf8',
      ),
    );
    internals.database.exec('DROP TABLE learning_adjustments');
    applyLearningOnboardingTables(internals.database);
    const empty = new LearningOnboardingRecords(internals.orm);
    expect(empty.listAdjustmentRevisions(project.id)).toEqual([]);
    expect(empty.snapshot(project.id).acceptedAdjustment).toBeNull();

    const legacyDir = mkdtempSync(join(tmpdir(), 'ar47-legacy-'));
    const legacyStore = new WorkspaceStore(join(legacyDir, 'workspace.sqlite'));
    const legacyInternals = legacyStore as unknown as {
      database: Database.Database;
      orm: WorkspaceDatabase;
    };
    cleanups.push(() => {
      legacyStore.close();
      rmSync(legacyDir, { recursive: true, force: true });
    });
    const legacyProject = legacyStore.create(
      'Learn transformers from original sources.',
    );
    legacyInternals.database.exec(
      readFileSync(
        join(import.meta.dirname, '../../drizzle/0005_learning_onboarding.sql'),
        'utf8',
      ),
    );
    const adjustmentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const envelope = JSON.stringify({
      outcome: 'success',
      requestId: 'legacy-adjust',
      adjustment: {
        patches: [
          {
            remoteStepId: 'step-002',
            field: 'practice',
            practice: { kind: 'kept' },
          },
        ],
      },
    });
    const projection = JSON.stringify({
      id: adjustmentId,
      revision: 1,
      patches: [{ remoteStepId: 'step-002', field: 'practice' }],
    });
    legacyInternals.database
      .prepare(
        `INSERT INTO learning_adjustments (
          project_id, adjustment_id, revision, accepted_proposal_id,
          accepted_proposal_revision, envelope_json, projection_json,
          accepted_at, request_id, updated_at
        ) VALUES (?, ?, 1, 'proposal-01', 1, ?, ?, ?, 'legacy-adjust', ?)`,
      )
      .run(
        legacyProject.id,
        adjustmentId,
        envelope,
        projection,
        '2026-09-09T12:00:00.000Z',
        '2026-09-09T12:00:00.000Z',
      );
    applyLearningOnboardingTables(legacyInternals.database);
    const migrated = new LearningOnboardingRecords(legacyInternals.orm);
    const history = migrated.listAdjustmentRevisions(legacyProject.id);
    expect(history).toHaveLength(1);
    expect(history[0]?.envelope.adjustment.patches[0]?.practice).toEqual({
      kind: 'kept',
    });
    expect(migrated.snapshot(legacyProject.id).acceptedAdjustment).toEqual({
      id: adjustmentId,
      revision: 1,
    });
    expect(migrated.getPendingAdjustment(legacyProject.id)).toBeNull();
    expect(
      legacyInternals.database
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'learning_adjustments'",
        )
        .get(),
    ).toBeUndefined();
  });
});

function sampleRevision(
  projectId: string,
  revision: number,
  requestId: string,
) {
  return {
    adjustmentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    revision,
    acceptedProposalId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    acceptedProposalRevision: 1,
    envelope: {
      outcome: 'success' as const,
      requestId,
      scope: 'accepted-course-adjustment' as const,
      adjustment: {
        acceptedProposal: {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          revision: 1,
        },
        summary: {
          author: 'ai' as const,
          summary: 'Pending tokenizer practice.',
          observedGaps: [],
          masteryEstablished: false as const,
        },
        focus: null,
        depth: null,
        patches: [],
        citations: [],
        reviewedBase: {
          pathRevision: 1,
          acceptedAdjustment: null,
          digest: LEGACY_REVIEWED_BASE_DIGEST,
        },
      },
      sources: [],
      bibliography: [],
      evidence: [],
      gaps: [],
      provenance: [],
      quota: {
        month: '2026-09',
        limitMicrousd: 1,
        committedMicrousd: 0,
        reservedMicrousd: 0,
        remainingMicrousd: 1,
      },
    },
    projection: {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      revision,
      projectId,
      acceptedProposal: {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        revision: 1,
      },
      title: 'Transformers from sources',
      summary: {
        author: 'ai' as const,
        summary: 'Pending tokenizer practice.',
        observedGaps: [] as string[],
        masteryEstablished: false as const,
      },
      focus: null,
      depth: null,
      patches: [],
      sources: [],
      gaps: [],
      acceptance: 'ready' as const,
      reviewedBase: {
        pathRevision: 1,
        acceptedAdjustment: null,
        digest: LEGACY_REVIEWED_BASE_DIGEST,
      },
    },
    proposedRequestId: requestId,
    reviewedPathRevision: 1,
    reviewedAcceptedAdjustment: null,
    reviewedBaseDigest: LEGACY_REVIEWED_BASE_DIGEST,
    proposedAt: '2026-09-09T12:00:00.000Z',
  };
}
