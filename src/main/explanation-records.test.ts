import { afterEach, describe, expect, it } from 'vitest';
import {
  EXPLANATION_ARTIFACT_CONTRACT_VERSION,
  SCENE_ASSET_VERSION,
} from '../contracts/explanation-artifacts';
import { DEFAULT_ARM } from '../contracts/explanations';
import { WorkspaceStore } from './workspace-store';
import { openExplanationHarness } from './explanation-test-harness';
import type { RetainedExplanation } from '../contracts/explanation-artifacts';

const createdAt = '2026-09-09T08:00:00.000Z';
const sha256 =
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function explanation(
  harness: ReturnType<typeof openExplanationHarness>,
  overrides: Partial<RetainedExplanation> = {},
): RetainedExplanation {
  const attemptId = '22000000-0000-4000-8000-000000000001';
  const explanationId = '21000000-0000-4000-8000-000000000001';
  return {
    contractVersion: EXPLANATION_ARTIFACT_CONTRACT_VERSION,
    explanationId,
    projectId: harness.projectId,
    origin: {
      sourceRevisionId: harness.revisionId,
      highlightId: harness.highlightId,
    },
    intent: 'text',
    attempts: [
      {
        attemptId,
        explanationId,
        intent: 'text',
        status: 'ready',
        requestedAt: createdAt,
        completedAt: createdAt,
        humanQuestion: { kind: 'app-authored', intent: 'explain-this-passage' },
        aiResponse: {
          kind: 'ai',
          body: 'The passage describes a weighted combination.',
          nextAction: 'Try a small numeric example.',
        },
        provenance: {
          author: 'ai',
          provider: 'openrouter',
          providerRequestId: 'provreq01',
          model: 'google/gemini-3.8-flash',
          requestVersion: '2026-09-08',
          promptVersion: 'learning-v2-2026-09-09',
          createdAt,
          sourceRevisions: [
            {
              sourceId: harness.sourceId,
              revisionId: harness.revisionId,
              title: 'Attention notes',
              sha256,
              format: 'plain-text',
              canonicalizationVersion: 'workspace-plain-v1',
              acquiredAt: createdAt,
              provenance: { kind: 'human-imported', locator: null },
            },
          ],
        },
        citations: [
          {
            sourceId: harness.sourceId,
            revisionId: harness.revisionId,
            start: 0,
            end: harness.quote.length,
            quote: harness.quote,
          },
        ],
        plan: null,
        result: {
          kind: 'text-answer',
          body: 'The passage describes a weighted combination.',
          nextAction: 'Try a small numeric example.',
        },
      },
    ],
    usefulAttemptId: attemptId,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

describe('explanation records', () => {
  it('reopens the original highlight origin, not a similarly worded later passage', () => {
    const harness = openExplanationHarness();
    cleanups.push(() => harness.close());
    const record = explanation(harness);
    harness.records.saveExplanation(
      record,
      new Map([
        [
          record.attempts[0]!.attemptId,
          {
            kind: 'bounded-excerpt',
            sourceRevisionId: harness.revisionId,
            sha256: harness.records.resolveHighlight(
              harness.projectId,
              harness.highlightId,
            )!.version.sha256,
            start: 0,
            end: harness.quote.length,
            quote: harness.quote,
          },
        ],
      ]),
    );
    const resolved = harness.records.resolveHighlight(
      harness.projectId,
      harness.highlightId,
    );
    expect(resolved?.highlight.quote).toBe(harness.quote);
    expect(resolved?.version.revisionId).toBe(harness.revisionId);
    const found = harness.records.findByOrigin(
      harness.projectId,
      {
        sourceRevisionId: harness.revisionId,
        highlightId: harness.highlightId,
      },
      'text',
    );
    expect(found?.explanationId).toBe(record.explanationId);
    expect(
      harness.records.findByOrigin(
        harness.projectId,
        {
          sourceRevisionId: harness.revisionId,
          highlightId: '40000000-0000-4000-8000-000000000099',
        },
        'text',
      ),
    ).toBeNull();
  });

  it('scopes grounding deletes to one explanation and keeps a prior useful attempt', () => {
    const harness = openExplanationHarness();
    cleanups.push(() => harness.close());
    const first = explanation(harness);
    harness.records.saveExplanation(first, new Map());
    const secondId = '21000000-0000-4000-8000-000000000002';
    const secondAttempt = '22000000-0000-4000-8000-000000000002';
    const visual: RetainedExplanation = {
      ...first,
      explanationId: secondId,
      intent: 'visual',
      usefulAttemptId: secondAttempt,
      attempts: [
        {
          attemptId: secondAttempt,
          explanationId: secondId,
          intent: 'visual',
          status: 'ready',
          requestedAt: createdAt,
          completedAt: createdAt,
          humanQuestion: {
            kind: 'app-authored',
            intent: 'explain-this-visually',
          },
          aiResponse: null,
          provenance: first.attempts[0]!.provenance,
          citations: [],
          plan: {
            status: 'supported',
            family: 'two-link-arm',
            parameters: { ...DEFAULT_ARM },
            stages: [{ name: 'Reach', seconds: 2 }],
            caption: 'Two-link reach',
            copy: {
              role: 'untrusted-display-copy',
              title: 'Reach',
              quote: null,
            },
            sourceSupport: {
              kind: 'illustrative-assumption',
              note: 'Geometry is original, not a photograph of the source.',
            },
            rationale: {
              role: 'untrusted-display-copy',
              text: 'A two-link arm can show composition of rotations.',
            },
          },
          result: {
            kind: 'scene',
            family: 'two-link-arm',
            assetVersion: SCENE_ASSET_VERSION,
            initialParameters: { ...DEFAULT_ARM },
          },
        },
      ],
    };
    harness.records.saveExplanation(visual, new Map());
    expect(
      harness.records.loadExplanation(harness.projectId, first.explanationId)
        ?.usefulAttemptId,
    ).toBe(first.attempts[0]!.attemptId);
    expect(
      harness.records.loadExplanation(harness.projectId, secondId)?.intent,
    ).toBe('visual');
  });

  it('does not reopen WorkspaceStore after 0006 without the coordinator schema patch', () => {
    const harness = openExplanationHarness();
    cleanups.push(() => harness.close());
    expect(() => new WorkspaceStore(harness.path)).toThrow(
      /schema|column|table/i,
    );
  });
});
