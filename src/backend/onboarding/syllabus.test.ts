import { describe, expect, it } from 'vitest';
import type { LearningPathContribution } from '../../contracts/learning-api.js';
import type { AcquiredSource } from '../../contracts/sourcing.js';
import {
  assembleOnboardingSyllabus,
  citationsForParagraph,
  lessonRoleFromContent,
  practiceToolFor,
} from './syllabus.js';

const citation = {
  sourceId: 'source-numpy01',
  revisionId: 'revision-numpy01',
  start: 0,
  end: 8,
  quote: 'Softmax.',
};

function step(
  title: string,
  extra: Partial<LearningPathContribution['steps'][number]> = {},
): LearningPathContribution['steps'][number] {
  return {
    title,
    objective: extra.objective ?? `Objective for ${title}`,
    activity: extra.activity ?? `Activity for ${title}`,
    citations: extra.citations ?? [citation],
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
  it('assigns roles from step content rather than position', () => {
    expect(
      lessonRoleFromContent(
        step('Hardware fractions'),
        'hardware fractions objective',
      ),
    ).toBe('concept');
    expect(
      lessonRoleFromContent(
        step('Implement the cited softmax classifier'),
        'implement softmax numpy',
      ),
    ).toBe('practice');
    expect(
      lessonRoleFromContent(
        step('Capstone: synthesize the cited network'),
        'capstone synthesize network',
      ),
    ).toBe('capstone');
    expect(
      lessonRoleFromContent(
        step('Summary of notation'),
        'summary of notation last step',
      ),
    ).toBe('concept');
  });

  it('selects topic-specific tools and does not default every topic to Python', () => {
    expect(
      practiceToolFor(
        'numpy softmax neural network cs231n',
        'Implement the cited softmax classifier',
      ),
    ).toMatchObject({
      kind: 'learner-external',
      toolName: 'Python with NumPy',
    });
    expect(
      practiceToolFor(
        'quantum angular momentum photon hamiltonian',
        'Work the cited identities',
      ),
    ).toMatchObject({
      kind: 'learner-external',
      toolName: 'Paper, pencil, and a scientific calculator',
    });
    expect(
      practiceToolFor('desmos graphing plot', 'Graph the cited curve'),
    ).toEqual({ kind: 'app-hosted-catalog', toolId: 'desmos-graphing' });
    expect(
      practiceToolFor(
        'softmax numpy neural plot',
        'Plot a softmax curve in numpy',
      ).kind,
    ).toBe('learner-external');
    const genericTool = practiceToolFor(
      'history of the printing press',
      'Compare two cited editions',
    );
    expect(genericTool).toMatchObject({
      kind: 'learner-external',
      toolName: 'Local tools required by Compare two cited editions',
    });
    if (genericTool.kind === 'learner-external') {
      expect(genericTool.toolName).not.toBe('Python and a local editor');
    }
  });

  it('attaches citations only when the quote appears in the paragraph', () => {
    expect(
      citationsForParagraph('Softmax. Apply the cited method.', [citation]),
    ).toEqual([citation]);
    expect(
      citationsForParagraph('This paragraph has no source quote.', [citation]),
    ).toEqual([]);
  });

  it('marks capstone substantial from the generated brief, not from position', () => {
    const path: LearningPathContribution = {
      kind: 'learning-path',
      title: 'CS231n softmax',
      steps: [
        step('Softmax as a classifier'),
        step('Implement the cited softmax classifier', {
          objective: 'Reproduce the numbered CS231n softmax method in NumPy.',
          activity:
            'Implement the cited classifier using only the numbered source method.',
        }),
        step('Capstone: synthesize the cited network', {
          objective:
            'Combine the cited layers into one learner-produced classifier artifact.',
          activity:
            'Produce an end-to-end NumPy artifact that demonstrates the cited method.',
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
    expect(lessons[0]?.role).not.toBe('capstone');
  });
});
