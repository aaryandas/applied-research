import { describe, expect, it } from 'vitest';
import { EXPLANATION_ARTIFACT_CONTRACT_VERSION } from '../../contracts/explanation-artifacts';
import type { RetainedExplanation } from '../../contracts/explanation-artifacts';
import { projectRetainedClipView } from './explanation-clip-projection';

const sha256 = 'ab'.repeat(32);
const image =
  'manimcommunity/manim:v0.21.0@sha256:89ab433ce59134a4dcf351deb2511e067ab354393c0bb7d1859f3e8f0b2406a3';
const createdAt = '2026-09-09T08:00:00.000Z';
const explanationId = '21000000-0000-4000-8000-000000000001';
const attemptId = '22000000-0000-4000-8000-000000000001';
const artifactId = '24000000-0000-4000-8000-000000000001';
const projectId = '10000000-0000-4000-8000-000000000001';
const origin = {
  sourceRevisionId: '30000000-0000-4000-8000-000000000001',
  highlightId: '40000000-0000-4000-8000-000000000001',
};

function clipRecord(): RetainedExplanation {
  return {
    contractVersion: EXPLANATION_ARTIFACT_CONTRACT_VERSION,
    explanationId,
    projectId,
    origin,
    intent: 'visual',
    usefulAttemptId: attemptId,
    createdAt,
    updatedAt: createdAt,
    attempts: [
      {
        attemptId,
        explanationId,
        intent: 'visual',
        status: 'ready',
        requestedAt: createdAt,
        completedAt: createdAt,
        humanQuestion: {
          kind: 'app-authored',
          intent: 'explain-this-visually',
        },
        aiResponse: null,
        provenance: null,
        citations: [],
        plan: {
          status: 'supported',
          family: 'weighted-combination',
          parameters: {
            vectors: [
              [2, 1],
              [-1, 2],
            ],
            weights: [3, 1],
            labels: ['First vector', 'Second vector'],
          },
          stages: [{ name: 'Combine', seconds: 2 }],
          caption: 'Weighted sum of two vectors',
          copy: {
            role: 'untrusted-display-copy',
            title: 'Weights',
            quote: null,
          },
          sourceSupport: {
            kind: 'illustrative-assumption',
            note: 'Original geometry.',
          },
          rationale: {
            role: 'untrusted-display-copy',
            text: 'Shows a weighted combination.',
          },
        },
        result: {
          kind: 'clip',
          family: 'weighted-combination',
          assetVersion: 'original-manim-1',
          media: { kind: 'app-retained-media', artifactId },
          verified: {
            sha256,
            mediaType: 'video/mp4',
            bytes: 4096,
            width: 1280,
            height: 720,
            durationSeconds: 10,
            stages: [{ name: 'Combine', seconds: 2 }],
            renderer: {
              name: 'manim-community',
              version: '0.21.0',
              image,
            },
          },
        },
      },
    ],
  };
}

describe('projectRetainedClipView', () => {
  it('projects opaque media identity and plan endpoint without paths or account ids', () => {
    const view = projectRetainedClipView(clipRecord());
    expect(view).toMatchObject({
      mediaId: artifactId,
      recipe: 'weighted-combination',
      title: 'Weighted sum of two vectors',
      sha256,
      endpoint: [5, 5],
      origin: {
        projectId,
        sourceVersionId: origin.sourceRevisionId,
        questionId: null,
        lessonId: null,
      },
      timings: { queueMs: 0, computeMs: 0, verifyMs: 0, transferMs: 0 },
    });
    expect(JSON.stringify(view)).not.toContain('file:');
    expect(JSON.stringify(view)).not.toContain('http');
    expect(JSON.stringify(view)).not.toContain('accountId');
    const fromQuestion = clipRecord();
    fromQuestion.origin = {
      entry: {
        entryId: '50000000-0000-4000-8000-000000000001',
        revision: 1,
      },
      path: {
        pathId: '61000000-0000-4000-8000-000000000001',
        pathRevision: 1,
        topicId: '62000000-0000-4000-8000-000000000001',
        lessonId: '60000000-0000-4000-8000-000000000001',
      },
    };
    expect(projectRetainedClipView(fromQuestion)?.origin).toEqual({
      projectId,
      sourceVersionId: null,
      questionId: '50000000-0000-4000-8000-000000000001',
      lessonId: '60000000-0000-4000-8000-000000000001',
    });
  });

  it('projects a linear-transform endpoint from the retained plan', () => {
    const record = clipRecord();
    const attempt = record.attempts[0]!;
    record.attempts = [
      {
        ...attempt,
        plan: {
          status: 'supported',
          family: 'linear-transform',
          parameters: {
            matrix: [
              [2, 0],
              [0, 3],
            ],
            vector: [1, 1],
          },
          stages: [{ name: 'Map', seconds: 2 }],
          caption: 'A maps v',
          copy: {
            role: 'untrusted-display-copy',
            title: 'Map',
            quote: null,
          },
          sourceSupport: {
            kind: 'illustrative-assumption',
            note: 'Original geometry.',
          },
          rationale: {
            role: 'untrusted-display-copy',
            text: 'Shows Av.',
          },
        },
        result: {
          kind: 'clip',
          family: 'linear-transform',
          assetVersion: 'original-manim-1',
          media: { kind: 'app-retained-media', artifactId },
          verified:
            attempt.result?.kind === 'clip'
              ? attempt.result.verified
              : {
                  sha256,
                  mediaType: 'video/mp4',
                  bytes: 4096,
                  width: 1280,
                  height: 720,
                  durationSeconds: 10,
                  stages: [{ name: 'Map', seconds: 2 }],
                  renderer: {
                    name: 'manim-community',
                    version: '0.21.0',
                    image,
                  },
                },
        },
      },
    ];
    expect(projectRetainedClipView(record)).toMatchObject({
      recipe: 'linear-transform',
      endpoint: [2, 3],
      title: 'A maps v',
    });
  });

  it('does not invent a clip view for scenes or unsupported plans', () => {
    const scene: RetainedExplanation = {
      ...clipRecord(),
      attempts: [
        {
          ...clipRecord().attempts[0]!,
          result: {
            kind: 'scene',
            family: 'two-link-arm',
            assetVersion: 'original-geometry-1',
            initialParameters: {
              firstLength: 2,
              secondLength: 1.5,
              shoulderDegrees: 35,
              elbowDegrees: 40,
            },
          },
          plan: {
            status: 'supported',
            family: 'two-link-arm',
            parameters: {
              firstLength: 2,
              secondLength: 1.5,
              shoulderDegrees: 35,
              elbowDegrees: 40,
            },
            stages: [{ name: 'Reach', seconds: 2 }],
            caption: 'Reach',
            copy: {
              role: 'untrusted-display-copy',
              title: 'Reach',
              quote: null,
            },
            sourceSupport: {
              kind: 'illustrative-assumption',
              note: 'Original geometry.',
            },
            rationale: {
              role: 'untrusted-display-copy',
              text: 'Planar reach.',
            },
          },
        },
      ],
    };
    expect(projectRetainedClipView(scene)).toBeNull();
    const clipWithArmPlan: RetainedExplanation = {
      ...clipRecord(),
      attempts: [
        {
          ...clipRecord().attempts[0]!,
          plan: {
            status: 'supported',
            family: 'two-link-arm',
            parameters: {
              firstLength: 2,
              secondLength: 1.5,
              shoulderDegrees: 35,
              elbowDegrees: 40,
            },
            stages: [{ name: 'Reach', seconds: 2 }],
            caption: 'Reach',
            copy: {
              role: 'untrusted-display-copy',
              title: 'Reach',
              quote: null,
            },
            sourceSupport: {
              kind: 'illustrative-assumption',
              note: 'Original geometry.',
            },
            rationale: {
              role: 'untrusted-display-copy',
              text: 'Planar reach.',
            },
          },
        },
      ],
    };
    expect(projectRetainedClipView(clipWithArmPlan)).toBeNull();
    expect(
      projectRetainedClipView({
        ...clipRecord(),
        usefulAttemptId: null,
      }),
    ).toBeNull();
    expect(
      projectRetainedClipView({
        ...clipRecord(),
        attempts: [
          {
            ...clipRecord().attempts[0]!,
            plan: {
              status: 'unsupported',
              reason: 'unrelated-topic',
              textualContinuation: 'Read the surrounding paragraph.',
              practicalContinuation: 'Write a Note in your own words.',
            },
          },
        ],
      }),
    ).toBeNull();
  });
});
