import { describe, expect, it } from 'vitest';
import type { LearningPathContribution } from '../../contracts/learning-api.js';
import type { CoursePracticeBrief } from '../../contracts/learning-onboarding-api.js';
import { COURSE_PRACTICE_BRIEF_KIND } from '../../contracts/learning-onboarding-api.js';
import type { AcquiredSource } from '../../contracts/sourcing.js';
import {
  assembleOnboardingSyllabus,
  citationsForParagraph,
  diagnosticPersonalization,
} from './syllabus.js';

const citation = {
  sourceId: 'source-numpy01',
  revisionId: 'revision-numpy01',
  start: 0,
  end: 8,
  quote: 'Softmax.',
};

function practiceBrief(
  extra: Partial<CoursePracticeBrief> = {},
): CoursePracticeBrief {
  return {
    kind: COURSE_PRACTICE_BRIEF_KIND,
    author: 'ai',
    masteryEstablished: false,
    intendedOutcome:
      extra.intendedOutcome ??
      'Reproduce the numbered CS231n softmax method in NumPy.',
    setup:
      extra.setup ??
      'Open a local NumPy environment with the cited classifier passage visible.',
    tool: extra.tool ?? {
      kind: 'learner-external',
      toolName: 'Python with NumPy',
      intendedUse:
        'Implement the cited classifier or network using only the numbered source method.',
    },
    instructions:
      extra.instructions ??
      'Implement the cited classifier using only the numbered source method.',
    observableCheckpoints: extra.observableCheckpoints ?? [
      'The NumPy implementation matches the cited softmax update.',
      'The cited classifier method is visible in the learner-produced artifact.',
    ],
    expectedArtifact:
      extra.expectedArtifact ??
      'A NumPy script that implements the cited softmax classifier without extra layers.',
    reflectionPrompt:
      extra.reflectionPrompt ??
      'Which cited constraint actually limited the softmax implementation?',
    sourceIds: extra.sourceIds ?? ['source-numpy01'],
  };
}

function step(
  title: string,
  extra: Partial<LearningPathContribution['steps'][number]> & {
    role?: 'concept' | 'setup' | 'practice' | 'capstone';
    practice?: CoursePracticeBrief | null;
  } = {},
): LearningPathContribution['steps'][number] {
  return {
    title,
    objective: extra.objective ?? `Objective for ${title}`,
    activity: extra.activity ?? `Activity for ${title}`,
    citations: extra.citations ?? [citation],
    ...(extra.role ? { role: extra.role } : {}),
    ...(extra.practice !== undefined ? { practice: extra.practice } : {}),
  };
}

function acquired(title: string, kind = 'chapter'): AcquiredSource {
  return {
    sourceId: 'source-numpy01',
    kind: kind as AcquiredSource['kind'],
    title,
    authorship: { kind: 'authored', creators: ['CS231n'] },
    providerIds: [{ provider: 'curated-catalog', id: 'cs231n-numpy' }],
    scholarlyIdentity: { doi: null, arxivId: null },
    originalLocation: {
      url: 'https://cs231n.github.io/neural-networks-1/',
      trust: 'untrusted-public-url',
    },
    acquisitionLocation: {
      url: 'https://cs231n.github.io/neural-networks-1/',
      trust: 'untrusted-public-url',
    },
    publicationDate: null,
    discoveredAt: '2026-09-09T00:00:00.000Z',
    metadataSummary: null,
    relationships: [],
    usePolicy: {
      access: 'public',
      accessEvidenceUrl: 'https://cs231n.github.io/',
      license: { status: 'unknown' },
      acquisition: {
        status: 'permitted',
        basis: 'license',
        evidenceUrl: 'https://cs231n.github.io/',
      },
      indexing: {
        status: 'permitted',
        basis: 'license',
        evidenceUrl: 'https://cs231n.github.io/',
      },
    },
    content: {
      state: 'acquired',
      revision: {
        sourceId: 'source-numpy01',
        revisionId: 'revision-numpy01',
        title,
        canonicalText: 'Softmax. NumPy implements the cited classifier.',
        sha256: 'a'.repeat(64),
        format: 'plain-text',
        canonicalizationVersion: 'canonical-text-v1',
        acquiredAt: '2026-09-09T00:00:00.000Z',
        provenance: {
          kind: 'discovered',
          acquiredFromUrl: 'https://cs231n.github.io/neural-networks-1/',
          providerIdentity: { provider: 'curated-catalog', id: 'cs231n-numpy' },
          discoveredAt: '2026-09-09T00:00:00.000Z',
        },
        extraction: {
          method: 'structured-html-v1',
          coverage: 'complete',
          note: null,
        },
      },
    },
  };
}

describe('onboarding syllabus projection', () => {
  it('uses explicit generated roles and does not infer capstone from source titles', () => {
    const path: LearningPathContribution = {
      kind: 'learning-path',
      title: 'Unrelated quadrature notes',
      steps: [
        step('Hardware fractions', { role: 'concept', practice: null }),
        step('Compare two cited editions', {
          role: 'concept',
          practice: null,
        }),
      ],
    };
    const syllabus = assembleOnboardingSyllabus({
      path,
      acquired: [acquired('Numerical integration')],
      prior: null,
    });
    const lessons = syllabus.topics.flatMap((topic) => topic.lessons);
    expect(lessons.map((lesson) => lesson.role)).toEqual([
      'concept',
      'concept',
    ]);
    expect(syllabus.capstone).toBeNull();
    expect(lessons.every((lesson) => lesson.practice === null)).toBe(true);
  });

  it('marks capstone substantial only from a task-specific generated brief', () => {
    const path: LearningPathContribution = {
      kind: 'learning-path',
      title: 'CS231n softmax',
      steps: [
        step('Softmax as a classifier', { role: 'concept', practice: null }),
        step('Implement the cited softmax classifier', {
          role: 'practice',
          practice: practiceBrief(),
        }),
        step('Capstone: synthesize the cited network', {
          role: 'capstone',
          objective:
            'Combine the cited layers into one learner-produced classifier artifact.',
          practice: practiceBrief({
            intendedOutcome:
              'Combine the cited layers into one learner-produced classifier artifact.',
            instructions:
              'Produce an end-to-end NumPy artifact that demonstrates the cited method.',
            expectedArtifact:
              'An end-to-end NumPy classifier that composes the cited layers without extra architecture.',
            observableCheckpoints: [
              'The artifact composes the cited layers in source order.',
              'The cited softmax method is the only classifier used.',
            ],
          }),
        }),
      ],
    };
    const syllabus = assembleOnboardingSyllabus({
      path,
      acquired: [acquired('CS231n neural networks and NumPy softmax')],
      prior: null,
    });
    const lessons = syllabus.topics.flatMap((topic) => topic.lessons);
    expect(lessons.map((lesson) => lesson.role)).toEqual([
      'concept',
      'practice',
      'capstone',
    ]);
    expect(lessons[1]?.practice?.tool).toMatchObject({
      toolName: 'Python with NumPy',
    });
    expect(syllabus.capstone?.stepId).toBe(lessons[2]?.stepId);
    expect(syllabus.capstone?.substantial).toBe(true);
  });

  it('does not manufacture a generic capstone brief to satisfy substantial checks', () => {
    const path: LearningPathContribution = {
      kind: 'learning-path',
      title: 'CS231n softmax',
      steps: [
        step('Softmax as a classifier', { role: 'concept', practice: null }),
        step('Capstone: synthesize the cited network', {
          role: 'capstone',
          practice: null,
        }),
      ],
    };
    const syllabus = assembleOnboardingSyllabus({
      path,
      acquired: [acquired('Numerical integration')],
      prior: null,
    });
    const lessons = syllabus.topics.flatMap((topic) => topic.lessons);
    expect(lessons[1]?.role).toBe('concept');
    expect(lessons[1]?.practice).toBeNull();
    expect(syllabus.capstone).toBeNull();
  });

  it('does not keep a practice role when the generated brief is missing', () => {
    const path: LearningPathContribution = {
      kind: 'learning-path',
      title: 'CS231n softmax',
      steps: [
        step('Softmax as a classifier', { role: 'concept', practice: null }),
        step('Implement the cited softmax classifier', {
          role: 'practice',
          practice: null,
        }),
      ],
    };
    const syllabus = assembleOnboardingSyllabus({
      path,
      acquired: [acquired('CS231n neural networks and NumPy softmax')],
      prior: null,
    });
    const lessons = syllabus.topics.flatMap((topic) => topic.lessons);
    expect(lessons[1]?.role).toBe('concept');
    expect(lessons[1]?.practice).toBeNull();
  });

  it('attaches citations only when the quote appears in the paragraph', () => {
    expect(
      citationsForParagraph('Softmax. Apply the cited method.', [citation]),
    ).toEqual([citation]);
    expect(
      citationsForParagraph('This paragraph has no source quote.', [citation]),
    ).toEqual([]);
  });

  it('uses citation fallbacks and diagnostic gaps without claiming mastery', () => {
    const unmatched = assembleOnboardingSyllabus({
      path: {
        kind: 'learning-path',
        title: 'Uncited topic',
        steps: [
          {
            title: 'Hardware fractions',
            objective: 'Use the cited hardware-fraction constraint.',
            activity: 'Cite the binary-fraction sentence.',
            citations: [
              {
                sourceId: 'source-other',
                revisionId: 'revision-other',
                start: 0,
                end: 4,
                quote: 'Nope',
              },
            ],
            role: 'concept',
            practice: null,
          },
          step('Setup the comparison environment', {
            role: 'setup',
            practice: null,
          }),
        ],
      },
      acquired: [acquired('Floating-point hardware fractions')],
      prior: null,
    });
    expect(
      unmatched.topics.flatMap((topic) => topic.lessons)[0]?.sourceIds,
    ).toEqual(['source-numpy01']);
    expect(
      diagnosticPersonalization({
        goal: 'binary fractions',
        focus: 'hardware',
        answers: [],
      }).observedGaps,
    ).toEqual(['No diagnostic answer was supplied for this goal.']);
    expect(
      diagnosticPersonalization({
        goal: 'binary fractions',
        focus: 'hardware',
        answers: [{ answer: 'short' }],
      }).observedGaps[0],
    ).toMatch(/too brief/);
    expect(
      diagnosticPersonalization({
        goal: 'binary fractions',
        focus: 'hardware',
        answers: [
          {
            answer:
              'I already reproduced 0.1 + 0.2 in CPython and read the cited hardware-fraction paragraph.',
          },
        ],
      }).observedGaps[0],
    ).toMatch(/not mastery/);
  });
});
